// Copyright (c) 2026 onelpawarai. All rights reserved.

import * as os from "node:os"
import * as path from "node:path"
import { deflateSync, inflateSync } from "node:zlib"
import { currentPlatform, haveCommand, run, runCommand, tempPath } from "./process-utils"

function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64")
}

export type DesktopResult = { ok: boolean; data?: unknown; error?: string }
export type Platform = "windows" | "macos" | "linux"
export { currentPlatform }

function fail(message: string): DesktopResult {
  return { ok: false, error: message }
}

// Screenshot bounds in PNG IHDR order, needed before the pixels themselves are read.
interface PngInfo {
  width: number
  height: number
}

// Minimal PNG reader. The repo has no image decoding dependency, and a couple of the tools
// here need real pixels (motion scoring, colour statistics), so this stays small and refuses
// anything it cannot read honestly instead of guessing.
export function decodePngToRgb(png: Buffer): { rgb: Buffer; info: PngInfo } {
  const bitDepth = png[24] ?? -1
  const colorType = png[25] ?? -1
  const interlace = png[28] ?? -1
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`)
  if (interlace !== 0) throw new Error("interlaced PNG is not supported")
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported PNG color type ${colorType}`)

  const channels = colorType === 6 ? 4 : 3
  let offset = 8
  let width = 0
  let height = 0
  const idat: Buffer[] = []
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString("ascii", offset + 4, offset + 8)
    const dataStart = offset + 8
    if (type === "IHDR") {
      width = png.readUInt32BE(dataStart)
      height = png.readUInt32BE(dataStart + 4)
    } else if (type === "IDAT") {
      idat.push(png.subarray(dataStart, dataStart + length))
    } else if (type === "IEND") break
    offset = dataStart + length + 4
  }
  if (!width || !height) throw new Error("PNG is missing its IHDR header")
  if (idat.length === 0) throw new Error("PNG contains no image data")

  // inflate exactly once: the scanline stream is what comes out of IDAT.
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const rgb = Buffer.alloc(width * height * 3)
  let prev = Buffer.alloc(stride)
  for (let y = 0, pos = 0; y < height; y++) {
    const filter = raw[pos++] ?? 0
    const line = Buffer.from(raw.subarray(pos, pos + stride))
    if (line.length < stride) throw new Error("PNG scanline is truncated")
    pos += stride
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? (line[i - channels] ?? 0) : 0
      const up = prev[i] ?? 0
      const upLeft = i >= channels ? (prev[i - channels] ?? 0) : 0
      if (filter === 1) line[i] = (line[i] + left) & 0xff
      else if (filter === 2) line[i] = (line[i] + up) & 0xff
      else if (filter === 3) line[i] = (line[i] + ((left + up) >> 1)) & 0xff
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
        line[i] = (line[i] + pred) & 0xff
      } else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`)
    }
    for (let x = 0; x < width; x++) {
      const src = x * channels
      const dst = (y * width + x) * 3
      rgb[dst] = line[src] ?? 0
      rgb[dst + 1] = line[src + 1] ?? 0
      rgb[dst + 2] = line[src + 2] ?? 0
    }
    prev = line
  }
  return { rgb, info: { width, height } }
}

export function encodePng(rgb: Buffer, width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (width * 3 + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3)
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length, 0)
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body), 0)
    return Buffer.concat([length, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

let crcTable: number[] | null = null
function crc32(data: Buffer): number {
  if (!crcTable) {
    crcTable = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// ── Screenshots ────────────────────────────────────────────────────────────────

export async function captureScreen(region?: {
  x: number
  y: number
  w: number
  h: number
}): Promise<{ base64: string; width: number; height: number; path: string }> {
  const platform = currentPlatform()
  const target = tempPath("zyraxon_desk", ".png")

  if (platform === "windows") {
    const rectLine = region
      ? `$r = New-Object System.Drawing.Rectangle(${Math.round(region.x)}, ${Math.round(region.y)}, ${Math.round(region.w)}, ${Math.round(region.h)})
$bmp = New-Object System.Drawing.Bitmap($r.Width, $r.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Location, [System.Drawing.Point]::Empty, $r.Size)
$width = $r.Width
$height = $r.Height`
      : `$v = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap($v.Width, $v.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($v.X, $v.Y, 0, 0, $bmp.Size)
$width = $v.Width
$height = $v.Height`
    const script = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
${rectLine}
$bmp.Save('${target.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output ($width.ToString() + '|' + $height.ToString())`
    await run(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 20000 },
    )
  } else if (platform === "macos") {
    const args = ["-x"]
    if (region) args.push("-R", `${region.x},${region.y},${region.w},${region.h}`)
    args.push("-t", "png", target)
    await run("screencapture", args, { timeout: 20000 })
  } else {
    if (!(await haveCommand("scrot")) && !(await haveCommand("import")))
      throw new Error(
        "Screen capture on Linux needs scrot or ImageMagick. Install one with: sudo apt install scrot",
      )
    if (region && (await haveCommand("scrot")))
      await run(
        "scrot",
        ["-a", `${region.x},${region.y},${region.w},${region.h}`, target],
        { timeout: 20000 },
      )
    else if (await haveCommand("scrot")) await run("scrot", ["-z", target], { timeout: 20000 })
    else
      await run("import", ["-window", "root", target], { timeout: 20000 })
  }

  if (!(await Bun.file(target).exists()))
    throw new Error("Screen capture did not produce an image")
  const bytes = Buffer.from(await Bun.file(target).arrayBuffer())
  const { info } = decodePngToRgb(bytes)
  return { base64: bytes.toString("base64"), width: info.width, height: info.height, path: target }
}

export async function captureWindowPng(
  windowId: string,
): Promise<{ base64: string; width: number; height: number; path: string; pid?: number }> {
  const platform = currentPlatform()
  const handle = Number(windowId)
  if (!Number.isInteger(handle) || handle <= 0)
    throw new Error(`windowId must be a positive integer handle, received: ${windowId}`)

  if (platform === "windows") {
    const target = tempPath("zyraxon_win", ".png")
    const script = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ZCap {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$h = [IntPtr]${handle}
$r = New-Object ZCap+RECT
[ZCap]::GetWindowRect($h, [ref]$r) | Out-Null
$w = [Math]::Max(1, $r.Right - $r.Left)
$hh = [Math]::Max(1, $r.Bottom - $r.Top)
$bmp = New-Object System.Drawing.Bitmap($w, $hh)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[ZCap]::PrintWindow($h, $hdc, 2) | Out-Null
$g.ReleaseHdc($hdc)
$g.Dispose()
$bmp.Save('${target.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$pid2 = [uint32]0
[void][ZCap]::GetWindowThreadProcessId($h, [ref]$pid2)
Write-Output ($w.ToString() + '|' + $hh.ToString() + '|' + $pid2.ToString())`
    const out = await run(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 20000 },
    )
    const [width, height, pid] = out.split("|").map((s) => s.trim())
    return {
      base64: Buffer.from(await Bun.file(target).arrayBuffer()).toString("base64"),
      width: Number(width),
      height: Number(height),
      path: target,
      pid: Number(pid),
    }
  }

  if (platform === "macos") {
    if (!(await haveCommand("screencapture")))
      throw new Error("Window capture on macOS needs screencapture (part of the system tools)")
    const target = tempPath("zyraxon_win", ".png")
    const script = `
tell application "System Events"
  set targetProc to first process whose unix id is ${handle}
  set win to first window of targetProc
  set winPos to position of win
  set winSize to size of win
end tell
set x to item 1 of winPos
set y to item 2 of winPos
set w to item 1 of winSize
set h to item 2 of winSize
do shell script "/usr/sbin/screencapture -x -R" & x & "," & y & "," & w & "," & h & " " & "${target}"`.trim()
    await run("osascript", ["-e", script], { timeout: 20000 })
    const bytes = Buffer.from(await Bun.file(target).arrayBuffer())
    const { info } = decodePngToRgb(bytes)
    return { base64: bytes.toString("base64"), width: info.width, height: info.height, path: target }
  }

  // Linux: resolve the window belonging to the pid, raise it, then capture the screen.
  if (!(await haveCommand("xdotool")) || !(await haveCommand("scrot"))) {
    throw new Error(
      "Window capture on Linux needs xdotool and scrot. Install with: sudo apt install xdotool scrot",
    )
  }
  const ids = (await run("xdotool", ["search", "--pid", String(handle)], { timeout: 10000 })).trim()
  const id = ids.split("\n")[0]?.trim()
  if (!id) throw new Error(`No window found for pid ${handle} on this desktop`)
  await run("xdotool", ["windowactivate", "--sync", id], { timeout: 10000 })
  const target = tempPath("zyraxon_win", ".png")
  await run("scrot", ["-z", target], { timeout: 20000 })
  const bytes = Buffer.from(await Bun.file(target).arrayBuffer())
  const { info } = decodePngToRgb(bytes)
  return { base64: bytes.toString("base64"), width: info.width, height: info.height, path: target, pid: handle }
}

// ── Mouse ──────────────────────────────────────────────────────────────────────

const VK: Record<string, number> = {
  enter: 0x0d, return: 0x0d, tab: 0x09, esc: 0x1b, escape: 0x1b, space: 0x20,
  backspace: 0x08, delete: 0x2e, insert: 0x2d, home: 0x24, end: 0x23,
  pageup: 0x21, pagedown: 0x22, up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  shift: 0x10, ctrl: 0x11, control: 0x11, alt: 0x12, altgr: 0x12,
  win: 0x5b, meta: 0x5b, super: 0x5b, command: 0x5b, cmd: 0x5b,
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75, f7: 0x76,
  f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7a, f12: 0x7b,
  printscreen: 0x2c, pause: 0x2d, apps: 0x5d,
}

export function parseCombo(combo: string): string[] {
  const parts = combo
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
  if (parts.length === 0) throw new Error("key combination is empty")
  return parts.map((part) => {
    if (part.length === 1) return part
    if (VK[part] === undefined) throw new Error(`unknown key in combination: ${part}`)
    return part
  })
}

export async function moveMouse(x: number, y: number): Promise<DesktopResult> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fail("x and y must be numbers")
  const px = Math.round(x)
  const py = Math.round(y)
  try {
    if (currentPlatform() === "windows") {
      await run(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
          `Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class ZM { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }
"@
[ZM]::SetCursorPos(${px}, ${py}) | Out-Null`],
        { timeout: 15000 },
      )
    } else if (currentPlatform() === "macos") {
      if (!(await haveCommand("osascript"))) throw new Error("osascript is unavailable")
      await run("osascript", ["-e", `tell application "System Events" to set position of the cursor to {${px}, ${py}}`], { timeout: 15000 })
    } else {
      if (!(await haveCommand("xdotool"))) throw new Error("Mouse control on Linux needs xdotool. Install with: sudo apt install xdotool")
      await run("xdotool", ["mousemove", String(px), String(py)], { timeout: 15000 })
    }
    return { ok: true, data: { moved: true, x: px, y: py, platform: currentPlatform() } }
  } catch (error) {
    return fail(`Could not move the mouse: ${(error as Error).message}`)
  }
}

export async function clickAt(
  x: number,
  y: number,
  button: string = "left",
  clicks: number = 1,
): Promise<DesktopResult> {
  const btn = button.toLowerCase()
  if (!["left", "right", "middle"].includes(btn)) return fail(`unknown mouse button: ${button}`)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fail("x and y must be numbers")
  if (!Number.isInteger(clicks) || clicks < 1 || clicks > 5) return fail("clicks must be between 1 and 5")
  const px = Math.round(x)
  const py = Math.round(y)
  try {
    if (currentPlatform() === "windows") {
      const flags: Record<string, [number, number]> = { left: [0x0002, 0x0004], right: [0x0008, 0x0010], middle: [0x0020, 0x0040] }
      const [down, up] = flags[btn]!
      const script = `Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class ZC {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
"@
[ZC]::SetCursorPos(${px}, ${py}) | Out-Null
Start-Sleep -Milliseconds 60`
      const loop = Array.from({ length: clicks })
        .map(() => `[ZC]::mouse_event(${down}, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[ZC]::mouse_event(${up}, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40`)
        .join("\n")
      await run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script + "\n" + loop], { timeout: 20000 })
    } else if (currentPlatform() === "macos") {
      const macButton = btn === "left" ? "left button" : btn === "right" ? "right button" : "middle button"
      const loop = Array.from({ length: clicks })
        .map(
          () => `tell application "System Events"
  click at {${px}, ${py}} using {${macButton}}
end tell
delay 0.05`,
        )
        .join("\n")
      await run(
        "osascript",
        ["-e", `tell application "System Events" to set position of the cursor to {${px}, ${py}}`, "-e", loop],
        { timeout: 25000 },
      )
    } else {
      if (!(await haveCommand("xdotool"))) throw new Error("Mouse control on Linux needs xdotool. Install with: sudo apt install xdotool")
      const macButton = btn === "left" ? 1 : btn === "right" ? 3 : 2
      const loop = Array.from({ length: clicks })
        .map(() => `xdotool mousemove ${px} ${py} click ${macButton} sleep 0.05`)
        .join("\n")
      await run("sh", ["-c", loop], { timeout: 20000 })
    }
    return { ok: true, data: { clicked: true, x: px, y: py, button: btn, clicks, platform: currentPlatform() } }
  } catch (error) {
    return fail(`Could not click: ${(error as Error).message}`)
  }
}

export async function dragMouse(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps: number = 20,
): Promise<DesktopResult> {
  if (!Number.isInteger(steps) || steps < 2 || steps > 200) return fail("steps must be between 2 and 200")
  const fx = Math.round(fromX)
  const fy = Math.round(fromY)
  const tx = Math.round(toX)
  const ty = Math.round(toY)
  try {
    if (currentPlatform() === "windows") {
      const script = `Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class ZD {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
"@
[ZD]::SetCursorPos(${fx}, ${fy}) | Out-Null
Start-Sleep -Milliseconds 80
[ZD]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
for ($i = 1; $i -le ${steps}; $i++) {
  $x = ${fx} + [int]((${tx} - ${fx}) * $i / ${steps})
  $y = ${fy} + [int]((${ty} - ${fy}) * $i / ${steps})
  [ZD]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 16
}
Start-Sleep -Milliseconds 60
[ZD]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
Write-Output 'dragged'`
      await run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 30000 })
    } else if (currentPlatform() === "macos") {
      const script = `tell application "System Events"
  set position of the cursor to {${fx}, ${fy}}
end tell
delay 0.1
tell application "System Events" to mouse down
tell application "System Events"
  repeat with i from 1 to ${steps}
    set f to i / ${steps}.0
    set x to ${fx} + (${tx} - ${fx}) * f
    set y to ${fy} + (${ty} - ${fy}) * f
    set position of the cursor to {round(x), round(y)}
    delay 0.016
  end repeat
end tell
delay 0.1
tell application "System Events" to mouse up`
      await run("osascript", ["-e", script], { timeout: 30000 })
    } else {
      if (!(await haveCommand("xdotool"))) throw new Error("Dragging on Linux needs xdotool. Install with: sudo apt install xdotool")
      const script = `
xdotool mousemove ${fx} ${fy}
sleep 0.1
xdotool mousedown 1
for i in $(seq 1 ${steps}); do
  x = ${fx} + ((${tx} - ${fx}) * i / ${steps})
  y = ${fy} + ((${ty} - ${fy}) * i / ${steps})
  xdotool mousemove $x $y
  sleep 0.016
done
xdotool mouseup 1
sleep 0.05`
      await run("sh", ["-c", script], { timeout: 30000 })
    }
    return { ok: true, data: { dragged: true, from: { x: fx, y: fy }, to: { x: tx, y: ty }, steps, platform: currentPlatform() } }
  } catch (error) {
    return fail(`Could not drag: ${(error as Error).message}`)
  }
}

export async function scrollAt(
  direction: string,
  amount: number,
  x?: number,
  y?: number,
): Promise<DesktopResult> {
  const dir = direction.toLowerCase()
  if (!["up", "down", "left", "right"].includes(dir)) return fail(`unknown scroll direction: ${direction}`)
  if (!Number.isInteger(amount) || amount < 1 || amount > 50) return fail("amount must be between 1 and 50")
  const notches = amount
  try {
    if (currentPlatform() === "windows") {
      const vertical = dir === "up" || dir === "down"
      const sign = dir === "up" || dir === "right" ? 1 : -1
      const move =
        x !== undefined && y !== undefined
          ? `[ZS]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
Start-Sleep -Milliseconds 50`
          : ""
      const script = `Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class ZS {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
"@
${move}
$step = ${sign * 120}
for ($i = 0; $i -lt ${notches}; $i++) {
  [ZS]::mouse_event(0x0800, 0, 0, [uint32](${vertical ? "$step" : "0"}), [UIntPtr]::Zero)
  if (${vertical ? "false" : "true"}) {
    [ZS]::mouse_event(0x01000, 0, 0, [uint32](${vertical ? "0" : "$step"}), [UIntPtr]::Zero)
  }
  Start-Sleep -Milliseconds 40
}
Write-Output 'scrolled'`
      await run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 20000 })
    } else if (currentPlatform() === "macos") {
      if (x !== undefined && y !== undefined) {
        await run("osascript", ["-e", `tell application "System Events" to set position of the cursor to {${Math.round(x)}, ${Math.round(y)}}`], { timeout: 15000 })
      }
      const steps = Array.from({ length: notches })
        .map(() => `tell application "System Events" to key code ${verticalKey(dir)} using {${buttonFor(dir)}}`)
        .join("\n")
      await run("osascript", ["-e", steps], { timeout: 20000 })
    } else {
      if (!(await haveCommand("xdotool"))) throw new Error("Scrolling on Linux needs xdotool. Install with: sudo apt install xdotool")
      const button = dir === "up" ? 4 : dir === "down" ? 5 : dir === "left" ? 6 : 7
      const move =
        x !== undefined && y !== undefined ? `xdotool mousemove ${Math.round(x)} ${Math.round(y)}\n` : ""
      const script = `${move}for i in $(seq 1 ${notches}); do xdotool click ${button}; sleep 0.05; done`
      await run("sh", ["-c", script], { timeout: 20000 })
    }
    return { ok: true, data: { scrolled: true, direction: dir, amount, platform: currentPlatform() } }
  } catch (error) {
    return fail(`Could not scroll: ${(error as Error).message}`)
  }
}

function verticalKey(dir: string): number {
  if (dir === "up") return 126
  if (dir === "down") return 125
  if (dir === "left") return 123
  return 124
}
function buttonFor(_dir: string): string {
  return "command down"
}

// ── Keyboard ───────────────────────────────────────────────────────────────────

export async function typeText(text: string, intervalMs: number = 0): Promise<DesktopResult> {
  if (typeof text !== "string" || text.length === 0) return fail("text is required")
  if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 1000)
    return fail("intervalMs must be between 0 and 1000")
  try {
    if (currentPlatform() === "windows") {
      const script = `Add-Type -AssemblyName System.Windows.Forms
$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(text)}'))
[System.Windows.Forms.Clipboard]::SetText($text)
Start-Sleep -Milliseconds 40
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 60
Write-Output 'typed'`
      await run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 20000 })
    } else if (currentPlatform() === "macos") {
      const script = `set the clipboard to "${text.replace(/[\\"]/g, "\\$&")}"
delay 0.1
tell application "System Events"
  keystroke "v" using command down
end tell
delay 0.1`
      await run("osascript", ["-e", script], { timeout: 20000 })
    } else {
      if (!(await haveCommand("xdotool"))) throw new Error("Typing on Linux needs xdotool. Install with: sudo apt install xdotool")
      if (await haveCommand("xclip")) {
        await run("sh", ["-c", `printf '%s' "${text.replace(/(["\\$`])/g, "\\$1")}" | xclip -selection clipboard`], { timeout: 10000 })
        await run("sh", ["-c", "sleep 0.15; xdotool key --clearmodifiers ctrl+v"], { timeout: 15000 })
      } else {
        throw new Error("Typing non-ASCII text on Linux needs xclip. Install with: sudo apt install xclip")
      }
    }
    // A per-character interval makes the keystrokes arrive spread out, which some apps need
    // before they treat a burst as a real user rather than a paste.
    if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs))
    return {
      ok: true,
      data: { typed: true, characters: [...text].length, intervalMs, platform: currentPlatform() },
    }
  } catch (error) {
    return fail(`Could not type text: ${(error as Error).message}`)
  }
}

export async function pressKeys(combo: string): Promise<DesktopResult> {
  try {
    const keys = parseCombo(combo)
    if (currentPlatform() === "windows") {
      const codes = keys.map((k) => (k.length === 1 ? k.toUpperCase().charCodeAt(0) : VK[k]!))
      const down = codes.map((c) => `[ZK]::keybd_event(${c}, 0, 0, [UIntPtr]::Zero)`).join("\nStart-Sleep -Milliseconds 20\n")
      const up = codes
        .slice()
        .reverse()
        .map((c) => `[ZK]::keybd_event(${c}, 0, 2, [UIntPtr]::Zero)`)
        .join("\nStart-Sleep -Milliseconds 20\n")
      const script = `Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class ZK { [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra); }
"@
${down}
Start-Sleep -Milliseconds 20
${up}
Write-Output 'pressed'`
      await run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 15000 })
    } else if (currentPlatform() === "macos") {
      const modifiers = keys.filter((k) => ["ctrl", "alt", "shift", "cmd", "command", "meta", "super"].includes(k))
      const plain = keys.filter((k) => !modifiers.includes(k))
      const usingParts = [
        ...modifiers.map((m) => (m === "ctrl" ? "control down" : m === "cmd" || m === "command" || m === "meta" || m === "super" ? "command down" : m)),
      ]
      const target = plain[0] ?? ""
      if (plain.length > 1) throw new Error("macOS supports a single non-modifier key per combination")
      const usingClause = usingParts.length > 0 ? ` using {${usingParts.join(", ")}}` : ""
      if (target.length === 1) {
        await run("osascript", ["-e", `tell application "System Events" to keystroke "${target}"${usingClause}`], { timeout: 15000 })
      } else if (VK[target] !== undefined) {
        await run("osascript", ["-e", `tell application "System Events" to key code ${macKeyCode(target)}${usingClause}`], { timeout: 15000 })
      } else {
        throw new Error(`unknown key: ${target}`)
      }
    } else {
      if (!(await haveCommand("xdotool"))) throw new Error("Key presses on Linux need xdotool. Install with: sudo apt install xdotool")
      const mapped = keys.map((k) => (k.length === 1 ? k : linuxKeyName(k)))
      await run("xdotool", ["key", "--clearmodifiers", ...mapped], { timeout: 15000 })
    }
    return { ok: true, data: { pressed: true, keys: combo, platform: currentPlatform() } }
  } catch (error) {
    return fail(`Could not press keys: ${(error as Error).message}`)
  }
}

const LINUX_KEYS: Record<string, string> = {
  enter: "Return", return: "Return", tab: "Tab", esc: "Escape", escape: "Escape",
  space: "space", backspace: "BackSpace", delete: "Delete", insert: "Insert",
  home: "Home", end: "End", pageup: "Prior", pagedown: "Next",
  up: "Up", down: "Down", left: "Left", right: "Right",
  shift: "shift", ctrl: "ctrl", control: "ctrl", alt: "alt", altgr: "Alt_R",
  win: "super", meta: "super", super: "super", command: "super", cmd: "super",
  f1: "F1", f2: "F2", f3: "F3", f4: "F4", f5: "F5", f6: "F6", f7: "F7",
  f8: "F8", f9: "F9", f10: "F10", f11: "F11", f12: "F12",
  printscreen: "Print", pause: "Pause",
}

function linuxKeyName(key: string): string {
  const mapped = LINUX_KEYS[key]
  if (!mapped) throw new Error(`unknown key for Linux: ${key}`)
  return mapped
}

const MAC_KEYS: Record<string, number> = {
  enter: 36, return: 36, tab: 48, esc: 53, escape: 53, space: 49,
  delete: 51, backspace: 51, home: 115, end: 119, pageup: 116, pagedown: 121,
  up: 126, down: 125, left: 123, right: 124, f1: 122, f2: 120, f3: 99,
  f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
}

function macKeyCode(key: string): number {
  const code = MAC_KEYS[key]
  if (code === undefined) throw new Error(`unknown key for macOS: ${key}`)
  return code
}

// ── Windows ────────────────────────────────────────────────────────────────────

export type WindowInfo = {
  handle: string
  title: string
  className: string
  pid: number
  x: number
  y: number
  width: number
  height: number
}

export async function listWindows(): Promise<WindowInfo[]> {
  if (currentPlatform() === "windows") {
    const script = `Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class ZW {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$found = New-Object System.Collections.ArrayList
$cb = [ZW+EnumProc]{
  param($h, $l)
  if ([ZW]::IsWindowVisible($h)) {
    $len = [ZW]::GetWindowTextLength($h)
    $title = New-Object System.Text.StringBuilder (($len + 1))
    [void][ZW]::GetWindowText($h, $title, $len + 1)
    if ($title.Length -gt 0) {
      $cls = New-Object System.Text.StringBuilder 256
      [void][ZW]::GetClassName($h, $cls, 256)
      $r = New-Object ZW+RECT
      [ZW]::GetWindowRect($h, [ref]$r) | Out-Null
      $pid2 = [uint32]0
      [void][ZW]::GetWindowThreadProcessId($h, [ref]$pid2)
      [void]$found.Add([PSCustomObject]@{
        h = $h.ToInt64(); t = $title.ToString(); c = $cls.ToString(); p = $pid2
        x = $r.Left; y = $r.Top; w = $r.Right - $r.Left; ht = $r.Bottom - $r.Top
      })
    }
  }
  return $true
}
[void][ZW]::EnumWindows($cb, [IntPtr]::Zero)
foreach ($w in $found) { Write-Output ($w.h.ToString() + '~' + $w.t + '~' + $w.c + '~' + $w.p + '~' + $w.x + '~' + $w.y + '~' + $w.w + '~' + $w.ht) }`
    const out = await run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 30000 })
    return parseWindows(out, "~")
  }

  if (currentPlatform() === "macos") {
    const script = `tell application "System Events"
  set out to ""
  repeat with proc in (every process whose background only is false)
    repeat with win in (every window of proc)
      try
        set p to position of win
        set s to size of win
        set out to out & (unix id of proc as string) & "~" & (name of win) & "~" & (class of win as string) & "~" & (unix id of proc as string) & "~" & (item 1 of p) & "~" & (item 2 of p) & "~" & (item 1 of s) & "~" & (item 2 of s) & linefeed
      end try
    end repeat
  end repeat
  return out
end tell`
    const out = await run("osascript", ["-e", script], { timeout: 30000 })
    return parseWindows(out, "~")
  }

  if (!(await haveCommand("wmctrl"))) {
    throw new Error("Listing windows on Linux needs wmctrl. Install with: sudo apt install wmctrl")
  }
  const out = await run("wmctrl", ["-lp"], { timeout: 15000 })
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // wmctrl -l prints: <desktop> <pid> <host> <geometry x,y,w,h> <class> <title>
      const match = line.match(
        /^(\S+)\s+(\d+)\s+(\S+)\s+(-?\d+),(-?\d+),(-?\d+),(-?\d+)\s+(.*)$/,
      )
      if (!match) return null
      const [, desktop, pid, , x, y, width, height, rest] = match
      const spaceIndex = rest.indexOf(" ")
      return {
        handle: (desktop ?? "").replace(/^0x/, ""),
        title: spaceIndex === -1 ? (rest ?? "") : (rest ?? "").slice(spaceIndex + 1),
        className: spaceIndex === -1 ? "" : (rest ?? "").slice(0, spaceIndex),
        pid: Number(pid),
        x: Number(x),
        y: Number(y),
        width: Number(width),
        height: Number(height),
      }
    })
    .filter((w): w is WindowInfo => w !== null)
}

function parseWindows(out: string, sep: string): WindowInfo[] {
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [handle, title, className, pid, x, y, width, height] = line.split(sep)
      return {
        handle: handle ?? "",
        title: title ?? "",
        className: className ?? "",
        pid: Number(pid),
        x: Number(x),
        y: Number(y),
        width: Number(width),
        height: Number(height),
      }
    })
}

export async function openApp(target: string): Promise<DesktopResult> {
  if (!target || typeof target !== "string") return fail("app is required")
  const isPath = /[\\/]/.test(target) || /\.[a-z]{2,4}$/i.test(target)
  try {
    if (currentPlatform() === "windows") {
      if (isPath) {
        const resolved = path.resolve(target)
        await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", `Start-Process -FilePath '${resolved.replace(/'/g, "''")}'`], { timeout: 20000 })
        return { ok: true, data: { launched: true, app: target, path: resolved, via: "path" } }
      }
      const script = `$c = Get-Command '${target.replace(/'/g, "''")}' -ErrorAction SilentlyContinue
if ($c) { Start-Process -FilePath $c.Source; Write-Output $c.Source }
else { Start-Process '${target.replace(/'/g, "''")}' -ErrorAction Stop; Write-Output 'shell-resolved' }`
      const out = await run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 25000 })
      const resolved = out.trim().split(/\r?\n/).pop()?.trim() ?? ""
      return { ok: true, data: { launched: true, app: target, path: resolved, via: resolved === "shell-resolved" ? "shell" : "command" } }
    }

    if (isPath) {
      const resolved = path.resolve(target)
      const opener = currentPlatform() === "macos" ? "open" : "xdg-open"
      await run(opener, [resolved], { timeout: 25000 })
      return { ok: true, data: { launched: true, app: target, path: resolved, via: "path" } }
    }

    if (currentPlatform() === "macos") {
      const script = `tell application "System Events"
  if exists application process "${target}" then
    tell application "${target}" to activate
  else
    do shell script "open -a ${target}"
  end if
end tell`
      await run("osascript", ["-e", script], { timeout: 25000 })
      return { ok: true, data: { launched: true, app: target, via: "osascript" } }
    }

    await run("sh", ["-c", `nohup ${target} >/dev/null 2>&1 &`], { timeout: 15000 })
    return { ok: true, data: { launched: true, app: target, via: "shell" } }
  } catch (error) {
    return fail(`Could not open ${target}: ${(error as Error).message}`)
  }
}

export async function desktopInfo(): Promise<DesktopResult> {
  try {
    let screen: { width: number; height: number } | null = null
    if (currentPlatform() === "windows") {
      const out = await run(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command",
          "Add-Type -AssemblyName System.Windows.Forms; $v = [System.Windows.Forms.SystemInformation]::VirtualScreen; Write-Output ($v.Width.ToString() + '~' + $v.Height.ToString())"],
        { timeout: 15000 },
      )
      const [w, h] = out.split("~").map((s) => Number(s.trim()))
      screen = { width: w, height: h }
    } else if (currentPlatform() === "macos") {
      const out = await run("osascript", ["-e", 'tell application "Finder" to get bounds of window of desktop'], { timeout: 15000 })
      const numbers = out.match(/-?\d+/g)?.map(Number) ?? []
      screen = { width: numbers[2] ?? 0, height: numbers[3] ?? 0 }
    } else if (await haveCommand("xrandr")) {
      const out = await run("sh", ["-c", "xrandr | grep '\\*' | head -1"], { timeout: 10000 })
      const numbers = out.match(/(\d+)x(\d+)/)
      screen = { width: Number(numbers?.[1] ?? 0), height: Number(numbers?.[2] ?? 0) }
    }
    return {
      ok: true,
      data: {
        platform: currentPlatform(),
        release: os.release(),
        hostname: os.hostname(),
        user: os.userInfo().username,
        arch: process.arch,
        screen,
      },
    }
  } catch (error) {
    return fail(`Could not read desktop information: ${(error as Error).message}`)
  }
}
