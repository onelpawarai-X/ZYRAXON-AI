// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * PREVIEW INPUT
 *
 * Forwards a click, a keystroke or a scroll from the Preview panel into the real
 * application the panel is mirroring. Mirroring alone is one-way — the user can
 * watch a window but cannot touch it — so without this the panel is a video, not
 * a window. With it, the panel is a working copy of the app.
 *
 * Each platform has its own pointer/keyboard layer and none of them is shared, so
 * this dispatches to the tool that exists on the host:
 *
 *   Windows  PowerShell + user32 SetCursorPos / mouse_event / keybd_event
 *   macOS    osascript (System Events)
 *   Linux    XTEST through ctypes, falling back to xdotool
 *
 * Linux deliberately prefers XTEST over xdotool: xdotool is an optional package
 * many desktops never install, while libX11 and libXtst ship with every X server,
 * so the XTEST path works on a stock machine with nothing to install. The work is
 * spawned rather than bound through FFI so the same code runs in a packaged build
 * on all three platforms without a native addon.
 */

import { execFile } from "node:child_process"

export type PreviewInputResult = { ok: boolean; error?: string }

const IS_WIN = process.platform === "win32"
const IS_MAC = process.platform === "darwin"

function run(cmd: string, args: string[], timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (error) => (error ? reject(error) : resolve()))
  })
}

/** Same as run(), but resolves with stdout instead of discarding it. */
function runCapture(cmd: string, args: string[], timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (error, stdout) => (error ? reject(error) : resolve(String(stdout))))
  })
}

async function has(cmd: string): Promise<boolean> {
  try {
    await run(IS_WIN ? "where" : "which", [cmd], 3000)
    return true
  } catch {
    return false
  }
}

// ─── Linux: XTEST through ctypes ───────────────────────────────────────────
// ctypes can load libX11/libXtst directly, which removes any package dependency.
// The operation and its arguments arrive as JSON so one script serves click, move,
// scroll, type and key.
const XTEST_SCRIPT = String.raw`
import ctypes, ctypes.util, json, sys, time

op = sys.argv[1]
arg = json.loads(sys.argv[2])

x11 = ctypes.util.find_library("X11") or "libX11.so.6"
xtst = ctypes.util.find_library("Xtst") or "libXtst.so.6"
try:
    X = ctypes.CDLL(x11)
    T = ctypes.CDLL(xtst)
except OSError:
    sys.exit(3)

X.XOpenDisplay.restype = ctypes.c_void_p
X.XOpenDisplay.argtypes = [ctypes.c_char_p]
d = X.XOpenDisplay(None)
if not d:
    sys.exit(4)

T.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
T.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
T.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
X.XFlush.argtypes = [ctypes.c_void_p]
X.XStringToKeysym.restype = ctypes.c_ulong
X.XStringToKeysym.argtypes = [ctypes.c_char_p]
X.XKeysymToKeycode.restype = ctypes.c_ubyte
X.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]

def flush():
    X.XFlush(d)
    time.sleep(0.008)

def move(x, y):
    T.XTestFakeMotionEvent(d, -1, int(x), int(y), 0)
    flush()

def button(b, down):
    T.XTestFakeButtonEvent(d, b, 1 if down else 0, 0)
    flush()

def click_button(b, times=1):
    # Hold the press briefly: a press and release in the same event batch is
    # dropped by some toolkits, Chromium included, so the click never registers.
    for _ in range(times):
        button(b, True)
        time.sleep(0.04)
        button(b, False)
        time.sleep(0.06)

def keycode(name):
    return X.XKeysymToKeycode(d, X.XStringToKeysym(name.encode()))

def key_down(name):
    T.XTestFakeKeyEvent(d, keycode(name), 1, 0)
    flush()

def key_up(name):
    T.XTestFakeKeyEvent(d, keycode(name), 0, 0)
    flush()

SHIFTED = {
    "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7",
    "*": "8", "(": "9", ")": "0", "_": "minus", "+": "equal",
    "{": "bracketleft", "}": "bracketright", "|": "backslash",
    ":": "semicolon", '"': "apostrophe", "<": "comma", ">": "period",
    "?": "slash", "~": "grave",
}
PLAIN = {
    " ": "space", "-": "minus", "=": "equal", "[": "bracketleft",
    "]": "bracketright", "\\": "backslash", ";": "semicolon",
    "'": "apostrophe", ",": "comma", ".": "period", "/": "slash",
    chr(96): "grave",
}
NAMED = {
    "enter": "Return", "return": "Return", "tab": "Tab", "escape": "Escape",
    "esc": "Escape", "backspace": "BackSpace", "delete": "Delete",
    "arrowup": "Up", "arrowdown": "Down", "arrowleft": "Left",
    "arrowright": "Right", "up": "Up", "down": "Down", "left": "Left",
    "right": "Right", "home": "Home", "end": "End", "pageup": "Prior",
    "pagedown": "Next", "space": "space",
}
MODS = {
    "ctrl": "Control_L", "control": "Control_L", "shift": "Shift_L",
    "alt": "Alt_L", "cmd": "Super_L", "meta": "Super_L", "super": "Super_L",
}

def type_char(ch):
    shift = False
    if ch.isalpha() and ch.isupper():
        name = ch.lower()
        shift = True
    elif ch in SHIFTED:
        name = SHIFTED[ch]
        shift = True
    elif ch in PLAIN:
        name = PLAIN[ch]
    elif ch.isalnum():
        name = ch
    else:
        return
    if shift:
        key_down("Shift_L")
    key_down(name)
    key_up(name)
    if shift:
        key_up("Shift_L")
    time.sleep(0.006)

if op == "click":
    move(arg["x"], arg["y"])
    time.sleep(0.08)
    b = 3 if arg.get("button") == "right" else 2 if arg.get("button") == "middle" else 1
    click_button(b, 2 if arg.get("double") else 1)
elif op == "move":
    move(arg["x"], arg["y"])
elif op == "scroll":
    move(arg["x"], arg["y"])
    steps = int(round(arg.get("dy", 0) / 60.0))
    steps = max(-30, min(30, steps)) or (1 if arg.get("dy", 0) > 0 else -1)
    click_button(5 if steps > 0 else 4, abs(steps))
elif op == "type":
    for ch in arg.get("text", ""):
        type_char(ch)
elif op == "key":
    keys = [str(k).lower() for k in arg.get("keys", [])]
    mods = [MODS[k] for k in keys if k in MODS]
    mains = [k for k in keys if k not in MODS]
    if not mains:
        sys.exit(5)
    main = NAMED.get(mains[-1], mains[-1])
    for m in mods:
        key_down(m)
    key_down(main)
    key_up(main)
    for m in reversed(mods):
        key_up(m)
sys.exit(0)
`

async function xtest(op: string, arg: Record<string, unknown>): Promise<void> {
  await run("python3", ["-c", XTEST_SCRIPT, op, JSON.stringify(arg)], 20000)
}

// ─── Windows PowerShell helpers ────────────────────────────────────────────
const WIN_TYPE = String.raw`Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class ZPv {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, System.UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, System.UIntPtr e);
}
"@`

function ps(script: string, timeout = 20000): Promise<void> {
  return run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], timeout)
}

/** Map a browser KeyboardEvent key to a Windows virtual-key code. */
function winVk(key: string): number | null {
  const k = key.toLowerCase()
  if (k.length === 1 && k >= "a" && k <= "z") return k.toUpperCase().charCodeAt(0)
  if (k.length === 1 && k >= "0" && k <= "9") return k.charCodeAt(0)
  const named: Record<string, number> = {
    enter: 0x0d, tab: 0x09, escape: 0x1b, backspace: 0x08, delete: 0x2e,
    arrowup: 0x26, arrowdown: 0x28, arrowleft: 0x25, arrowright: 0x27,
    home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
    " ": 0x20, space: 0x20,
    f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75,
    f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7a, f12: 0x7b,
  }
  return named[k] ?? null
}

/** Map a browser key to a macOS key code, which osascript expects. */
function macKeyCode(key: string): number | null {
  const k = key.toLowerCase()
  const map: Record<string, number> = {
    a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11,
    q: 12, w: 13, e: 14, r: 15, y: 16, t: 17, "1": 18, "2": 19, "3": 20,
    "4": 21, "6": 22, "5": 23, "9": 25, "7": 26, "8": 28, "0": 29,
    o: 31, u: 32, i: 34, p: 35, l: 37, j: 38, k: 40, n: 45, m: 46,
    return: 36, enter: 36, tab: 48, space: 49, " ": 49, delete: 51,
    escape: 53, backspace: 51, left: 123, right: 124, down: 125, up: 126,
    home: 115, end: 119, pageup: 116, pagedown: 121,
  }
  return map[k] ?? null
}

const MAC_MODS = ["cmd", "meta", "command", "shift", "alt", "option", "ctrl", "control"]

export async function previewClick(
  x: number,
  y: number,
  button: "left" | "right" | "middle" = "left",
  double = false,
): Promise<PreviewInputResult> {
  const px = Math.round(x)
  const py = Math.round(y)
  if (!Number.isFinite(px) || !Number.isFinite(py)) return { ok: false, error: "x and y must be numbers" }
  try {
    if (IS_WIN) {
      const flags = { left: [0x0002, 0x0004], right: [0x0008, 0x0010], middle: [0x0020, 0x0040] }[button]
      const clicks = Array.from({ length: double ? 2 : 1 })
        .map(() => `[ZPv]::mouse_event(${flags[0]}, 0, 0, 0, [System.UIntPtr]::Zero)
Start-Sleep -Milliseconds 25
[ZPv]::mouse_event(${flags[1]}, 0, 0, 0, [System.UIntPtr]::Zero)
Start-Sleep -Milliseconds 40`)
        .join("\n")
      await ps(`${WIN_TYPE}
[ZPv]::SetCursorPos(${px}, ${py}) | Out-Null
Start-Sleep -Milliseconds 60
${clicks}`)
    } else if (IS_MAC) {
      const btn = button === "right" ? "right button" : button === "middle" ? "middle button" : "left button"
      const body = double
        ? `tell application "System Events" to click at {${px}, ${py}}
delay 0.08
tell application "System Events" to click at {${px}, ${py}}`
        : `tell application "System Events" to click at {${px}, ${py}} using {${btn}}`
      await run("osascript", ["-e", `tell application "System Events" to set position of the cursor to {${px}, ${py}}`, "-e", body])
    } else {
      try {
        await xtest("click", { x: px, y: py, button, double })
      } catch {
        // No XTEST (unusual), so use xdotool if it happens to be installed.
        if (!(await has("xdotool"))) return { ok: false, error: "Input forwarding on Linux needs libXtst (XTEST) or xdotool" }
        const btn = button === "right" ? "3" : button === "middle" ? "2" : "1"
        const repeat = double ? ["--repeat", "2", "--delay", "60"] : []
        await run("xdotool", ["mousemove", String(px), String(py), "click", ...repeat, btn])
      }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function previewScroll(x: number, y: number, dy: number, dx = 0): Promise<PreviewInputResult> {
  const px = Math.round(x)
  const py = Math.round(y)
  const vSteps = Math.max(-20, Math.min(20, Math.round(dy / 60)))
  try {
    if (IS_WIN) {
      const wheel = Math.round(-vSteps * 120)
      await ps(`${WIN_TYPE}
[ZPv]::SetCursorPos(${px}, ${py}) | Out-Null
Start-Sleep -Milliseconds 40
[ZPv]::mouse_event(0x0800, 0, 0, [uint32]([int64](${wheel}) -band 0xffffffffL), [System.UIntPtr]::Zero)`)
    } else if (IS_MAC) {
      await run("osascript", ["-e", `tell application "System Events" to set position of the cursor to {${px}, ${py}}`, "-e", `tell application "System Events" to scroll {0, ${-vSteps * 3}}`])
    } else {
      try {
        await xtest("scroll", { x: px, y: py, dy })
      } catch {
        if (!(await has("xdotool"))) return { ok: false, error: "Input forwarding on Linux needs libXtst (XTEST) or xdotool" }
        const btn = vSteps > 0 ? 5 : 4
        await run("xdotool", ["mousemove", String(px), String(py), "click", "--repeat", String(Math.max(1, Math.abs(vSteps))), "--delay", "30", String(btn)])
      }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function previewKey(keys: string[]): Promise<PreviewInputResult> {
  try {
    if (IS_WIN) {
      const codes = keys.map(winVk).filter((v): v is number => v !== null)
      if (codes.length === 0) return { ok: false, error: "unsupported key" }
      const body = codes
        .map((vk) => `[ZPv]::keybd_event(${vk}, 0, 0, [System.UIntPtr]::Zero)`)
        .concat(codes.slice().reverse().map((vk) => `[ZPv]::keybd_event(${vk}, 0, 2, [System.UIntPtr]::Zero)`))
        .join("\n")
      await ps(`${WIN_TYPE}\n${body}`)
    } else if (IS_MAC) {
      const lowered = keys.map((k) => k.toLowerCase())
      const mods = lowered.filter((k) => MAC_MODS.includes(k))
      const main = lowered.find((k) => !MAC_MODS.includes(k))
      if (!main) return { ok: false, error: "a non-modifier key is required" }
      const code = macKeyCode(main)
      if (code === null) return { ok: false, error: `unsupported key ${main}` }
      const macMods = mods.map((m) =>
        ["cmd", "meta", "command"].includes(m) ? "command down" : ["alt", "option"].includes(m) ? "option down" : m === "shift" ? "shift down" : "control down",
      )
      const using = macMods.length > 0 ? ` using {${macMods.join(", ")}}` : ""
      await run("osascript", ["-e", `tell application "System Events" to key code ${code}${using}`])
    } else {
      try {
        await xtest("key", { keys })
      } catch {
        if (!(await has("xdotool"))) return { ok: false, error: "Input forwarding on Linux needs libXtst (XTEST) or xdotool" }
        const aliases: Record<string, string> = {
          enter: "Return", tab: "Tab", escape: "Escape", backspace: "BackSpace",
          delete: "Delete", arrowup: "Up", arrowdown: "Down", arrowleft: "Left",
          arrowright: "Right", home: "Home", end: "End", pageup: "Page_Up",
          pagedown: "Page_Down", " ": "space", control: "ctrl", shift: "shift",
          alt: "alt", meta: "super",
        }
        const parts = keys.map((k) => (k.length === 1 ? k : aliases[k.toLowerCase()] ?? k))
        await run("xdotool", ["key", "--clearmodifiers", parts.join("+")])
      }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function previewType(text: string): Promise<PreviewInputResult> {
  if (!text) return { ok: true }
  try {
    if (IS_WIN) {
      await ps(`$ws = New-Object -ComObject WScript.Shell
$ws.SendKeys('${text.replace(/[+^%~()[\]{}]/g, "{$&}")}')`)
    } else if (IS_MAC) {
      await run("osascript", ["-e", `tell application "System Events" to keystroke "${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`])
    } else {
      try {
        await xtest("type", { text })
      } catch {
        if (!(await has("xdotool"))) return { ok: false, error: "Input forwarding on Linux needs libXtst (XTEST) or xdotool" }
        await run("xdotool", ["type", "--delay", "12", text])
      }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function previewMove(x: number, y: number): Promise<PreviewInputResult> {
  const px = Math.round(x)
  const py = Math.round(y)
  try {
    if (IS_WIN) {
      await ps(`${WIN_TYPE}\n[ZPv]::SetCursorPos(${px}, ${py}) | Out-Null`)
    } else if (IS_MAC) {
      await run("osascript", ["-e", `tell application "System Events" to set position of the cursor to {${px}, ${py}}`])
    } else {
      try {
        await xtest("move", { x: px, y: py })
      } catch {
        if (!(await has("xdotool"))) return { ok: false, error: "Input forwarding on Linux needs libXtst (XTEST) or xdotool" }
        await run("xdotool", ["mousemove", String(px), String(py)])
      }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Screen rectangle of a window, so a click at a point inside the mirrored frame
 * can be translated into the absolute screen coordinate the OS expects.
 *
 * The preview shows the window's content area; the frame's own position and size
 * are what turn a point inside the frame into a screen point.
 */
export type WindowGeometry = { x: number; y: number; width: number; height: number }

export async function previewWindowGeometry(title: string): Promise<WindowGeometry | null> {
  const needle = title.trim().toLowerCase()
  if (!needle) return null
  try {
    if (IS_WIN) {
      const script = String.raw`Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class ZGeo {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder t, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
}
"@
$needle = "__NEEDLE__"
$script:found = $null
$cb = [ZGeo+EnumProc]{
  param($h, $l)
  if ([ZGeo]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 512
    [void][ZGeo]::GetWindowText($h, $sb, 512)
    if ($sb.ToString().ToLower().Contains($needle)) {
      $r = New-Object ZGeo+RECT
      [ZGeo]::GetWindowRect($h, [ref]$r) | Out-Null
      $script:found = "$($r.Left),$($r.Top),$($r.Right - $r.Left),$($r.Bottom - $r.Top)"
    }
  }
  return $true
}
[ZGeo]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($found) { Write-Output $found }`.replace("__NEEDLE__", needle.replace(/[\\"$`]/g, ""))
      const out = await runCapture("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
      const [x, y, w, h] = out.trim().split(",").map(Number)
      if ([x, y, w, h].some((v) => !Number.isFinite(v)) || !w || !h) return null
      return { x: x!, y: y!, width: w!, height: h! }
    }
    if (IS_MAC) {
      const safe = needle.replace(/[\\"]/g, "")
      const out = await runCapture("osascript", ["-e",
        `tell application "System Events"
set matches to (every window of (every process whose visible is true) whose name contains "${safe}")
if (count of matches) > 0 then
  set w to item 1 of matches
  set p to position of w
  set s to size of w
  return ((item 1 of p) as text) & "," & ((item 2 of p) as text) & "," & ((item 1 of s) as text) & "," & ((item 2 of s) as text)
end if
end tell`])
      const [x, y, w, h] = out.trim().split(",").map(Number)
      if ([x, y, w, h].some((v) => !Number.isFinite(v)) || !w || !h) return null
      return { x: x!, y: y!, width: w!, height: h! }
    }
    // Linux: read the window tree and match the title, then ask xwininfo for the
    // absolute corner and size. xwininfo ships with x11-utils, which any X session has.
    const ids: string[] = []
    if (await has("xdotool")) {
      try {
        const out = await runCapture("xdotool", ["search", "--name", needle])
        ids.push(...out.trim().split("\n").filter(Boolean))
      } catch {
        /* fall through to the tree scan */
      }
    }
    if (ids.length === 0) {
      const tree = await runCapture("xwininfo", ["-root", "-children"])
      const re = /^\s*(0x[0-9a-fA-F]+)\s+"([^"]*)"/gm
      let m: RegExpExecArray | null
      while ((m = re.exec(tree)) !== null) {
        if (m[2]!.toLowerCase().includes(needle)) ids.push(m[1]!)
      }
    }
    for (const id of ids) {
      try {
        const info = await runCapture("xwininfo", ["-id", id])
        const abs = /Absolute upper-left X:\s*(-?\d+)[\s\S]*Absolute upper-left Y:\s*(-?\d+)[\s\S]*Width:\s*(\d+)[\s\S]*Height:\s*(\d+)/.exec(info)
        if (abs) return { x: Number(abs[1]), y: Number(abs[2]), width: Number(abs[3]), height: Number(abs[4]) }
      } catch {
        continue
      }
    }
    return null
  } catch {
    return null
  }
}
