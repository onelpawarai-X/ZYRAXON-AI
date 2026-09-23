import { execFile, spawn, type ChildProcess } from "child_process"
import { promisify } from "util"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { fileURLToPath } from "url"

const execFileAsync = promisify(execFile)

export type HandlerResult = { ok: boolean; data?: unknown; error?: string }
export type HandlerArgs = Record<string, unknown>
export type Handler = (args: HandlerArgs) => Promise<HandlerResult>

const touchpointConfig = {
  scaleFactor: 1,
  fuzzyThreshold: 0.6,
  maxElements: 500,
  maxDepth: 10,
}

function err(message: string): HandlerResult {
  return { ok: false, error: message }
}

function ok(data: unknown): HandlerResult {
  return { ok: true, data }
}

function textArg(value: unknown): string {
  if (value === undefined || value === null) return ""
  return String(value)
}

function numArg(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function boolArg(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value === "true" || value === "1" || value === "yes") return true
    if (value === "false" || value === "0" || value === "no") return false
  }
  return fallback
}

function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64")
}

function psDecode(b64Text: string): string {
  return `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Text}'))`
}

function psJsonVar(name: string, value: unknown): string {
  return `$${name} = ${psDecode(b64(JSON.stringify(value ?? null)))} | ConvertFrom-Json`
}

function parseJsonOutput(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf("[")
    const objStart = trimmed.indexOf("{")
    const useStart = start >= 0 && (objStart < 0 || start < objStart) ? start : objStart
    if (useStart >= 0) {
      try {
        return JSON.parse(trimmed.slice(useStart))
      } catch {
        return trimmed
      }
    }
    return trimmed
  }
}

async function runPs(script: string, timeoutMs = 30000): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error(`This desktop action requires Windows (PowerShell); current platform is ${process.platform}`)
  }
  const { stdout } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, windowsHide: true },
  )
  return stdout.replace(/^﻿/, "")
}

const WIN32_PREAMBLE = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ZWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", EntryPoint="GetWindowLong")] public static extern int GetWindowLong32(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtr")] public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="SetWindowLong")] public static extern int SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtr")] public static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
  public static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex) {
    if (IntPtr.Size == 8) return GetWindowLongPtr64(hWnd, nIndex);
    return new IntPtr(GetWindowLong32(hWnd, nIndex));
  }
  public static IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong) {
    if (IntPtr.Size == 8) return SetWindowLongPtr64(hWnd, nIndex, dwNewLong);
    return new IntPtr(SetWindowLong32(hWnd, nIndex, dwNewLong.ToInt32()));
  }
}
"@
`

const PS_WINDOW_LIST = `
$procs = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 })
$out = @()
foreach ($p in $procs) {
  $r = New-Object ZWin+RECT
  [ZWin]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
  $out += [pscustomobject]@{
    pid = $p.Id
    handle = [int64]$p.MainWindowHandle
    handleString = $p.MainWindowHandle.ToString()
    title = $p.MainWindowTitle
    process = $p.ProcessName
    left = $r.Left
    top = $r.Top
    width = ($r.Right - $r.Left)
    height = ($r.Bottom - $r.Top)
  }
}
ConvertTo-Json -InputObject $out -Compress -Depth 4
`

function psResolveWindow(windowId: string, b64Title = false): string {
  const idB64 = b64(windowId)
  return `
function Resolve-ZWindow([string]$idRaw) {
  $procs = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 })
  if ($idRaw -match '^[0-9]+$') {
    $n = [int64]$idRaw
    $hit = $procs | Where-Object { [int64]$_.Id -eq $n -or [int64]$_.MainWindowHandle -eq $n } | Select-Object -First 1
    if ($hit) { return $hit }
    $all = @(Get-Process -Id $n -ErrorAction SilentlyContinue)
    if ($all.Count -gt 0 -and $all[0].MainWindowHandle -ne 0) { return $all[0] }
    return $null
  }
  $needle = ${psDecode(idB64)}
  $hit = $procs | Where-Object { $_.MainWindowTitle -and ($_.MainWindowTitle -like ('*' + $needle + '*')) } | Select-Object -First 1
  if ($hit) { return $hit }
  $hit = $procs | Where-Object { $_.ProcessName -like ('*' + $needle + '*') } | Select-Object -First 1
  if ($hit) { return $hit }
  return $null
}
$targetProc = Resolve-ZWindow '${windowId.replace(/'/g, "''")}'
if (-not $targetProc) { Write-Output 'ERROR:window-not-found'; exit 3 }
$hwnd = $targetProc.MainWindowHandle
`
}

const KEY_VK: Record<string, number> = {
  enter: 0x0d,
  return: 0x0d,
  tab: 0x09,
  escape: 0x1b,
  esc: 0x1b,
  space: 0x20,
  backspace: 0x08,
  delete: 0x2e,
  del: 0x2e,
  insert: 0x2d,
  ins: 0x2d,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  shift: 0x10,
  ctrl: 0x11,
  control: 0x11,
  alt: 0x12,
  win: 0x5b,
  meta: 0x5b,
  pause: 0x13,
  capslock: 0x14,
  numlock: 0x90,
  scrolllock: 0x91,
  printscreen: 0x2c,
}

function parseHotkey(keys: string): number[] {
  const parts = keys
    .split("+")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
  if (parts.length === 0) throw new Error("keys is required (example: ctrl+c)")
  return parts.map((k) => {
    const direct = KEY_VK[k]
    if (direct !== undefined) return direct
    if (k.length === 1) {
      const c = k.toUpperCase().charCodeAt(0)
      if ((c >= 65 && c <= 90) || (c >= 48 && c <= 57)) return c
    }
    if (/^f\d{1,2}$/.test(k)) {
      const n = Number.parseInt(k.slice(1), 10)
      if (n >= 1 && n <= 24) return 0x70 + n - 1
    }
    throw new Error(`Unknown key "${k}". Use letters, digits, F1-F24, or named keys (enter, tab, escape, arrows...).`)
  })
}

function singleKeyVk(keys: string): number[] {
  const trimmed = keys.trim().toLowerCase()
  if (trimmed.includes("+")) return parseHotkey(keys)
  if (trimmed.length === 1) {
    const c = keys.toUpperCase().charCodeAt(0)
    if ((c >= 65 && c <= 90) || (c >= 48 && c <= 57)) return [c]
  }
  return parseHotkey(keys)
}

function mouseButtonFlags(button: string): { down: number; up: number } {
  const b = (button || "left").toLowerCase()
  if (b === "right") return { down: 0x0008, up: 0x0010 }
  if (b === "middle") return { down: 0x0020, up: 0x0040 }
  return { down: 0x0002, up: 0x0004 }
}

function wheelDelta(raw: number): number {
  if (!Number.isFinite(raw)) return 0
  if (Math.abs(raw) <= 25) return Math.round(raw * 120)
  return Math.round(raw)
}

async function captureScreenRegion(rect?: { x: number; y: number; w: number; h: number }): Promise<{ base64: string; width: number; height: number; path: string }> {
  const rectLine = rect
    ? `$rect = New-Object System.Drawing.Rectangle(${Math.round(rect.x)}, ${Math.round(rect.y)}, ${Math.round(rect.w)}, ${Math.round(rect.h)})
$bmp = New-Object System.Drawing.Bitmap($rect.Width, $rect.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Location, [System.Drawing.Point]::Empty, $rect.Size)
$width = $rect.Width
$height = $rect.Height`
    : `$v = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap($v.Width, $v.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($v.X, $v.Y, 0, 0, $bmp.Size)
$width = $v.Width
$height = $v.Height`
  const script = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
${rectLine}
$path = Join-Path $env:TEMP ('zyraxon_shot_' + [guid]::NewGuid().ToString('N') + '.png')
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$bytes = [System.IO.File]::ReadAllBytes($path)
$enc = [Convert]::ToBase64String($bytes)
Write-Output ($path + '|' + $width + '|' + $height + '|' + $enc)`
  const out = await runPs(script, 20000)
  const firstPipe = out.indexOf("|")
  if (firstPipe < 0) throw new Error("Screenshot capture produced no output")
  const rest = out.slice(firstPipe + 1)
  const parts = rest.split("|")
  const filePath = parts[0]
  const width = Number(parts[1])
  const height = Number(parts[2])
  const base64 = parts.slice(3).join("|").trim()
  if (!base64) throw new Error("Screenshot capture returned empty image data")
  return { base64, width, height, path: filePath }
}

async function captureWindowPng(windowId: string): Promise<{ base64: string; width: number; height: number; path: string; pid?: number }> {
  const resolve = psResolveWindow(windowId)
  const script = `${WIN32_PREAMBLE}
Add-Type -AssemblyName System.Drawing
${resolve}
$r = New-Object ZWin+RECT
[ZWin]::GetWindowRect($hwnd, [ref]$r) | Out-Null
$w = [Math]::Max(1, $r.Right - $r.Left)
$h = [Math]::Max(1, $r.Bottom - $r.Top)
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[ZWin]::PrintWindow($hwnd, $hdc, 2) | Out-Null
$g.ReleaseHdc($hdc)
$path = Join-Path $env:TEMP ('zyraxon_win_' + [guid]::NewGuid().ToString('N') + '.png')
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$enc = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($path))
Write-Output ($path + '|' + $w + '|' + $h + '|' + [int64]$targetProc.Id + '|' + $enc)`
  const out = await runPs(script, 20000)
  const parts = out.split("|")
  if (parts.length < 5) throw new Error(out.includes("window-not-found") ? `Window not found: ${windowId}` : `Window capture failed: ${out.trim()}`)
  return {
    path: parts[0],
    width: Number(parts[1]),
    height: Number(parts[2]),
    pid: Number(parts[3]),
    base64: parts.slice(4).join("|").trim(),
  }
}

export async function captureScreenBase64(windowId?: string): Promise<{ base64: string; width: number; height: number; path: string }> {
  if (windowId) return captureWindowPng(windowId)
  return captureScreenRegion()
}

async function typeTextPs(text: string): Promise<HandlerResult> {
  if (!text) return err("text is required")
  const script = `${WIN32_PREAMBLE}
Add-Type -AssemblyName System.Windows.Forms
function Escape-SendKeys([string]$s) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $s.ToCharArray()) {
    if ($ch -in @('+','^','%','~','(',')','{','}','[',']')) {
      [void]$sb.Append('{').Append($ch).Append('}')
    } elseif ([int]$ch -eq 9) { [void]$sb.Append('{TAB}') }
    elseif ([int]$ch -eq 13) { }
    elseif ([int]$ch -eq 10) { [void]$sb.Append('{ENTER}') }
    else { [void]$sb.Append($ch) }
  }
  return $sb.ToString()
}
$wsh = New-Object -ComObject WScript.Shell
$raw = ${psDecode(b64(text))}
$wsh.SendKeys((Escape-SendKeys $raw))
Write-Output 'typed'`
  const out = await runPs(script, 20000)
  return ok({ typed: true, characters: [...text].length, output: out.trim() })
}

async function hotkeyPs(keys: string): Promise<HandlerResult> {
  const vks = parseHotkey(keys)
  const vkCsv = vks.join(",")
  const script = `${WIN32_PREAMBLE}
$vks = @(${vkCsv})
foreach ($vk in $vks) {
  [ZWin]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 25
}
for ($i = $vks.Length - 1; $i -ge 0; $i--) {
  [ZWin]::keybd_event([byte]$vks[$i], 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 25
}
Write-Output 'ok'`
  await runPs(script, 10000)
  return ok({ keys, virtualKeys: vks })
}

async function pressKeysPs(keys: string, repeat: number): Promise<HandlerResult> {
  const vks = singleKeyVk(keys)
  const vkCsv = vks.join(",")
  const times = Math.max(1, Math.min(repeat, 50))
  const script = `${WIN32_PREAMBLE}
$vks = @(${vkCsv})
for ($n = 0; $n -lt ${times}; $n++) {
  foreach ($vk in $vks) {
    [ZWin]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 15
    [ZWin]::keybd_event([byte]$vk, 0, 2, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 30
  }
}
Write-Output 'ok'`
  await runPs(script, 15000)
  return ok({ keys, repeat: times })
}

async function clickPs(x: number, y: number, button: string, double = false): Promise<HandlerResult> {
  const flags = mouseButtonFlags(button)
  const rounds = double ? 2 : 1
  const script = `${WIN32_PREAMBLE}
[ZWin]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
Start-Sleep -Milliseconds 30
for ($i = 0; $i -lt ${rounds}; $i++) {
  [ZWin]::mouse_event(${flags.down}, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 20
  [ZWin]::mouse_event(${flags.up}, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
}
Write-Output 'ok'`
  await runPs(script, 10000)
  return ok({ x, y, button: button || "left", double })
}

async function scrollPs(dy: number, dx: number): Promise<HandlerResult> {
  const wheel = wheelDelta(dy)
  const hwheel = wheelDelta(dx)
  const parts: string[] = []
  if (wheel !== 0) {
    parts.push(`[ZWin]::mouse_event(0x0800, 0, 0, [uint32]([int64](${wheel}) -band 0xffffffffL), [UIntPtr]::Zero)`)
  }
  if (hwheel !== 0) {
    parts.push(`[ZWin]::mouse_event(0x1000, 0, 0, [uint32]([int64](${hwheel}) -band 0xffffffffL), [UIntPtr]::Zero)`)
  }
  if (parts.length === 0) return err("dy or dx is required")
  const script = `${WIN32_PREAMBLE}
${parts.join("\n")}
Write-Output 'ok'`
  await runPs(script, 10000)
  return ok({ dy: wheel, dx: hwheel })
}

async function dragPs(x1: number, y1: number, x2: number, y2: number, button: string): Promise<HandlerResult> {
  const flags = mouseButtonFlags(button)
  const script = `${WIN32_PREAMBLE}
[ZWin]::SetCursorPos(${Math.round(x1)}, ${Math.round(y1)}) | Out-Null
Start-Sleep -Milliseconds 40
[ZWin]::mouse_event(${flags.down}, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
$steps = 25
for ($i = 1; $i -le $steps; $i++) {
  $nx = [int](${Math.round(x1)} + (${Math.round(x2)} - ${Math.round(x1)}) * $i / $steps)
  $ny = [int](${Math.round(y1)} + (${Math.round(y2)} - ${Math.round(y1)}) * $i / $steps)
  [ZWin]::SetCursorPos($nx, $ny) | Out-Null
  Start-Sleep -Milliseconds 12
}
[ZWin]::mouse_event(${flags.up}, 0, 0, 0, [UIntPtr]::Zero)
Write-Output 'ok'`
  await runPs(script, 15000)
  return ok({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, button: button || "left" })
}

async function focusWindowPs(windowId: string): Promise<HandlerResult> {
  const resolve = psResolveWindow(windowId)
  const script = `${WIN32_PREAMBLE}
${resolve}
[ZWin]::ShowWindow($hwnd, 9) | Out-Null
$okFg = [ZWin]::SetForegroundWindow($hwnd)
if (-not $okFg) {
  [ZWin]::ShowWindow($hwnd, 6) | Out-Null
  Start-Sleep -Milliseconds 80
  [ZWin]::ShowWindow($hwnd, 9) | Out-Null
  $okFg = [ZWin]::SetForegroundWindow($hwnd)
}
Write-Output (('focused=' + $okFg) + ';pid=' + [int64]$targetProc.Id + ';title=' + $targetProc.MainWindowTitle)`
  const out = await runPs(script, 10000)
  return ok({ windowId, focused: out.includes("focused=True"), info: out.trim() })
}

async function ocrRegionPs(region?: string): Promise<HandlerResult> {
  let rectLine = ""
  if (region && region !== "full") {
    const bits = region.split(",").map((s) => Number(s.trim()))
    if (bits.length !== 4 || bits.some((n) => !Number.isFinite(n))) {
      return err(`region must be "x,y,w,h" or "full" (got "${region}")`)
    }
    const [rx, ry, rw, rh] = bits.map((n) => Math.round(n))
    rectLine = `$rect = New-Object System.Drawing.Rectangle(${rx}, ${ry}, ${Math.max(1, rw)}, ${Math.max(1, rh)})
$bmp = New-Object System.Drawing.Bitmap($rect.Width, $rect.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Location, [System.Drawing.Point]::Empty, $rect.Size)`
  } else {
    rectLine = `$v = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap($v.Width, $v.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($v.X, $v.Y, 0, 0, $bmp.Size)`
  }
  const script = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
${rectLine}
$imgPath = Join-Path $env:TEMP ('zyraxon_ocr_' + [guid]::NewGuid().ToString('N') + '.png')
$bmp.Save($imgPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$tess = Get-Command tesseract -ErrorAction SilentlyContinue
if ($tess) {
  $tessOut = & $tess.Source $imgPath stdout -l eng 2>$null
  $joined = ($tessOut | Out-String).Trim()
  Write-Output ('ENGINE=tesseract' + [char]10 + $joined)
  exit 0
}
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
if (-not $asTask) { Write-Output 'ENGINE=error' + [char]10 + 'WinRT async bridge unavailable'; exit 4 }
function AwaitOp($op, $type) {
  $m = $asTask.MakeGenericMethod($type)
  $t = $m.Invoke($null, @($op))
  $t.Wait() | Out-Null
  return $t.Result
}
try {
  $file = AwaitOp ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $imgPath).Path)) ([Windows.Storage.StorageFile])
  $stream = AwaitOp ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = AwaitOp ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = AwaitOp ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if (-not $engine) { Write-Output ('ENGINE=error' + [char]10 + 'No Windows OCR language pack installed'); exit 5 }
  $result = AwaitOp ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  Write-Output ('ENGINE=windows-ocr' + [char]10 + $result.Text)
} catch {
  Write-Output ('ENGINE=error' + [char]10 + $_.Exception.Message)
  exit 6
}`
  const out = await runPs(script, 45000)
  const marker = out.indexOf("ENGINE=")
  const body = marker >= 0 ? out.slice(marker) : out
  const nl = body.indexOf("\n")
  const engineLine = nl >= 0 ? body.slice(0, nl) : body
  const content = nl >= 0 ? body.slice(nl + 1).trim() : ""
  if (engineLine.includes("ENGINE=error")) {
    return err(
      `OCR failed (${engineLine.trim()}). Install tesseract (winget install UB-Mannheim.TesseractOCR) or enable a Windows OCR language pack.`,
    )
  }
  return ok({ engine: engineLine.replace("ENGINE=", "").trim(), text: content, region: region || "full" })
}

async function cdpDebugPorts(): Promise<number[]> {
  const ports = new Set<number>([9222, 9223, 9224])
  if (process.platform === "win32") {
    try {
      const out = await runPs(
        `$ports = @()
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'chrome|msedge' } | ForEach-Object {
  if ($_.CommandLine -match '--remote-debugging-port=(\\d+)') { $ports += [int]$Matches[1] }
}
(($ports | Sort-Object -Unique) -join ',')`,
        8000,
      )
      for (const part of out.split(",")) {
        const n = Number.parseInt(part.trim(), 10)
        if (Number.isFinite(n)) ports.add(n)
      }
    } catch {
      // keep candidate ports
    }
  }
  return [...ports]
}

type CdpPage = { port: number; wsUrl: string; id: string; title: string; url: string }

async function findCdpPage(): Promise<CdpPage> {
  const problems: string[] = []
  for (const port of await cdpDebugPorts()) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2500) })
      if (!resp.ok) {
        problems.push(`port ${port}: HTTP ${resp.status}`)
        continue
      }
      const list = (await resp.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string; id?: string; title?: string; url?: string }>
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl)
      if (page?.webSocketDebuggerUrl && page.id) {
        return { port, wsUrl: page.webSocketDebuggerUrl, id: page.id, title: page.title || "", url: page.url || "" }
      }
      problems.push(`port ${port}: no page target with WebSocket URL`)
    } catch (e) {
      problems.push(`port ${port}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  throw new Error(
    `No Chrome/Edge DevTools page found (${problems.join("; ")}). Start Chrome with --remote-debugging-port=9222 or call x_cdp_connect first.`,
  )
}

async function cdpCall(wsUrl: string, method: string, params?: Record<string, unknown>, timeoutMs = 20000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
      return
    }
    let settled = false
    const msgId = 1
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        ws.close()
      } catch {
        // ignore
      }
      reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        // ignore
      }
      fn()
    }
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: msgId, method, params: params ?? {} }))
    }
    ws.onmessage = (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : String(event.data)
        const msg = JSON.parse(raw) as { id?: number; result?: unknown; error?: { message?: string } }
        if (msg.id !== msgId) return
        if (msg.error) {
          settle(() => reject(new Error(`CDP ${method}: ${msg.error?.message || "unknown error"}`)))
          return
        }
        settle(() => resolve(msg.result))
      } catch (e) {
        settle(() => reject(e instanceof Error ? e : new Error(String(e))))
      }
    }
    ws.onerror = () => settle(() => reject(new Error(`CDP WebSocket error during ${method}`)))
    ws.onclose = () => settle(() => reject(new Error(`CDP WebSocket closed before ${method} response`)))
  })
}

async function withCdp<T>(fn: (page: CdpPage) => Promise<T>): Promise<T> {
  const page = await findCdpPage()
  return fn(page)
}

async function cdpEvaluate(page: CdpPage, expression: string, awaitPromise = false): Promise<unknown> {
  const result = (await cdpCall(page.wsUrl, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  })) as { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } }
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "script threw"
    throw new Error(description)
  }
  return result.result?.value
}

async function cdpWaitForLoad(page: CdpPage, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const state = await cdpEvaluate(page, "document.readyState")
      if (state === "complete" || state === "interactive") return
    } catch {
      // page may be navigating
    }
    await new Promise((r) => setTimeout(r, 250))
  }
}

type McpMessage = { jsonrpc: string; id?: number; method?: string; params?: unknown; result?: unknown; error?: { code?: number; message?: string } }

class TouchpointMcpClient {
  private proc: ChildProcess
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private buffer = ""
  toolNames = new Set<string>()

  constructor(entry: { cmd: string; args: string[] }) {
    this.proc = spawn(entry.cmd, entry.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
    this.proc.stdout?.setEncoding("utf8")
    this.proc.stdout?.on("data", (chunk: string) => this.onData(chunk))
    this.proc.stderr?.on("data", () => {
      // drain MCP server logs
    })
    const fail = (e: Error) => {
      for (const [, p] of this.pending) p.reject(e)
      this.pending.clear()
    }
    this.proc.on("error", (e) => fail(new Error(`Touchpoint MCP spawn failed: ${e.message}`)))
    this.proc.on("exit", (code) => fail(new Error(`Touchpoint MCP exited with code ${code ?? "unknown"}`)))
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let idx = this.buffer.indexOf("\n")
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      idx = this.buffer.indexOf("\n")
      if (!line) continue
      try {
        const msg = JSON.parse(line) as McpMessage
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!
          this.pending.delete(msg.id)
          if (msg.error) p.reject(new Error(msg.error.message || `MCP error ${msg.error.code ?? ""}`))
          else p.resolve(msg.result)
        }
      } catch {
        // ignore non-JSON noise
      }
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.proc.stdin || this.proc.stdin.destroyed) throw new Error("Touchpoint MCP stdin closed")
    this.proc.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private request(method: string, params?: unknown, timeoutMs = 30000): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Touchpoint MCP ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      try {
        this.send({ jsonrpc: "2.0", id, method, params })
      } catch (e) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  async initialize(): Promise<Set<string>> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "zyraxon-x-registry", version: "1.0.0" },
    })
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" })
    const result = (await this.request("tools/list", {}, 30000)) as { tools?: Array<{ name?: string }> }
    const names = new Set<string>()
    for (const tool of result.tools ?? []) {
      if (tool.name) names.add(tool.name)
    }
    this.toolNames = names
    return names
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request("tools/call", { name, arguments: args }, 45000)
  }

  close(): void {
    try {
      this.proc.stdin?.end()
    } catch {
      // ignore
    }
    try {
      this.proc.kill()
    } catch {
      // ignore
    }
  }
}

function resolveTouchpointEntry(): { cmd: string; args: string[] } | null {
  const candidates: string[] = []
  const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath
  if (resourcesPath) candidates.push(path.join(resourcesPath, "touchpoint-mcp"))
  candidates.push(path.join(process.cwd(), "packages", "desktop", "resources", "touchpoint-mcp"))
  let walk = process.cwd()
  for (let i = 0; i < 6; i++) {
    candidates.push(path.join(walk, "packages", "desktop", "resources", "touchpoint-mcp"))
    candidates.push(path.join(walk, "resources", "touchpoint-mcp"))
    const parent = path.dirname(walk)
    if (parent === walk) break
    walk = parent
  }
  const here = path.dirname(fileURLToPath(import.meta.url))
  candidates.push(path.join(here, "..", "..", "..", "desktop", "resources", "touchpoint-mcp"))
  for (const dir of candidates) {
    const cjs = path.join(dir, "touchpoint-mcp.cjs")
    if (fs.existsSync(cjs)) return { cmd: process.execPath, args: [cjs] }
    const py = path.join(dir, "run.py")
    if (fs.existsSync(py)) return { cmd: "python", args: [py] }
  }
  return null
}

let touchpointMcp: Promise<TouchpointMcpClient | null> | null = null

async function ensureTouchpointMcp(): Promise<TouchpointMcpClient | null> {
  if (!touchpointMcp) {
    touchpointMcp = (async () => {
      const entry = resolveTouchpointEntry()
      if (!entry) return null
      try {
        const client = new TouchpointMcpClient(entry)
        const tools = await client.initialize()
        if (tools.size === 0) {
          client.close()
          return null
        }
        return client
      } catch {
        return null
      }
    })()
  }
  return touchpointMcp
}

const MCP_BOOL_KEYS = new Set(["tree", "gone", "fullscreen", "replace", "named_only", "all_elements", "probe"])
const MCP_NUM_KEYS = new Set([
  "max_depth",
  "max_results",
  "occurrence",
  "repeat",
  "timeout",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "start",
  "end",
  "dx",
  "dy",
  "scale_factor",
  "fuzzy_threshold",
  "max_elements",
])

function coerceMcpArgs(args: HandlerArgs): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === "") continue
    if (MCP_BOOL_KEYS.has(key)) {
      out[key] = boolArg(value, false)
      continue
    }
    if (MCP_NUM_KEYS.has(key) && typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      out[key] = Number(value)
      continue
    }
    out[key] = value
  }
  return out
}

function extractMcpText(result: unknown): string | null {
  if (result === null || result === undefined) return null
  if (typeof result === "string") return result
  const obj = result as { content?: Array<{ type?: string; text?: string }>; text?: string }
  if (typeof obj.text === "string") return obj.text
  if (Array.isArray(obj.content)) {
    const texts = obj.content.filter((c) => typeof c.text === "string").map((c) => c.text as string)
    if (texts.length > 0) return texts.join("\n")
  }
  return null
}

function normalizeMcpResult(result: unknown): HandlerResult {
  const text = extractMcpText(result)
  const isError = Boolean((result as { isError?: boolean } | null)?.isError)
  if (text === null) {
    if (isError) return err("Touchpoint MCP tool failed with no message")
    if (result && typeof result === "object") return ok(result)
    return err("Touchpoint MCP returned an empty result")
  }
  if (isError) return err(text)
  try {
    const parsed = JSON.parse(text) as unknown
    return ok(parsed)
  } catch {
    return ok({ text })
  }
}

async function withTouchpointMcp(id: string, args: HandlerArgs, fallback: Handler): Promise<HandlerResult> {
  const client = await ensureTouchpointMcp()
  if (client) {
    try {
      const name = id.startsWith("tp_") ? id.slice(3) : id
      if (!client.toolNames.has(name)) throw new Error(`MCP server does not expose ${name}`)
      const result = await client.callTool(name, coerceMcpArgs(args))
      return normalizeMcpResult(result)
    } catch {
      // fall through to local implementation
    }
  }
  return fallback(args)
}

const UIA_LIB = `
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ZWinUia {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
"@
function Convert-ZElement($el) {
  $c = $el.Current
  $r = $c.BoundingRectangle
  $rid = ($el.GetRuntimeId() -join '.')
  $procId = $c.ProcessId
  $hwnd = [int64]0
  try {
    $p = Get-Process -Id $procId -ErrorAction Stop
    $hwnd = [int64]$p.MainWindowHandle
  } catch {}
  $value = $null
  try {
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp) { $value = $vp.Current.Value }
  } catch {}
  $role = ''
  try { $role = ($c.ControlType.ProgrammaticName -replace 'ControlType\\.', '') } catch {}
  return [pscustomobject]@{
    element_id = ($hwnd.ToString() + '_' + $rid)
    name = $c.Name
    role = $role
    automation_id = $c.AutomationId
    class_name = $c.ClassName
    enabled = $c.IsEnabled
    offscreen = $c.IsOffscreen
    x = [int]$r.X
    y = [int]$r.Y
    width = [int]$r.Width
    height = [int]$r.Height
    value = $value
    process_id = $procId
    hwnd = $hwnd
    runtime_id = $rid
  }
}
function Get-ZElementByRid([string]$elementId) {
  $sep = $elementId.IndexOf('_')
  if ($sep -lt 1) { return $null }
  $hwndStr = $elementId.Substring(0, $sep)
  $rid = $elementId.Substring($sep + 1)
  $hwnd = [IntPtr]::new([int64]$hwndStr)
  $win = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
  $stack = New-Object System.Collections.Stack
  $stack.Push($win)
  $visited = 0
  while ($stack.Count -gt 0 -and $visited -lt 25000) {
    $el = $stack.Pop()
    $visited++
    $er = ''
    try { $er = ($el.GetRuntimeId() -join '.') } catch {}
    if ($er -eq $rid) { return $el }
    $children = @()
    try {
      $child = $walker.GetFirstChild($el)
      while ($child -and $children.Count -lt 400) {
        $children += $child
        $child = $walker.GetNextSibling($child)
      }
    } catch {}
    for ($i = $children.Count - 1; $i -ge 0; $i--) { $stack.Push($children[$i]) }
  }
  return $null
}
function Get-ZWindows([string]$appFilter, [string]$windowFilter) {
  $desktop = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = [System.Windows.Automation.Condition]::TrueCondition
  $wins = $desktop.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
  $out = @()
  foreach ($w in $wins) {
    $info = Convert-ZElement $w
    if ($windowFilter -and $info.element_id -ne $windowFilter -and $info.hwnd.ToString() -ne $windowFilter -and -not ($info.name -like ('*' + $windowFilter + '*'))) { continue }
    if ($appFilter) {
      $pn = ''
      try { $pn = (Get-Process -Id $info.process_id -ErrorAction Stop).ProcessName } catch {}
      $pn2 = ''
      try { $pn2 = (Get-Process -Id $info.process_id -ErrorAction Stop).ProcessName } catch {}
      if ($pn -notlike ('*' + $appFilter + '*') -and $info.name -notlike ('*' + $appFilter + '*') -and $pn2 -notlike ('*' + $appFilter + '*')) { continue }
    }
    $out += $info
  }
  return $out
}
function Get-ZScore([string]$hay, [string]$needle) {
  if (-not $needle) { return 0 }
  $h = $hay.ToLowerInvariant()
  $n = $needle.ToLowerInvariant()
  if ($h -eq $n) { return 1.0 }
  if ($h.Contains($n)) { return 0.85 }
  $hn = ($h -replace '[^a-z0-9]', '')
  $nn = ($n -replace '[^a-z0-9]', '')
  if ($hn -and $nn -and $hn.Contains($nn)) { return 0.75 }
  return 0.0
}
`

function psUiaWalkBody(): string {
  return `
$cfgMax = [int]${touchpointConfig.maxElements}
$cfgDepth = [int]${touchpointConfig.maxDepth}
$walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
$results = New-Object System.Collections.ArrayList
function Walk-ZNode($node, $depth, $path) {
  if ($results.Count -ge $cfgMax) { return }
  if ($depth -gt $cfgDepth) { return }
  $info = $null
  try { $info = Convert-ZElement $node } catch { return }
  if ($roleFilter -and $info.role -and ($info.role -ne $roleFilter) -and ($info.role -ine $roleFilter)) { return }
  [void]$results.Add([pscustomobject]@{ info = $info; depth = $depth; path = $path })
  $children = @()
  try {
    $child = $walker.GetFirstChild($node)
    while ($child -and $children.Count -lt 300) {
      $children += $child
      $child = $walker.GetNextSibling($child)
    }
  } catch {}
  for ($i = 0; $i -lt $children.Count; $i++) {
    Walk-ZNode $children[$i] ($depth + 1) ($path + '.' + $i)
  }
}
$windows = @(Get-ZWindows $appFilter $windowFilter)
foreach ($w in $windows) {
  $wEl = $null
  try { $wEl = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]::new([int64]$w.hwnd)) } catch {}
  if (-not $wEl) { continue }
  Walk-ZNode $wEl 0 ('w' + $w.hwnd)
  if ($results.Count -ge $cfgMax) { break }
}
`
}

async function uiaElements(args: HandlerArgs, mode: "elements" | "find" | "snapshot"): Promise<HandlerResult> {
  const appFilter = textArg(args.app)
  const windowFilter = textArg(args.window_id)
  const roleFilter = textArg(args.role).toLowerCase()
  const query = textArg(args.query)
  const tree = boolArg(args.tree, mode === "snapshot")
  const maxDepth = Math.max(1, Math.min(numArg(args.max_depth, touchpointConfig.maxDepth), 40))
  const threshold = touchpointConfig.fuzzyThreshold

  let script = `${UIA_LIB}
${psJsonVar("PARAMS", { appFilter, windowFilter, roleFilter, query, tree, maxDepth })}
$appFilter = [string]$PARAMS.appFilter
$windowFilter = [string]$PARAMS.windowFilter
$roleFilter = [string]$PARAMS.roleFilter
$wantTree = [bool]$PARAMS.tree
$cfgDepth = [int]$PARAMS.maxDepth
${psUiaWalkBody()}
`
  if (mode === "find") {
    script += `
$threshold = [double]${threshold}
$matches = @()
foreach ($row in $results) {
  $score = Get-ZScore ([string]$row.info.name) $query
  $score2 = Get-ZScore ([string]$row.info.automation_id) $query
  $best = [Math]::Max($score, $score2)
  if ($best -ge $threshold) {
    $matches += [pscustomobject]@{ score = $best; depth = $row.depth }
    $matches[-1] | Add-Member -NotePropertyName element -NotePropertyValue $row.info -Force
  }
}
$ordered = @($matches | Sort-Object -Property score -Descending | Select-Object -First 50 | ForEach-Object { $_.element })
if (-not $query) { $ordered = @($results | Select-Object -First 50 | ForEach-Object { $_.info }) }
ConvertTo-Json -InputObject @{ query = $query; count = @($ordered).Count; matches = @($ordered) } -Compress -Depth 6
`
  } else if (mode === "snapshot") {
    script += `
$flat = @($results | ForEach-Object { $_.info })
ConvertTo-Json -InputObject @{ count = @($flat).Count; elements = @($flat) } -Compress -Depth 6
`
  } else {
    script += `
$flat = @($results | ForEach-Object { [pscustomobject]@{ depth = $_.depth; path = $_.path; element = $_.info } })
if ($wantTree) {
  ConvertTo-Json -InputObject @{ count = @($flat).Count; tree = @($flat) } -Compress -Depth 8
} else {
  ConvertTo-Json -InputObject @{ count = @($flat).Count; elements = @($flat | ForEach-Object { $_.element }) } -Compress -Depth 6
}
`
  }
  try {
    const out = await runPs(script, 45000)
    return ok(parseJsonOutput(out))
  } catch (e) {
    return err(`Accessibility walk failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function uiaGetElement(elementId: string): Promise<HandlerResult> {
  const script = `${UIA_LIB}
${psJsonVar("EID", elementId)}
$el = Get-ZElementByRid ([string]$EID)
if (-not $el) { Write-Output 'ERROR:element-not-found'; exit 3 }
ConvertTo-Json -InputObject (Convert-ZElement $el) -Compress -Depth 5`
  try {
    const out = await runPs(script, 30000)
    if (out.includes("element-not-found")) return err(`Element not found: ${elementId}`)
    return ok(parseJsonOutput(out))
  } catch (e) {
    return err(`get_element failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function uiaElementAt(x: number, y: number): Promise<HandlerResult> {
  const script = `${UIA_LIB}
$point = New-Object System.Windows.Point(${Math.round(x)}, ${Math.round(y)})
$el = [System.Windows.Automation.AutomationElement]::FromPoint($point)
if (-not $el) { Write-Output 'ERROR:no-element'; exit 3 }
ConvertTo-Json -InputObject (Convert-ZElement $el) -Compress -Depth 5`
  try {
    const out = await runPs(script, 20000)
    if (out.includes("no-element")) return err(`No accessibility element at (${x}, ${y})`)
    return ok(parseJsonOutput(out))
  } catch (e) {
    return err(`element_at failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function uiaActionByElement(elementId: string, action: "invoke" | "double" | "right" | "focus" | "value" | "numeric" | "read" | "raw", extra?: { value?: string; numeric?: number; actionName?: string; replace?: boolean }): Promise<HandlerResult> {
  const eid = elementId
  if (!eid) return err("element_id is required")
  let body = ""
  if (action === "invoke" || action === "double" || action === "right") {
    const clickFlag = action === "right" ? 0x0010 : 0x0004
    const downFlag = action === "right" ? 0x0008 : 0x0002
    body = `
$invoked = $false
try {
  $ip = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  if ($ip -and '${action}' -ne 'right') { $ip.Invoke(); $invoked = $true }
} catch {}
if (-not $invoked) {
  $r = $el.Current.BoundingRectangle
  if ($r.Width -le 0 -or $r.Height -le 0) { Write-Output 'ERROR:element-not-clickable'; exit 4 }
  $cx = [int]($r.X + ($r.Width / 2))
  $cy = [int]($r.Y + ($r.Height / 2))
  [ZWinUia]::SetCursorPos($cx, $cy) | Out-Null
  Start-Sleep -Milliseconds 40
  [ZWinUia]::mouse_event(${downFlag}, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 30
  [ZWinUia]::mouse_event(${clickFlag}, 0, 0, 0, [UIntPtr]::Zero)
  if ('${action}' -eq 'double') {
    Start-Sleep -Milliseconds 40
    [ZWinUia]::mouse_event(${downFlag}, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 30
    [ZWinUia]::mouse_event(${clickFlag}, 0, 0, 0, [UIntPtr]::Zero)
  }
}
Write-Output ('{"ok":true,"method":"' + $(if ($invoked) { 'invoke' } else { 'mouse' }) + '"}')`
  } else if (action === "focus") {
    body = `
$el.SetFocus()
Write-Output '{"ok":true,"method":"set-focus"}'`
  } else if (action === "value") {
    const valueB64 = b64(extra?.value ?? "")
    body = `
$vp = $null
try { $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern) } catch {}
if (-not $vp) { Write-Output 'ERROR:no-value-pattern'; exit 5 }
$newVal = ${psDecode(valueB64)}
if ([bool]$PARAMS.replace) { $vp.SetValue($newVal) } else { $vp.SetValue(([string]$vp.Current.Value) + $newVal) }
Write-Output '{"ok":true,"method":"value"}'`
  } else if (action === "numeric") {
    body = `
$rp = $null
try { $rp = $el.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern) } catch {}
if (-not $rp) { Write-Output 'ERROR:no-range-pattern'; exit 5 }
$rp.SetValue([double]$PARAMS.numeric)
Write-Output '{"ok":true,"method":"range-value"}'`
  } else if (action === "read") {
    body = `
$parts = @()
try { if ($el.Current.Name) { $parts += ('name=' + $el.Current.Name) } } catch {}
try {
  $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  if ($vp -and $vp.Current.Value) { $parts += ('value=' + $vp.Current.Value) }
} catch {}
try {
  $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
  if ($tp) { $parts += ('text=' + $tp.DocumentRange.GetText(-1)) }
} catch {}
if ($parts.Count -eq 0) { Write-Output 'ERROR:no-text'; exit 6 }
ConvertTo-Json -InputObject @{ text = ($parts -join [char]10); parts = $parts } -Compress`
  } else {
    const actionName = extra?.actionName || ""
    body = `
$an = ${psDecode(b64(actionName))}
$done = $false
$anLower = $an.ToLowerInvariant()
if ($anLower -in @('invoke','click','press')) {
  try { $ip = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern); if ($ip) { $ip.Invoke(); $done = $true } } catch {}
} elseif ($anLower -in @('toggle')) {
  try { $tp2 = $el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern); if ($tp2) { $tp2.Toggle(); $done = $true } } catch {}
} elseif ($anLower -in @('expand','expandcollapse')) {
  try { $ep = $el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern); if ($ep) { $ep.Expand(); $done = $true } } catch {}
} elseif ($anLower -in @('collapse')) {
  try { $ep = $el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern); if ($ep) { $ep.Collapse(); $done = $true } } catch {}
} elseif ($anLower -in @('select','add_to_selection')) {
  try { $sp = $el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern); if ($sp) { $sp.Select(); $done = $true } } catch {}
} elseif ($anLower -eq 'remove_from_selection') {
  try { $sp = $el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern); if ($sp) { $sp.RemoveFromSelection(); $done = $true } } catch {}
} elseif ($anLower.StartsWith('value:')) {
  try {
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp) { $vp.SetValue($an.Substring(6)); $done = $true }
  } catch {}
}
if (-not $done) { Write-Output ('ERROR:action-not-supported:' + $an); exit 7 }
Write-Output ('{"ok":true,"action":"' + $an + '"}')`
  }

  const script = `${UIA_LIB}
${psJsonVar("EID", eid)}
${psJsonVar("PARAMS", { replace: extra?.replace ?? true, numeric: extra?.numeric ?? 0 })}
$el = Get-ZElementByRid ([string]$EID)
if (-not $el) { Write-Output 'ERROR:element-not-found'; exit 3 }
${body}`
  try {
    const out = await runPs(script, 30000)
    if (out.startsWith("ERROR:")) {
      const code = out.trim()
      if (code === "ERROR:element-not-found") return err(`Element not found: ${eid}`)
      if (code === "ERROR:no-value-pattern") return err("Element does not support ValuePattern (not editable)")
      if (code === "ERROR:no-range-pattern") return err("Element does not support RangeValuePattern (not a slider/spin)")
      if (code === "ERROR:no-text") return err("Element exposes no readable text (Name/Value/TextPattern all empty)")
      if (code === "ERROR:element-not-clickable") return err("Element has zero-size bounds and no InvokePattern; cannot click")
      if (code.startsWith("ERROR:action-not-supported:")) return err(`Action not supported by element: ${code.split(":")[2]}`)
      return err(code)
    }
    return ok(parseJsonOutput(out))
  } catch (e) {
    return err(`Element action failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function uiaSelectText(elementId: string, selection: { kind: "substring"; text: string; occurrence: number } | { kind: "range"; start: number; end: number }): Promise<HandlerResult> {
  const script = `${UIA_LIB}
${psJsonVar("EID", elementId)}
${psJsonVar("SEL", selection)}
$el = Get-ZElementByRid ([string]$EID)
if (-not $el) { Write-Output 'ERROR:element-not-found'; exit 3 }
$tp = $null
try { $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern) } catch {}
if (-not $tp) { Write-Output 'ERROR:no-text-pattern'; exit 5 }
$doc = $tp.DocumentRange
$full = $doc.GetText(-1)
$selStart = 0
$selEnd = 0
if ([string]$SEL.kind -eq 'substring') {
  $needle = [string]$SEL.text
  $occ = [Math]::Max(1, [int]$SEL.occurrence)
  $idx = -1
  $searchFrom = 0
  for ($n = 0; $n -lt $occ; $n++) {
    $idx = $full.IndexOf($needle, $searchFrom, [StringComparison]::OrdinalIgnoreCase)
    if ($idx -lt 0) { break }
    $searchFrom = $idx + [Math]::Max(1, $needle.Length)
  }
  if ($idx -lt 0) { Write-Output 'ERROR:text-not-found'; exit 6 }
  $selStart = $idx
  $selEnd = $idx + $needle.Length
} else {
  $selStart = [int]$SEL.start
  $selEnd = [int]$SEL.end
  if ($selStart -lt 0 -or $selEnd -gt $full.Length -or $selEnd -lt $selStart) { Write-Output 'ERROR:bad-range'; exit 6 }
}
$r = $doc.Clone()
$r.MoveEndpointsByUnit([System.Windows.Automation.TextPatternRangeEndpoint]::Start, [System.Windows.Automation.TextPatternRangeUnit]::Character, $selStart)
$r.MoveEndpointsByUnit([System.Windows.Automation.TextPatternRangeEndpoint]::End, [System.Windows.Automation.TextPatternRangeUnit]::Character, ($selEnd - $full.Length))
$tp.Selection = $r
ConvertTo-Json -InputObject @{ ok = $true; start = $selStart; end = $selEnd; selected = $full.Substring($selStart, ($selEnd - $selStart)) } -Compress`
  try {
    const out = await runPs(script, 30000)
    if (out.startsWith("ERROR:")) {
      if (out.includes("text-not-found")) return err("Substring not found in element text")
      if (out.includes("bad-range")) return err("Selection range is outside element text bounds")
      if (out.includes("no-text-pattern")) return err("Element does not support TextPattern selection")
      if (out.includes("element-not-found")) return err(`Element not found: ${elementId}`)
      return err(out.trim())
    }
    return ok(parseJsonOutput(out))
  } catch (e) {
    return err(`select_text failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function chromeUserDirs(): Promise<string[]> {
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local")
    return [path.join(local, "Google", "Chrome", "User Data")]
  }
  if (process.platform === "darwin") {
    return [path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome")]
  }
  return [path.join(os.homedir(), ".config", "google-chrome")]
}

function findChromeExecutable(): string | null {
  const candidates: string[] = []
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles || "C:\\Program Files"
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local")
    candidates.push(
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
    )
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser")
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

async function listChromeTabsLocal(): Promise<{ port: number; tabs: Array<{ id: string; title: string; url: string; wsUrl?: string }> }> {
  for (const port of await cdpDebugPorts()) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2500) })
      if (!resp.ok) continue
      const list = (await resp.json()) as Array<{ id?: string; type?: string; title?: string; url?: string; webSocketDebuggerUrl?: string }>
      const tabs = list
        .filter((t) => t.type === "page" && t.id)
        .map((t) => ({ id: t.id!, title: t.title || "", url: t.url || "", wsUrl: t.webSocketDebuggerUrl }))
      if (tabs.length > 0) return { port, tabs }
    } catch {
      // try next port
    }
  }
  throw new Error("No Chrome with --remote-debugging-port found. Launch Chrome with remote debugging or run x_cdp_connect.")
}

async function runWaitLoop(
  label: string,
  timeoutSec: number,
  probe: () => Promise<boolean>,
): Promise<HandlerResult> {
  const timeout = Math.max(0.5, Math.min(timeoutSec, 120))
  const deadline = Date.now() + timeout * 1000
  let attempts = 0
  while (Date.now() < deadline) {
    attempts++
    if (await probe()) {
      return ok({ found: true, label, attempts, waitedMs: Math.round(timeout * 1000 - (deadline - Date.now())) })
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return err(`Timed out after ${timeout}s waiting for ${label}`)
}

const localFirstTools = new Set(["tp_configure", "tp_diagnostics", "tp_chrome_profiles"])

async function tpLocalFallback(id: string, args: HandlerArgs): Promise<HandlerResult> {
  switch (id) {
    case "tp_apps": {
      const script = `${WIN32_PREAMBLE}
${PS_WINDOW_LIST}
$wins = $out
$apps = @()
foreach ($g in ($wins | Group-Object -Property process)) {
  $apps += [pscustomobject]@{
    name = $g.Name
    window_count = $g.Count
    windows = @($g.Group | ForEach-Object { [pscustomobject]@{ pid = $_.pid; title = $_.title; handle = $_.handle } })
  }
}
ConvertTo-Json -InputObject @{ count = @($apps).Count; apps = @($apps) } -Compress -Depth 5`
      return ok(parseJsonOutput(await runPs(script, 20000)))
    }
    case "tp_windows":
    case "tp_find_window": {
      const title = textArg(args.title).toLowerCase()
      const app = textArg(args.app).toLowerCase()
      const script = `${WIN32_PREAMBLE}
${PS_WINDOW_LIST}`
      const parsed = parseJsonOutput(await runPs(script, 20000)) as Array<Record<string, unknown>> | Record<string, unknown>
      const list = Array.isArray(parsed) ? parsed : []
      let filtered = list
      if (title) filtered = filtered.filter((w) => String(w.title || "").toLowerCase().includes(title))
      if (app) filtered = filtered.filter((w) => String(w.process || "").toLowerCase().includes(app))
      if (id === "tp_find_window") {
        return ok({ count: filtered.length, matches: filtered.slice(0, 50) })
      }
      return ok({ count: filtered.length, windows: filtered })
    }
    case "tp_activate_window":
      return focusWindowPs(textArg(args.window_id))
    case "tp_minimize_window": {
      const resolve = psResolveWindow(textArg(args.window_id))
      await runPs(`${WIN32_PREAMBLE}\n${resolve}\n[ZWin]::ShowWindow($hwnd, 6) | Out-Null\nWrite-Output 'ok'`, 10000)
      return ok({ minimized: true, window_id: args.window_id })
    }
    case "tp_fullscreen_window": {
      const enter = boolArg(args.fullscreen, true)
      const resolve = psResolveWindow(textArg(args.window_id))
      if (enter) {
        const script = `${WIN32_PREAMBLE}
Add-Type -AssemblyName System.Windows.Forms
${resolve}
$backup = Join-Path $env:TEMP ('zyraxon_fs_' + [int64]$hwnd + '.json')
$r = New-Object ZWin+RECT
[ZWin]::GetWindowRect($hwnd, [ref]$r) | Out-Null
$style = [ZWin]::GetWindowLongPtr($hwnd, -16).ToInt64()
[pscustomobject]@{ style = $style; left = $r.Left; top = $r.Top; width = ($r.Right - $r.Left); height = ($r.Bottom - $r.Top) } | ConvertTo-Json -Compress | Set-Content -Path $backup -Encoding UTF8
$style2 = $style -band (-bnot 0x00C00000) -band (-bnot 0x00040000) -band (-bnot 0x00010000)
[ZWin]::SetWindowLongPtr($hwnd, -16, [IntPtr]::new([int64]$style2)) | Out-Null
$v = [System.Windows.Forms.SystemInformation]::VirtualScreen
[ZWin]::MoveWindow($hwnd, $v.X, $v.Y, $v.Width, $v.Height, $true) | Out-Null
Write-Output 'fullscreen-on'`
        await runPs(script, 15000)
        return ok({ fullscreen: true, window_id: args.window_id })
      }
      const script = `${WIN32_PREAMBLE}
${resolve}
$backup = Join-Path $env:TEMP ('zyraxon_fs_' + [int64]$hwnd + '.json')
if (Test-Path $backup) {
  $b = Get-Content -Path $backup -Raw | ConvertFrom-Json
  [ZWin]::SetWindowLongPtr($hwnd, -16, [IntPtr]::new([int64]$b.style)) | Out-Null
  [ZWin]::MoveWindow($hwnd, [int]$b.left, [int]$b.top, [int]$b.width, [int]$b.height, $true) | Out-Null
  Remove-Item $backup -Force
  Write-Output 'fullscreen-off-restored'
} else {
  [ZWin]::ShowWindow($hwnd, 9) | Out-Null
  Write-Output 'fullscreen-off-restore'
}`
      await runPs(script, 15000)
      return ok({ fullscreen: false, window_id: args.window_id })
    }
    case "tp_close_window": {
      const resolve = psResolveWindow(textArg(args.window_id))
      const out = await runPs(`${WIN32_PREAMBLE}\n${resolve}\n[ZWin]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null\nWrite-Output 'closed'`, 10000)
      return ok({ closed: true, window_id: args.window_id, output: out.trim() })
    }
    case "tp_move_window": {
      const resolve = psResolveWindow(textArg(args.window_id))
      const x = Math.round(numArg(args.x, 0))
      const y = Math.round(numArg(args.y, 0))
      await runPs(`${WIN32_PREAMBLE}\n${resolve}\n$r = New-Object ZWin+RECT\n[ZWin]::GetWindowRect($hwnd, [ref]$r) | Out-Null\n[ZWin]::MoveWindow($hwnd, ${x}, ${y}, ($r.Right - $r.Left), ($r.Bottom - $r.Top), $true) | Out-Null\nWrite-Output 'ok'`, 10000)
      return ok({ moved: true, x, y })
    }
    case "tp_resize_window": {
      const resolve = psResolveWindow(textArg(args.window_id))
      const w = Math.max(50, Math.round(numArg(args.width, 800)))
      const h = Math.max(50, Math.round(numArg(args.height, 600)))
      await runPs(`${WIN32_PREAMBLE}\n${resolve}\n$r = New-Object ZWin+RECT\n[ZWin]::GetWindowRect($hwnd, [ref]$r) | Out-Null\n[ZWin]::MoveWindow($hwnd, $r.Left, $r.Top, ${w}, ${h}, $true) | Out-Null\nWrite-Output 'ok'`, 10000)
      return ok({ resized: true, width: w, height: h })
    }
    case "tp_monitor_count": {
      const script = `Add-Type -AssemblyName System.Windows.Forms
$screens = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
  [pscustomobject]@{ primary = $_.Primary; x = $_.Bounds.X; y = $_.Bounds.Y; width = $_.Bounds.Width; height = $_.Bounds.Height; name = $_.DeviceName }
})
ConvertTo-Json -InputObject @{ count = @($screens).Count; monitors = @($screens) } -Compress -Depth 4`
      return ok(parseJsonOutput(await runPs(script, 10000)))
    }
    case "tp_elements":
      return uiaElements(args, "elements")
    case "tp_snapshot":
      return uiaElements(args, "snapshot")
    case "tp_find":
      if (!textArg(args.query)) return err("query is required")
      return uiaElements(args, "find")
    case "tp_get_element":
      return uiaGetElement(textArg(args.element_id))
    case "tp_element_at":
      return uiaElementAt(numArg(args.x, 0), numArg(args.y, 0))
    case "tp_click":
      return uiaActionByElement(textArg(args.element_id), "invoke")
    case "tp_double_click":
      return uiaActionByElement(textArg(args.element_id), "double")
    case "tp_right_click":
      return uiaActionByElement(textArg(args.element_id), "right")
    case "tp_focus":
      return uiaActionByElement(textArg(args.element_id), "focus")
    case "tp_set_value":
      return uiaActionByElement(textArg(args.element_id), "value", {
        value: textArg(args.value),
        replace: boolArg(args.replace, true),
      })
    case "tp_set_numeric_value":
      return uiaActionByElement(textArg(args.element_id), "numeric", { numeric: numArg(args.value, 0) })
    case "tp_read_text":
      return uiaActionByElement(textArg(args.element_id), "read")
    case "tp_action":
      return uiaActionByElement(textArg(args.element_id), "raw", { actionName: textArg(args.action_name) })
    case "tp_select_text":
      return uiaSelectText(textArg(args.element_id), {
        kind: "substring",
        text: textArg(args.text),
        occurrence: Math.max(1, numArg(args.occurrence, 1)),
      })
    case "tp_select_text_range":
      return uiaSelectText(textArg(args.element_id), {
        kind: "range",
        start: Math.max(0, numArg(args.start, 0)),
        end: Math.max(0, numArg(args.end, 0)),
      })
    case "tp_click_at":
      return clickPs(numArg(args.x, 0), numArg(args.y, 0), textArg(args.button) || "left", false)
    case "tp_double_click_at":
      return clickPs(numArg(args.x, 0), numArg(args.y, 0), "left", true)
    case "tp_right_click_at":
      return clickPs(numArg(args.x, 0), numArg(args.y, 0), "right", false)
    case "tp_mouse_move": {
      const x = Math.round(numArg(args.x, 0))
      const y = Math.round(numArg(args.y, 0))
      await runPs(`${WIN32_PREAMBLE}\n[ZWin]::SetCursorPos(${x}, ${y}) | Out-Null\nWrite-Output 'ok'`, 8000)
      return ok({ x, y })
    }
    case "tp_drag":
      return dragPs(numArg(args.x1, 0), numArg(args.y1, 0), numArg(args.x2, 0), numArg(args.y2, 0), textArg(args.button) || "left")
    case "tp_type_text":
      return typeTextPs(textArg(args.text))
    case "tp_press_key":
      return pressKeysPs(textArg(args.keys), numArg(args.repeat, 1))
    case "tp_hotkey":
      return hotkeyPs(textArg(args.keys))
    case "tp_scroll":
      return scrollPs(numArg(args.dy, 0), numArg(args.dx, 0))
    case "tp_screenshot": {
      const app = textArg(args.app)
      if (!app) {
        const shot = await captureScreenRegion()
        return ok({ ...shot, croppedTo: null })
      }
      const resolveTitle = b64(app)
      const script = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
${WIN32_PREAMBLE}
$needle = ${psDecode(resolveTitle)}
$procs = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.MainWindowTitle -like ('*' + $needle + '*') -or $_.ProcessName -like ('*' + $needle + '*')) })
if ($procs.Count -eq 0) { Write-Output 'ERROR:app-window-not-found'; exit 3 }
$r = New-Object ZWin+RECT
[ZWin]::GetWindowRect($procs[0].MainWindowHandle, [ref]$r) | Out-Null
$rect = New-Object System.Drawing.Rectangle($r.Left, $r.Top, [Math]::Max(1, $r.Right - $r.Left), [Math]::Max(1, $r.Bottom - $r.Top))
$bmp = New-Object System.Drawing.Bitmap($rect.Width, $rect.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Location, [System.Drawing.Point]::Empty, $rect.Size)
$path = Join-Path $env:TEMP ('zyraxon_app_' + [guid]::NewGuid().ToString('N') + '.png')
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
$enc = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($path))
Write-Output ($path + '|' + $rect.Width + '|' + $rect.Height + '|' + $enc)`
      const out = await runPs(script, 20000)
      if (out.includes("app-window-not-found")) return err(`No window found for app "${app}"`)
      const parts = out.split("|")
      if (parts.length < 4) return err(`Screenshot failed: ${out.trim()}`)
      return ok({ path: parts[0], width: Number(parts[1]), height: Number(parts[2]), base64: parts.slice(3).join("|").trim(), croppedTo: app })
    }
    case "tp_screenshot_window": {
      const shot = await captureWindowPng(textArg(args.window_id))
      return ok(shot)
    }
    case "tp_chrome_profiles": {
      const dirs = await chromeUserDirs()
      const profiles: Array<Record<string, unknown>> = []
      let accountEmails: string[] = []
      for (const base of dirs) {
        if (!fs.existsSync(base)) continue
        const statePath = path.join(base, "Local State")
        if (fs.existsSync(statePath)) {
          try {
            const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as { profile?: { info_cache?: Record<string, { name?: string; gaia_name?: string }> }; account_info?: Array<{ email?: string }> }
            accountEmails = (state.account_info ?? []).map((a) => a.email || "").filter(Boolean)
            for (const [dirName, meta] of Object.entries(state.profile?.info_cache ?? {})) {
              profiles.push({
                directory: dirName,
                name: meta.name || dirName,
                gaia_name: meta.gaia_name || "",
                path: path.join(base, dirName),
                user_data_dir: base,
              })
            }
          } catch {
            // Local State may be locked; fall through to directory scan
          }
        }
        for (const entry of fs.readdirSync(base)) {
          if (entry !== "Default" && !entry.startsWith("Profile ")) continue
          if (profiles.some((p) => p.directory === entry)) continue
          const prefPath = path.join(base, entry, "Preferences")
          let name = entry
          if (fs.existsSync(prefPath)) {
            try {
              const pref = JSON.parse(fs.readFileSync(prefPath, "utf8")) as { profile?: { name?: string } }
              name = pref.profile?.name || entry
            } catch {
              // keep dir name
            }
          }
          profiles.push({ directory: entry, name, path: path.join(base, entry), user_data_dir: base })
        }
      }
      if (profiles.length === 0 && accountEmails.length === 0) {
        return err(`No Chrome user data found under: ${dirs.join(", ")}. Install Chrome or launch it once to create profiles.`)
      }
      return ok({ user_data_dirs: dirs, profiles, account_emails: accountEmails })
    }
    case "tp_open_chrome_profile": {
      const chrome = findChromeExecutable()
      if (!chrome) return err("Google Chrome executable not found. Install Chrome or set the path manually.")
      const profile = textArg(args.profile_name)
      const url = textArg(args.url) || "about:blank"
      const argsList = url ? [url] : []
      if (profile) argsList.unshift(`--profile-directory=${profile}`)
      const child = spawn(chrome, argsList, { detached: true, stdio: "ignore", windowsHide: false })
      child.unref()
      return ok({ launched: true, chrome, profile: profile || "Default", url, pid: child.pid ?? null })
    }
    case "tp_new_tab": {
      const url = textArg(args.url) || "about:blank"
      try {
        const { port } = await listChromeTabsLocal()
        const resp = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
          method: "PUT",
          signal: AbortSignal.timeout(5000),
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const tab = (await resp.json()) as { id?: string; title?: string; url?: string }
        return ok({ created: true, id: tab.id ?? null, title: tab.title ?? "", url: tab.url ?? url, port })
      } catch (e) {
        return err(
          `Could not open tab via CDP (${e instanceof Error ? e.message : String(e)}). Start Chrome with --remote-debugging-port=9222.`,
        )
      }
    }
    case "tp_list_tabs": {
      try {
        const { port, tabs } = await listChromeTabsLocal()
        return ok({ port, count: tabs.length, tabs })
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e))
      }
    }
    case "tp_switch_tab": {
      const ident = textArg(args.tab_identifier)
      if (!ident) return err("tab_identifier is required (tab index or title substring)")
      try {
        const { port, tabs } = await listChromeTabsLocal()
        let target = tabs[0]
        if (/^\d+$/.test(ident)) {
          const idx = Number(ident)
          target = tabs[idx] ?? tabs[idx - 1]
          if (!target) return err(`Tab index ${ident} out of range (0..${tabs.length - 1})`)
        } else {
          target = tabs.find((t) => t.title.toLowerCase().includes(ident.toLowerCase()) || t.url.toLowerCase().includes(ident.toLowerCase()))
          if (!target) return err(`No tab matching "${ident}". Tabs: ${tabs.map((t) => t.title || t.url).join(" | ")}`)
        }
        const resp = await fetch(`http://127.0.0.1:${port}/json/activate/${target.id}`, { signal: AbortSignal.timeout(5000) })
        if (!resp.ok) return err(`CDP activate failed with HTTP ${resp.status}`)
        return ok({ activated: true, tab: target })
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e))
      }
    }
    case "tp_close_tab": {
      const ident = textArg(args.tab_identifier)
      try {
        const { port, tabs } = await listChromeTabsLocal()
        if (!ident) {
          return err(`tab_identifier is required. Open tabs: ${tabs.map((t, i) => `${i}:${t.title || t.url}`).join(" | ")}`)
        }
        let target = tabs[0]
        if (/^\d+$/.test(ident)) {
          const idx = Number(ident)
          target = tabs[idx] ?? tabs[idx - 1]
          if (!target) return err(`Tab index ${ident} out of range`)
        } else {
          target = tabs.find((t) => t.title.toLowerCase().includes(ident.toLowerCase()) || t.url.toLowerCase().includes(ident.toLowerCase()))
          if (!target) return err(`No tab matching "${ident}"`)
        }
        const resp = await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`, { signal: AbortSignal.timeout(5000) })
        if (!resp.ok) return err(`CDP close failed with HTTP ${resp.status}`)
        return ok({ closed: true, tab: target })
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e))
      }
    }
    case "tp_wait_for": {
      const name = textArg(args.element)
      if (!name) return err("element is required")
      const gone = boolArg(args.gone, false)
      const timeout = numArg(args.timeout, 10)
      return runWaitLoop(`${gone ? "disappearance" : "appearance"} of element "${name}"`, timeout, async () => {
        try {
          const found = await uiaElements({ query: name, max_depth: touchpointConfig.maxDepth }, "find")
          const data = found.ok ? (found.data as { matches?: unknown[] } | undefined) : null
          const count = Array.isArray(data?.matches) ? data.matches.length : 0
          return gone ? count === 0 : count > 0
        } catch {
          return false
        }
      })
    }
    case "tp_wait_for_app": {
      const app = textArg(args.app)
      if (!app) return err("app is required")
      const gone = boolArg(args.gone, false)
      const timeout = numArg(args.timeout, 10)
      return runWaitLoop(`${gone ? "exit" : "launch"} of app "${app}"`, timeout, async () => {
        try {
          const out = await runPs(
            `$n = @(Get-Process | Where-Object { $_.ProcessName -like '*${app.replace(/'/g, "''")}*' -or $_.MainWindowTitle -like '*${app.replace(/'/g, "''")}*' }).Count
Write-Output $n`,
            8000,
          )
          const n = Number(out.trim())
          const present = Number.isFinite(n) && n > 0
          return gone ? !present : present
        } catch {
          return false
        }
      })
    }
    case "tp_wait_for_window": {
      const title = textArg(args.title)
      if (!title) return err("title is required")
      const app = textArg(args.app)
      const gone = boolArg(args.gone, false)
      const timeout = numArg(args.timeout, 10)
      const safeTitle = title.replace(/'/g, "''")
      const safeApp = app.replace(/'/g, "''")
      return runWaitLoop(`${gone ? "close" : "open"} of window "${title}"`, timeout, async () => {
        try {
          const filter = app
            ? `$_.MainWindowTitle -like '*${safeTitle}*' -and $_.ProcessName -like '*${safeApp}*'`
            : `$_.MainWindowTitle -like '*${safeTitle}*'`
          const out = await runPs(`$n = @(Get-Process | Where-Object { ${filter} -and $_.MainWindowHandle -ne 0 }).Count\nWrite-Output $n`, 8000)
          const n = Number(out.trim())
          const present = Number.isFinite(n) && n > 0
          return gone ? !present : present
        } catch {
          return false
        }
      })
    }
    case "tp_configure": {
      const next = { ...touchpointConfig }
      if (args.scale_factor !== undefined && args.scale_factor !== "") next.scaleFactor = numArg(args.scale_factor, next.scaleFactor)
      if (args.fuzzy_threshold !== undefined && args.fuzzy_threshold !== "") next.fuzzyThreshold = numArg(args.fuzzy_threshold, next.fuzzyThreshold)
      if (args.max_elements !== undefined && args.max_elements !== "") next.maxElements = Math.max(1, numArg(args.max_elements, next.maxElements))
      touchpointConfig.scaleFactor = next.scaleFactor
      touchpointConfig.fuzzyThreshold = Math.min(1, Math.max(0, next.fuzzyThreshold))
      touchpointConfig.maxElements = next.maxElements
      return ok({ configured: true, config: { ...touchpointConfig } })
    }
    case "tp_diagnostics": {
      const entry = resolveTouchpointEntry()
      const mcp = await ensureTouchpointMcp()
      let psOk = false
      try {
        const probe = await runPs("Write-Output 'ok'", 5000)
        psOk = probe.includes("ok")
      } catch {
        psOk = false
      }
      let uiaOk = false
      try {
        await runPs("Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes\nWrite-Output 'ok'", 8000)
        uiaOk = true
      } catch {
        uiaOk = false
      }
      let cdpPorts: number[] = []
      let cdpError: string | null = null
      try {
        cdpPorts = await cdpDebugPorts()
        const list = await fetch(`http://127.0.0.1:${cdpPorts[0]}/json/version`, { signal: AbortSignal.timeout(1500) })
        cdpError = list.ok ? null : `HTTP ${list.status}`
      } catch (e) {
        cdpError = e instanceof Error ? e.message : String(e)
      }
      const chrome = findChromeExecutable()
      return ok({
        platform: process.platform,
        arch: process.arch,
        powershell: psOk,
        ui_automation: uiaOk,
        mcp_entrypoint: entry ? path.join(entry.cmd === process.execPath ? entry.args[0] : entry.args[0] ?? "", "") : null,
        mcp_entry_command: entry ? `${entry.cmd} ${entry.args.join(" ")}` : null,
        mcp_connected: Boolean(mcp),
        mcp_tool_count: mcp ? mcp.toolNames.size : 0,
        cdp_ports: cdpPorts,
        cdp_error: cdpError,
        chrome_path: chrome,
        config: { ...touchpointConfig },
      })
    }
    default:
      return err(`No local fallback implementation for ${id}`)
  }
}

async function tpDispatch(id: string, args: HandlerArgs): Promise<HandlerResult> {
  if (localFirstTools.has(id)) {
    return tpLocalFallback(id, args)
  }
  return withTouchpointMcp(id, args, (a) => tpLocalFallback(id, a))
}

const nuphusHandlers: Record<string, Handler> = {
  async nuphus_screenshot(args) {
    const windowId = textArg(args.window_id)
    if (windowId) return ok(await captureWindowPng(windowId))
    return ok(await captureScreenRegion())
  },
  async nuphus_list_windows() {
    const script = `${WIN32_PREAMBLE}\n${PS_WINDOW_LIST}`
    const data = parseJsonOutput(await runPs(script, 20000))
    const list = Array.isArray(data) ? data : []
    return ok({ count: list.length, windows: list })
  },
  async nuphus_focus_window(args) {
    return focusWindowPs(textArg(args.window_id))
  },
  async nuphus_click(args) {
    return clickPs(numArg(args.x, 0), numArg(args.y, 0), textArg(args.button) || "left", false)
  },
  async nuphus_type(args) {
    return typeTextPs(textArg(args.text))
  },
  async nuphus_hotkey(args) {
    return hotkeyPs(textArg(args.keys))
  },
  async nuphus_scroll(args) {
    return scrollPs(numArg(args.dy, 0), numArg(args.dx, 0))
  },
  async nuphus_mouse_move(args) {
    const x = Math.round(numArg(args.x, 0))
    const y = Math.round(numArg(args.y, 0))
    await runPs(`${WIN32_PREAMBLE}\n[ZWin]::SetCursorPos(${x}, ${y}) | Out-Null\nWrite-Output 'ok'`, 8000)
    return ok({ x, y })
  },
  async nuphus_drag(args) {
    return dragPs(numArg(args.x1, 0), numArg(args.y1, 0), numArg(args.x2, 0), numArg(args.y2, 0), "left")
  },
  async nuphus_ocr(args) {
    return ocrRegionPs(textArg(args.region) || "full")
  },
  async nuphus_clipboard_get() {
    if (process.platform !== "win32") return err("Clipboard tools require Windows")
    const out = await runPs("$c = Get-Clipboard -Raw -ErrorAction Stop\nif ($null -eq $c) { Write-Output '' } else { Write-Output $c }", 10000)
    return ok({ text: out.replace(/\r\n$/, "") })
  },
  async nuphus_clipboard_set(args) {
    const text = textArg(args.text)
    if (process.platform !== "win32") return err("Clipboard tools require Windows")
    await runPs(`$t = ${psDecode(b64(text))}\nSet-Clipboard -Value $t\nWrite-Output 'ok'`, 10000)
    return ok({ set: true, characters: [...text].length })
  },
  async nuphus_browser_navigate(args) {
    const url = textArg(args.url)
    if (!url) return err("url is required")
    return withCdp(async (page) => {
      await cdpCall(page.wsUrl, "Page.enable")
      await cdpCall(page.wsUrl, "Page.navigate", { url })
      await cdpWaitForLoad(page)
      return ok({ url, title: page.title, port: page.port })
    })
  },
  async nuphus_browser_snapshot() {
    return withCdp(async (page) => {
      await cdpCall(page.wsUrl, "Accessibility.enable")
      const tree = (await cdpCall(page.wsUrl, "Accessibility.getFullAXTree")) as { nodes?: Array<Record<string, unknown>> }
      const nodes = (tree.nodes ?? [])
        .map((n) => {
          const role = n.role as { value?: string } | string | undefined
          const name = n.name as { value?: string } | string | undefined
          const roleValue = typeof role === "string" ? role : role?.value || ""
          const nameValue = typeof name === "string" ? name : name?.value || ""
          return {
            role: roleValue,
            name: nameValue,
            nodeId: n.nodeId ?? null,
            backendDOMNodeId: n.backendDOMNodeId ?? null,
            ignored: n.ignored === true,
          }
        })
        .filter((n) => n.name || (n.role && n.role !== "generic"))
      return ok({ count: nodes.length, nodes, sourceUrl: page.url })
    })
  },
  async nuphus_browser_click(args) {
    const selector = textArg(args.selector)
    if (!selector) return err("selector is required")
    return withCdp(async (page) => {
      const expression = `(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return { error: "not-found" }
  el.scrollIntoView({ block: "center", inline: "center" })
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName }
})()`
      const hit = (await cdpEvaluate(page, expression)) as { error?: string; x?: number; y?: number; tag?: string } | null
      if (!hit || hit.error) {
        return err(`No element matches selector ${JSON.stringify(selector)} on ${page.url}`)
      }
      await cdpCall(page.wsUrl, "Input.dispatchMouseEvent", { type: "mouseMoved", x: hit.x, y: hit.y })
      await cdpCall(page.wsUrl, "Input.dispatchMouseEvent", { type: "mousePressed", x: hit.x, y: hit.y, button: "left", clickCount: 1 })
      await cdpCall(page.wsUrl, "Input.dispatchMouseEvent", { type: "mouseReleased", x: hit.x, y: hit.y, button: "left", clickCount: 1 })
      return ok({ clicked: true, selector, tag: hit.tag ?? null, x: hit.x, y: hit.y, url: page.url })
    })
  },
  async nuphus_browser_type(args) {
    const selector = textArg(args.selector)
    const text = textArg(args.text)
    if (!selector) return err("selector is required")
    if (!text) return err("text is required")
    return withCdp(async (page) => {
      const expression = `(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return { error: "not-found" }
  el.focus()
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value") && Object.getOwnPropertyDescriptor(proto, "value").set
  const value = ${JSON.stringify(text)}
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
  return { ok: true, value: el.value, tag: el.tagName }
})()`
      const result = (await cdpEvaluate(page, expression)) as { error?: string; ok?: boolean; value?: string; tag?: string } | null
      if (!result || result.error) {
        return err(`No element matches selector ${JSON.stringify(selector)} on ${page.url}`)
      }
      return ok({ typed: true, selector, value: result.value ?? text, tag: result.tag ?? null })
    })
  },
  async nuphus_browser_screenshot() {
    return withCdp(async (page) => {
      await cdpCall(page.wsUrl, "Page.enable")
      const shot = (await cdpCall(page.wsUrl, "Page.captureScreenshot", { format: "png" })) as { data?: string }
      if (!shot.data) return err("CDP screenshot returned no data")
      return ok({ base64: shot.data, url: page.url, title: page.title })
    })
  },
  async nuphus_browser_cookies() {
    return withCdp(async (page) => {
      const result = (await cdpCall(page.wsUrl, "Network.getAllCookies")) as { cookies?: Array<Record<string, unknown>> }
      const cookies = result.cookies ?? []
      return ok({ count: cookies.length, cookies, pageUrl: page.url })
    })
  },
  async nuphus_browser_execute(args) {
    const script = textArg(args.script)
    if (!script) return err("script is required")
    return withCdp(async (page) => {
      const result = (await cdpCall(page.wsUrl, "Runtime.evaluate", {
        expression: script,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      })) as { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } }
      if (result.exceptionDetails) {
        const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "script threw"
        return err(description)
      }
      return ok({ value: result.result?.value ?? null, url: page.url })
    })
  },
}

const touchpointHandlers: Record<string, Handler> = {
  async tp_apps(args) {
    return tpDispatch("tp_apps", args)
  },
  async tp_windows(args) {
    return tpDispatch("tp_windows", args)
  },
  async tp_elements(args) {
    return tpDispatch("tp_elements", args)
  },
  async tp_find(args) {
    if (!textArg(args.query)) return err("query is required")
    return tpDispatch("tp_find", args)
  },
  async tp_snapshot(args) {
    return tpDispatch("tp_snapshot", args)
  },
  async tp_get_element(args) {
    if (!textArg(args.element_id)) return err("element_id is required")
    return tpDispatch("tp_get_element", args)
  },
  async tp_element_at(args) {
    return tpDispatch("tp_element_at", args)
  },
  async tp_diagnostics(args) {
    return tpDispatch("tp_diagnostics", args)
  },
  async tp_activate_window(args) {
    if (!textArg(args.window_id)) return err("window_id is required")
    return tpDispatch("tp_activate_window", args)
  },
  async tp_minimize_window(args) {
    if (!textArg(args.window_id)) return err("window_id is required")
    return tpDispatch("tp_minimize_window", args)
  },
  async tp_fullscreen_window(args) {
    if (!textArg(args.window_id)) return err("window_id is required")
    return tpDispatch("tp_fullscreen_window", args)
  },
  async tp_close_window(args) {
    if (!textArg(args.window_id)) return err("window_id is required")
    return tpDispatch("tp_close_window", args)
  },
  async tp_move_window(args) {
    if (!textArg(args.window_id)) return err("window_id is required")
    return tpDispatch("tp_move_window", args)
  },
  async tp_resize_window(args) {
    if (!textArg(args.window_id)) return err("window_id is required")
    return tpDispatch("tp_resize_window", args)
  },
  async tp_find_window(args) {
    if (!textArg(args.title)) return err("title is required")
    return tpDispatch("tp_find_window", args)
  },
  async tp_monitor_count(args) {
    return tpDispatch("tp_monitor_count", args)
  },
  async tp_click(args) {
    if (!textArg(args.element_id)) return err("element_id is required")
    return tpDispatch("tp_click", args)
  },
  async tp_double_click(args) {
    if (!textArg(args.element_id)) return err("element_id is required")
    return tpDispatch("tp_double_click", args)
  },
  async tp_right_click(args) {
    if (!textArg(args.element_id)) return err("element_id is required")
    return tpDispatch("tp_right_click", args)
  },
  async tp_click_at(args) {
    return tpDispatch("tp_click_at", args)
  },
  async tp_double_click_at(args) {
    return tpDispatch("tp_double_click_at", args)
  },
  async tp_right_click_at(args) {
    return tpDispatch("tp_right_click_at", args)
  },
  async tp_mouse_move(args) {
    return tpDispatch("tp_mouse_move", args)
  },
  async tp_drag(args) {
    return tpDispatch("tp_drag", args)
  },
  async tp_type_text(args) {
    if (!textArg(args.text)) return err("text is required")
    return tpDispatch("tp_type_text", args)
  },
  async tp_press_key(args) {
    if (!textArg(args.keys)) return err("keys is required")
    return tpDispatch("tp_press_key", args)
  },
  async tp_hotkey(args) {
    if (!textArg(args.keys)) return err("keys is required")
    return tpDispatch("tp_hotkey", args)
  },
  async tp_scroll(args) {
    return tpDispatch("tp_scroll", args)
  },
  async tp_set_value(args) {
    if (!textArg(args.element_id)) return err("element_id is required")
    return tpDispatch("tp_set_value", args)
  },
  async tp_set_numeric_value(args) {
    if (!textArg(args.element_id)) return err("element_id is required")
    return tpDispatch("tp_set_numeric_value", args)
  },
  async tp_focus(args) {
    if (!textArg(args.element_id)) return err("element_id is required")
    return tpDispatch("tp_focus", args)
  },
  async tp_select_text(args) {
    if (!textArg(args.element_id)) return err("element_id is required")
    if (!textArg(args.text)) return err("text is required")
    return tpDispatch("tp_select_text", args)
  },
  async tp_select_text_range(args) {
    if (!textArg(args.element_id)) return err("element_id is required")
    return tpDispatch("tp_select_text_range", args)
  },
  async tp_action(args) {
    if (!textArg(args.element_id)) return err("element_id is required")
    if (!textArg(args.action_name)) return err("action_name is required")
    return tpDispatch("tp_action", args)
  },
  async tp_read_text(args) {
    if (!textArg(args.element_id)) return err("element_id is required")
    return tpDispatch("tp_read_text", args)
  },
  async tp_screenshot(args) {
    return tpDispatch("tp_screenshot", args)
  },
  async tp_screenshot_window(args) {
    if (!textArg(args.window_id)) return err("window_id is required")
    return tpDispatch("tp_screenshot_window", args)
  },
  async tp_chrome_profiles(args) {
    return tpDispatch("tp_chrome_profiles", args)
  },
  async tp_open_chrome_profile(args) {
    return tpDispatch("tp_open_chrome_profile", args)
  },
  async tp_new_tab(args) {
    return tpDispatch("tp_new_tab", args)
  },
  async tp_list_tabs(args) {
    return tpDispatch("tp_list_tabs", args)
  },
  async tp_switch_tab(args) {
    if (!textArg(args.tab_identifier)) return err("tab_identifier is required")
    return tpDispatch("tp_switch_tab", args)
  },
  async tp_close_tab(args) {
    return tpDispatch("tp_close_tab", args)
  },
  async tp_wait_for(args) {
    if (!textArg(args.element)) return err("element is required")
    return tpDispatch("tp_wait_for", args)
  },
  async tp_wait_for_app(args) {
    if (!textArg(args.app)) return err("app is required")
    return tpDispatch("tp_wait_for_app", args)
  },
  async tp_wait_for_window(args) {
    if (!textArg(args.title)) return err("title is required")
    return tpDispatch("tp_wait_for_window", args)
  },
  async tp_configure(args) {
    return tpDispatch("tp_configure", args)
  },
}

export const toolHandlers: Record<string, Handler> = { ...nuphusHandlers, ...touchpointHandlers }
