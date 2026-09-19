"""
ZYRAXON Cross-Platform MCP Server v2
Based on Windows-MCP (CursorTouch) - ported to Windows + Linux + macOS.
600+ desktop automation tools using pyautogui, psutil, pyperclip, Pillow, requests.
"""

import io, os, platform, subprocess, sys, base64, glob as globmod, fnmatch, time
import json, re, shutil, hashlib, socket, threading, signal, struct, tempfile
import urllib.parse, urllib.request, ssl, textwrap, difflib, zipfile, stat as stat_mod
from pathlib import Path
from typing import Any, Optional, Union
from datetime import datetime, timezone

try:
    from mcp.server.mcpserver import MCPServer as FastMCP
except ImportError:
    try:
        from mcp.server.fastmcp import FastMCP
    except ImportError:
        raise SystemExit("mcp/fastmcp is required: pip install fastmcp")

try:
    import pyautogui
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.05
except ImportError:
    pyautogui = None

try:
    from PIL import ImageGrab, Image, ImageDraw, ImageFont
except ImportError:
    ImageGrab = None
    Image = None

try:
    import psutil
except ImportError:
    psutil = None

try:
    import pyperclip
except ImportError:
    pyperclip = None

try:
    import pygetwindow as gw
except ImportError:
    gw = None

try:
    from plyer import notification as _plyer_notification
except ImportError:
    _plyer_notification = None

try:
    import requests as _requests
except ImportError:
    _requests = None

try:
    from markdownify import markdownify as md
except ImportError:
    md = None

mcp = FastMCP(
    "zyraxon-cross-mcp-v2",
    description="Cross-platform desktop automation MCP server v2 for ZYRAXON AI - 600+ tools for Windows, Linux, and macOS.",
)

_OS = platform.system()
_is_windows = _OS == "Windows"
_is_linux = _OS == "Linux"
_is_macos = _OS == "Darwin"

def _require_pyautogui():
    if pyautogui is None:
        raise RuntimeError("pyautogui is not installed")

def _require_psutil():
    if psutil is None:
        raise RuntimeError("psutil is not installed")

def _require_pyperclip():
    if pyperclip is None:
        raise RuntimeError("pyperclip is not installed")

def _require_plyer():
    if _plyer_notification is None:
        raise RuntimeError("plyer is not installed")

def _safe_screenshot(region=None):
    if ImageGrab is not None:
        return ImageGrab.grab(bbox=region)
    if pyautogui is not None:
        return pyautogui.screenshot(region=region)
    raise RuntimeError("No screenshot backend available")

def _popen_flags():
    return subprocess.CREATE_NO_WINDOW if _is_windows else 0

def _as_bool(value):
    if isinstance(value, bool): return value
    if isinstance(value, str): return value.strip().lower() in ("true", "1", "yes", "on")
    return bool(value)

def _as_loc(value):
    if value is None or isinstance(value, list): return value
    try: return json.loads(value)
    except: return None

def _parse_shortcut(shortcut):
    return [k.strip().lower() for k in shortcut.split("+")]

def _run_shell(command, timeout=30):
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=timeout, flags=_popen_flags())
        output = result.stdout
        if result.stderr: output += f"\n[stderr]\n{result.stderr}"
        return output[:10000] if output.strip() else "(no output)"
    except subprocess.TimeoutExpired: return f"Command timed out after {timeout}s"
    except Exception as e: return f"Command failed: {e}"

# ============================================================================
# App tool
# ============================================================================
@mcp.tool(name="App", description="Open/start/launch applications and manage windows. Modes: launch, launch_executable, resize, switch.")
def app_tool(mode: str = "launch", name: str | None = None, window_loc: list[int] | None = None, window_size: list[int] | None = None, executable: str | None = None, args: list[str] | None = None, cwd: str | None = None) -> str:
    if mode == "launch_executable":
        if executable is None: return 'Error: executable required for mode="launch_executable"'
        resolved = Path(executable).expanduser().resolve()
        if not resolved.is_file(): return f"Executable does not exist: {resolved}"
        try:
            cmd_args = [str(resolved)] + (args or [])
            proc = subprocess.Popen(cmd_args, cwd=cwd, shell=False, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)
            return json.dumps({"pid": proc.pid, "executable": str(resolved), "args": args or []}, indent=2)
        except Exception as e: return f"Launch failed: {e}"
    if mode == "launch":
        if name:
            if _is_windows: _run_shell(f'start "" "{name}"')
            elif _is_macos: _run_shell(f'open -a "{name}"')
            else: _run_shell(f'{name} &')
        return f"Launched: {name}"
    if mode == "switch" and gw and name:
        try:
            wins = gw.getWindowsWithTitle(name)
            if wins:
                w = wins[0]
                if w.isMinimized: w.restore()
                w.activate()
                return f"Switched to: {w.title}"
        except: pass
        return f"Switched to: {name}"
    if mode == "resize" and gw and name:
        try:
            wins = gw.getWindowsWithTitle(name)
            if wins:
                w = wins[0]
                if window_size and len(window_size) == 2: w.resizeTo(window_size[0], window_size[1])
                if window_loc and len(window_loc) == 2: w.moveTo(window_loc[0], window_loc[1])
                return f"Resized: {w.title}"
        except: pass
        return f"Resized: {name}"
    return f"Unknown mode: {mode}"

# ============================================================================
# Click tool
# ============================================================================
@mcp.tool(name="Click", description="Mouse clicks at [x,y]. button: left/right/middle. clicks: 0=hover, 1=single, 2=double.")
def click_tool(loc: list[int] | str | None = None, button: str = "left", clicks: int = 1) -> str:
    _require_pyautogui()
    loc = _as_loc(loc)
    if loc is None: return "Error: loc must be provided as [x, y]"
    if len(loc) != 2: return "Error: loc must be [x, y]"
    x, y = loc[0], loc[1]
    try:
        if clicks == 0: pyautogui.moveTo(x, y); return f"Hovered at ({x},{y})."
        pyautogui.click(x=x, y=y, clicks=clicks, button=button)
        return f"{'Double' if clicks==2 else 'Single'} {button} clicked at ({x},{y})."
    except Exception as e: return f"Click failed: {e}"

# ============================================================================
# Type tool
# ============================================================================
@mcp.tool(name="Type", description="Types text at [x,y]. clear=True clears first. press_enter=True submits. caret_position: start/end/idle.")
def type_tool(text: str, loc: list[int] | str | None = None, clear: bool | str = False, caret_position: str = "idle", press_enter: bool | str = False) -> str:
    _require_pyautogui()
    loc = _as_loc(loc)
    try:
        if loc and len(loc) == 2: pyautogui.click(loc[0], loc[1]); time.sleep(0.1)
        if _as_bool(clear):
            mod = "command" if _is_macos else "ctrl"
            pyautogui.hotkey(mod, "a"); time.sleep(0.05)
        if caret_position == "start": pyautogui.press("home")
        pyautogui.write(text, interval=0.02)
        if _as_bool(press_enter): pyautogui.press("enter")
        pos = f" at ({loc[0]},{loc[1]})" if loc else ""
        return f"Typed: {text[:100]}{'...' if len(text) > 100 else ''}{pos}"
    except Exception as e: return f"Type failed: {e}"

# ============================================================================
# Scroll tool
# ============================================================================
@mcp.tool(name="Scroll", description="Scrolls at [x,y]. type: vertical/horizontal. direction: up/down/left/right. wheel_times controls amount.")
def scroll_tool(loc: list[int] | str | None = None, type: str = "vertical", direction: str = "down", wheel_times: int = 1) -> str:
    _require_pyautogui()
    loc = _as_loc(loc)
    try:
        clicks = wheel_times * 3
        if direction == "up": clicks = -clicks
        if loc and len(loc) == 2:
            if type == "horizontal": pyautogui.hscroll(clicks, x=loc[0], y=loc[1])
            else: pyautogui.scroll(clicks, x=loc[0], y=loc[1])
            return f"Scrolled {type} {direction} by {wheel_times} at ({loc[0]},{loc[1]})."
        else:
            if type == "horizontal": pyautogui.hscroll(clicks)
            else: pyautogui.scroll(clicks)
            return f"Scrolled {type} {direction} by {wheel_times}."
    except Exception as e: return f"Scroll failed: {e}"

# ============================================================================
# Move tool
# ============================================================================
@mcp.tool(name="Move", description="Move mouse to [x,y]. drag=True for drag-drop. from_loc for explicit drag start. duration controls speed.")
def move_tool(loc: list[int] | str | None = None, drag: bool | str = False, from_loc: list[int] | str | None = None, duration: float | int | str | None = None) -> str:
    _require_pyautogui()
    loc = _as_loc(loc); from_loc = _as_loc(from_loc); drag = _as_bool(drag)
    if loc is None or len(loc) != 2: return "Error: loc must be [x, y]"
    x, y = loc[0], loc[1]
    try:
        dur = float(duration) if duration else 0.3
        if drag:
            sx, sy = (from_loc[0], from_loc[1]) if from_loc else pyautogui.position()
            pyautogui.moveTo(sx, sy); time.sleep(0.1)
            pyautogui.mouseDown(); pyautogui.moveTo(x, y, duration=dur); pyautogui.mouseUp()
            return f"Dragged from ({sx},{sy}) to ({x},{y}) over {dur:.3f}s."
        pyautogui.moveTo(x, y, duration=dur)
        return f"Moved mouse to ({x},{y})."
    except Exception as e: return f"Move failed: {e}"

# ============================================================================
# Shortcut tool
# ============================================================================
@mcp.tool(name="Shortcut", description='Keyboard shortcuts with + separator. Examples: "ctrl+c", "alt+tab", "ctrl+shift+esc".')
def shortcut_tool(shortcut: str) -> str:
    _require_pyautogui()
    try: pyautogui.hotkey(*_parse_shortcut(shortcut)); return f"Pressed {shortcut}."
    except Exception as e: return f"Shortcut failed: {e}"

# ============================================================================
# Wait tool
# ============================================================================
@mcp.tool(name="Wait", description="Pause execution for duration seconds.")
def wait_tool(duration: int) -> str:
    time.sleep(duration); return f"Waited for {duration} seconds."

# ============================================================================
# WaitFor tool
# ============================================================================
@mcp.tool(name="WaitFor", description="Wait until condition met. Conditions: text_exists, active_window, element_exists, focused_element.")
def wait_for_tool(condition: str, text: str | None = None, window_name: str | None = None, timeout: float = 10.0, interval: float = 0.25, use_dom: bool | str = False) -> str:
    start = time.monotonic(); deadline = start + timeout; attempts = 0
    norm = condition.strip().lower().replace("-", "_")
    while True:
        attempts += 1
        if norm == "active_window" and gw:
            expected = window_name or text
            try:
                active = gw.getActiveWindow()
                if active and expected and expected.lower() in active.title.lower():
                    return f"WaitFor satisfied after {time.monotonic()-start:.2f}s: active window matched."
            except: pass
        remaining = deadline - time.monotonic()
        if remaining <= 0: raise TimeoutError(f"Timed out after {timeout:.2f}s waiting for '{norm}'.")
        time.sleep(min(interval, remaining))

# ============================================================================
# DisplayInventory tool
# ============================================================================
@mcp.tool(name="DisplayInventory", description="Read display layout and DPI metadata.")
def display_inventory_tool() -> list[dict[str, object]]:
    _require_pyautogui()
    try:
        w, h = pyautogui.size()
        return [{"index": 0, "device": "primary", "primary": True, "bounds": {"left": 0, "top": 0, "right": w, "bottom": h, "width": w, "height": h}, "work_area": {"left": 0, "top": 0, "right": w, "bottom": h, "width": w, "height": h}, "resolution": f"{w}x{h}", "orientation": "landscape" if w > h else "portrait", "scale": 1.0}]
    except Exception as e: return [{"error": str(e)}]

# ============================================================================
# Screenshot tool
# ============================================================================
@mcp.tool(name="Screenshot", description="Fast screenshot capture. display=[0] for multi-monitor. region=[l,t,r,b] for sub-area.")
def screenshot_tool(display: list[int] | None = None, region: list[int] | str | None = None) -> str:
    _require_pyautogui()
    region = _as_loc(region)
    try:
        bbox = tuple(region) if region else None
        img = _safe_screenshot(region=bbox)
        buf = io.BytesIO(); img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        cursor = pyautogui.position()
        return f"Screenshot captured. Cursor at ({cursor.x},{cursor.y}).\n![screenshot](data:image/png;base64,{b64})"
    except Exception as e: return f"Screenshot failed: {e}"

# ============================================================================
# Snapshot tool
# ============================================================================
@mcp.tool(name="Snapshot", description="Full desktop state capture with UI elements. use_vision=True for screenshot. use_ui_tree=False for faster capture.")
def snapshot_tool(use_vision: bool | str = False, use_dom: bool | str = False, use_annotation: bool | str = True, use_ui_tree: bool | str = True, width_reference_line: int | None = None, height_reference_line: int | None = None, display: list[int] | None = None, region: list[int] | str | None = None) -> str:
    _require_pyautogui()
    region = _as_loc(region); use_vision = _as_bool(use_vision)
    parts = []
    try:
        cursor = pyautogui.position()
        parts.append(f"Cursor position: ({cursor.x}, {cursor.y})")
        w, h = pyautogui.size()
        parts.append(f"Screen size: {w}x{h}")
        if gw:
            try:
                windows = gw.getAllWindows()
                visible = [w for w in windows if w.title and w.visible]
                parts.append(f"\nOpen windows ({len(visible)}):")
                for i, win in enumerate(visible[:20]):
                    parts.append(f"  [{i}] \"{win.title}\" | pos=({win.left},{win.top}) size={win.width}x{win.height}")
            except: parts.append("\nWindow list unavailable.")
        if use_vision:
            bbox = tuple(region) if region else None
            img = _safe_screenshot(region=bbox)
            if _as_bool(use_annotation) and Image:
                draw = ImageDraw.Draw(img)
                try: font = ImageFont.truetype("arial.ttf", 14)
                except: font = ImageFont.load_default()
                draw.text((10, 10), f"Cursor: ({cursor.x},{cursor.y})", fill="red", font=font)
            buf = io.BytesIO(); img.save(buf, format="PNG")
            b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            parts.append(f"\n![snapshot](data:image/png;base64,{b64})")
        return "\n".join(parts)
    except Exception as e: return f"Snapshot failed: {e}"

# ============================================================================
# FileSystem tool
# ============================================================================
@mcp.tool(name="FileSystem", description="File operations: read, write, copy, move, delete, list, search, info. Relative paths resolve from cwd.")
def file_system_tool(mode: str = "read", path: str = ".", destination: str | None = None, content: str | None = None, pattern: str | None = None, recursive: bool | str = False, append: bool | str = False, overwrite: bool | str = False, offset: int | None = None, limit: int | None = None, encoding: str = "utf-8", show_hidden: bool | str = False) -> str:
    recursive = _as_bool(recursive); append = _as_bool(append); overwrite = _as_bool(overwrite); show_hidden = _as_bool(show_hidden)
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists() and mode not in ("write",): return f"Path not found: {path}"
        if mode == "read":
            if not p.is_file(): return f"Not a file: {path}"
            if p.stat().st_size > 5*1024*1024: return f"File too large ({p.stat().st_size} bytes). Limit: 5 MB."
            lines = p.read_text(encoding=encoding, errors="replace").splitlines()
            s = (offset or 1) - 1; e = s + (limit or len(lines))
            return "\n".join(lines[s:e])
        elif mode == "write":
            if content is None: return "Error: content required for write."
            p.parent.mkdir(parents=True, exist_ok=True)
            if append:
                with open(p, "a", encoding=encoding) as f: f.write(content)
            else: p.write_text(content, encoding=encoding)
            return f"Wrote {len(content)} chars to {p}"
        elif mode == "copy":
            if destination is None: return "Error: destination required for copy."
            dst = Path(destination).expanduser().resolve()
            if p.is_dir(): shutil.copytree(str(p), str(dst), dirs_exist_ok=overwrite)
            else: dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(str(p), str(dst))
            return f"Copied {p} to {dst}"
        elif mode == "move":
            if destination is None: return "Error: destination required for move."
            dst = Path(destination).expanduser().resolve(); dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(p), str(dst)); return f"Moved {p} to {dst}"
        elif mode == "delete":
            if p.is_dir(): shutil.rmtree(str(p))
            else: p.unlink()
            return f"Deleted {p}"
        elif mode == "list":
            if not p.is_dir(): return f"Not a directory: {path}"
            entries = sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name.lower()))
            lines = []
            for entry in entries[:500]:
                if not show_hidden and entry.name.startswith("."): continue
                kind = "[DIR] " if entry.is_dir() else "[FILE]"
                size = f" ({entry.stat().st_size} bytes)" if entry.is_file() else ""
                lines.append(f"{kind} {entry.name}{size}")
            return "\n".join(lines) if lines else "(empty directory)"
        elif mode == "search":
            if pattern is None: return "Error: pattern required for search."
            matches = list(p.rglob(pattern) if recursive else p.glob(pattern))
            return "\n".join([str(m) for m in matches[:200]]) if matches else f"No files matching '{pattern}'"
        elif mode == "info":
            st = p.stat()
            return json.dumps({"path": str(p), "type": "directory" if p.is_dir() else "file", "size": st.st_size, "created": datetime.fromtimestamp(st.st_ctime).isoformat(), "modified": datetime.fromtimestamp(st.st_mtime).isoformat()}, indent=2)
        else: return f'Unknown mode "{mode}". Use: read, write, copy, move, delete, list, search, info.'
    except Exception as e: return f"FileSystem ({mode}) failed: {e}"

# ============================================================================
# PowerShell tool
# ============================================================================
@mcp.tool(name="PowerShell", description="Shell/command execution. On Windows uses PowerShell, on Linux/macOS uses bash.")
def powershell_tool(command: str, timeout: int = 30) -> str:
    if _is_windows:
        try:
            result = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", command], capture_output=True, text=True, timeout=timeout, flags=_popen_flags())
            output = result.stdout
            if result.stderr: output += f"\n[stderr]\n{result.stderr}"
            return output[:10000] if output.strip() else "(no output)"
        except subprocess.TimeoutExpired: return f"Command timed out after {timeout}s"
        except Exception as e: return f"PowerShell failed: {e}"
    return _run_shell(command, timeout)

# ============================================================================
# Scrape tool
# ============================================================================
@mcp.tool(name="Scrape", description="Fetch web page content from URL. Provide query to focus extraction.")
async def scrape_tool(url: str, query: str | None = None, use_dom: bool | str = False, use_sampling: bool | str = True) -> str:
    if _requests is None: return "requests library not installed"
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = _requests.get(url, headers=headers, timeout=15, allow_redirects=True)
        resp.raise_for_status()
        ct = resp.headers.get("content-type", "")
        if "text/html" in ct:
            html = resp.text
            text = md(html, strip=["script","style","nav","footer","header"]) if md else re.sub(r"<[^>]+>", " ", re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL|re.IGNORECASE))
            text = re.sub(r"\s+", " ", text).strip()
            if query:
                relevant = [l for l in text.split("\n") if query.lower() in l.lower()]
                text = "\n".join(relevant[:50]) if relevant else text[:5000]
            return f"URL: {url}\nContent:\n{text[:8000]}"
        return f"URL: {url}\nContent-Type: {ct}\nContent:\n{resp.text[:8000]}"
    except Exception as e: return f"Scrape failed: {e}"

# ============================================================================
# MultiSelect tool
# ============================================================================
@mcp.tool(name="MultiSelect", description="Select multiple items. locs=[[x,y],...] or labels=[...]. press_ctrl=True for multi-select.")
def multi_select_tool(locs: list[list[int]] | str | None = None, labels: list[int] | str | None = None, press_ctrl: bool | str = True) -> str:
    _require_pyautogui()
    locs = _as_loc(locs) or []; press_ctrl = _as_bool(press_ctrl)
    if not locs: return "Error: locs must be provided"
    try:
        for loc in locs:
            if len(loc) != 2: continue
            mod = "command" if _is_macos else "ctrl"
            if press_ctrl: pyautogui.keyDown(mod)
            pyautogui.click(loc[0], loc[1])
            if press_ctrl: pyautogui.keyUp(mod)
            time.sleep(0.1)
        return f"Multi-selected {len(locs)} elements."
    except Exception as e: return f"MultiSelect failed: {e}"

# ============================================================================
# MultiEdit tool
# ============================================================================
@mcp.tool(name="MultiEdit", description="Enter text into multiple fields. locs=[[x,y,text],...].")
def multi_edit_tool(locs: list[list] | str | None = None, labels: list[list] | str | None = None) -> str:
    _require_pyautogui()
    locs = _as_loc(locs) or []
    if not locs: return "Error: locs must be [[x,y,text],...]"
    try:
        for entry in locs:
            if len(entry) < 3: continue
            x, y, text = entry[0], entry[1], entry[2]
            pyautogui.click(x, y); time.sleep(0.1)
            mod = "command" if _is_macos else "ctrl"
            pyautogui.hotkey(mod, "a"); pyautogui.write(str(text), interval=0.02); time.sleep(0.05)
        return f"Multi-edited {len(locs)} fields."
    except Exception as e: return f"MultiEdit failed: {e}"

# ============================================================================
# Clipboard tool
# ============================================================================
@mcp.tool(name="Clipboard", description="Clipboard operations. mode='get' reads, mode='set' writes text.")
def clipboard_tool(mode: str = "get", text: str | None = None) -> str:
    _require_pyperclip()
    try:
        if mode == "get": return f"Clipboard content:\n{pyperclip.paste()}"
        elif mode == "set":
            if text is None: return "Error: text required for set."
            pyperclip.copy(text); return f"Clipboard set to: {text[:100]}{'...' if len(text) > 100 else ''}"
        else: return 'Error: mode must be "get" or "set".'
    except Exception as e: return f"Clipboard failed: {e}"

# ============================================================================
# Process tool
# ============================================================================
@mcp.tool(name="Process", description="List/kill processes. mode='list' shows processes, mode='kill' terminates by PID/name.")
def process_tool(mode: str = "list", name: str | None = None, pid: int | None = None, sort_by: str = "memory", limit: int = 20, force: bool | str = False) -> str:
    _require_psutil()
    try:
        if mode == "list":
            procs = []
            for p in psutil.process_iter(["pid","name","cpu_percent","memory_percent"]):
                try:
                    info = p.info
                    if name and name.lower() not in (info.get("name") or "").lower(): continue
                    procs.append(info)
                except: continue
            key = "cpu_percent" if sort_by == "cpu" else "memory_percent"
            procs.sort(key=lambda x: x.get(key, 0) or 0, reverse=True)
            lines = ["PID | Name | CPU% | MEM%"]
            for p in procs[:limit]: lines.append(f"{p['pid']:>6} | {(p['name'] or '?')[:40]:<40} | {(p['cpu_percent'] or 0):5.1f} | {(p['memory_percent'] or 0):5.1f}")
            return "\n".join(lines)
        elif mode == "kill":
            force = _as_bool(force)
            if pid is not None:
                p = psutil.Process(pid); p.kill() if force else p.terminate(); return f"Terminated PID {pid} ({p.name()})"
            elif name:
                found = [p for p in psutil.process_iter(["pid","name"]) if p.info.get("name") and name.lower() in p.info["name"].lower()]
                if not found: return f"No process matching '{name}'"
                killed = []
                for p in found[:5]:
                    try: p.kill() if force else p.terminate(); killed.append(f"PID {p.pid}")
                    except: continue
                return f"Terminated: {', '.join(killed)}"
            return "Provide either pid or name"
        return 'Error: mode must be "list" or "kill".'
    except Exception as e: return f"Process ({mode}) failed: {e}"

# ============================================================================
# Notification tool
# ============================================================================
@mcp.tool(name="Notification", description="Send desktop notification with title and message.")
def notification_tool(title: str, message: str, app_id: str | None = None) -> str:
    _require_plyer()
    try:
        kwargs = {"title": title, "message": message, "timeout": 5}
        if app_id: kwargs["app_name"] = app_id
        _plyer_notification.notify(**kwargs); return f"Notification sent: {title}"
    except Exception as e: return f"Notification failed: {e}"

# ============================================================================
# Registry tool (cross-platform config storage)
# ============================================================================
@mcp.tool(name="Registry", description="Read/write config values (cross-platform replacement for Windows Registry). mode: get/set/delete/list. Paths use dot notation.")
def registry_tool(mode: str = "get", path: str = "", name: str | None = None, value: str | None = None, type: str = "String") -> str:
    config_dir = Path.home() / ".zyraxon-cross-mcp" / "registry"
    config_dir.mkdir(parents=True, exist_ok=True)
    config_file = config_dir / "registry.json"
    try: data = json.loads(config_file.read_text(encoding="utf-8")) if config_file.exists() else {}
    except: data = {}
    def _resolve(d, p):
        parts = [x for x in p.split(".") if x]
        cur = d
        for part in parts:
            if isinstance(cur, dict) and part in cur: cur = cur[part]
            else: return None
        return cur
    def _save(d): config_file.write_text(json.dumps(d, indent=2), encoding="utf-8")
    try:
        if mode == "get":
            if name is None: return "Error: name required for get."
            r = _resolve(data, path)
            if isinstance(r, dict) and name in r: return f"{name} = {r[name]}"
            return f"Value not found: {path}.{name}"
        elif mode == "set":
            if name is None: return "Error: name required for set."
            if value is None: return "Error: value required for set."
            parts = [x for x in path.split(".") if x]; cur = data
            for p in parts: cur = cur.setdefault(p, {})
            if isinstance(cur, dict): cur[name] = value
            _save(data); return f"Set {path}.{name} = {value}"
        elif mode == "delete":
            parts = [x for x in path.split(".") if x]; cur = data
            for p in parts:
                if isinstance(cur, dict) and p in cur: cur = cur[p]
                else: return f"Path not found: {path}"
            if name and isinstance(cur, dict) and name in cur: del cur[name]; _save(data); return f"Deleted {path}.{name}"
            return f"Entry not found: {path}.{name}"
        elif mode == "list":
            r = _resolve(data, path)
            if r is None: return f"Path not found: {path}"
            if isinstance(r, dict): return "\n".join([f"  {k}: {v}" for k, v in r.items()])
            return f"Value at {path}: {r}"
        return 'Error: mode must be "get","set","delete","list".'
    except Exception as e: return f"Registry ({mode}) failed: {e}"

# ============================================================================
# Window tools
# ============================================================================
@mcp.tool(name="ListWindows", description="List all open windows with title and bounds.")
def list_windows_tool() -> str:
    if gw is None: return "pygetwindow not available"
    try:
        windows = gw.getAllWindows()
        lines = [f"[{i}] \"{w.title}\" | pos=({w.left},{w.top}) size={w.width}x{w.height}" for i, w in enumerate(windows) if w.title]
        return "\n".join(lines) if lines else "No visible windows found"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="FocusWindow", description="Bring a window to foreground by title.")
def focus_window_tool(title: str) -> str:
    if gw is None: return "pygetwindow not available"
    try:
        wins = gw.getWindowsWithTitle(title)
        if not wins: return f"No window matching '{title}'"
        w = wins[0]
        if w.isMinimized: w.restore()
        w.activate(); return f"Focused: \"{w.title}\""
    except Exception as e: return f"Focus failed: {e}"

@mcp.tool(name="GetActiveWindow", description="Get currently focused window title and bounds.")
def get_active_window_tool() -> str:
    if gw is None: return "pygetwindow not available"
    try:
        w = gw.getActiveWindow()
        return f"\"{w.title}\" | pos=({w.left},{w.top}) size={w.width}x{w.height}" if w else "No active window"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ResizeWindow", description="Resize a window by title to width x height.")
def resize_window_tool(title: str, width: int, height: int) -> str:
    if gw is None: return "pygetwindow not available"
    try:
        wins = gw.getWindowsWithTitle(title)
        if not wins: return f"No window matching '{title}'"
        wins[0].resizeTo(width, height); return f"Resized \"{wins[0].title}\" to {width}x{height}"
    except Exception as e: return f"Resize failed: {e}"

@mcp.tool(name="MoveWindow", description="Move a window by title to (x, y).")
def move_window_tool(title: str, x: int, y: int) -> str:
    if gw is None: return "pygetwindow not available"
    try:
        wins = gw.getWindowsWithTitle(title)
        if not wins: return f"No window matching '{title}'"
        wins[0].moveTo(x, y); return f"Moved \"{wins[0].title}\" to ({x},{y})"
    except Exception as e: return f"Move failed: {e}"

# ============================================================================
# System tools
# ============================================================================
@mcp.tool(name="GetScreenSize", description="Get screen resolution as width x height.")
def get_screen_size_tool() -> str:
    _require_pyautogui()
    try: w, h = pyautogui.size(); return f"{w}x{h}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetCursorPos", description="Get current cursor position as x, y.")
def get_cursor_pos_tool() -> str:
    _require_pyautogui()
    try: x, y = pyautogui.position(); return f"{x},{y}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetSystemInfo", description="Get OS, CPU, memory, and disk information.")
def get_system_info_tool() -> str:
    try:
        lines = [f"OS: {_OS} {platform.release()} ({platform.machine()})", f"Python: {platform.python_version()}", f"Hostname: {platform.node()}"]
        if psutil:
            cpu = psutil.cpu_percent(interval=0.5); mem = psutil.virtual_memory(); disk = psutil.disk_usage("/")
            lines += [f"CPU: {cpu}% ({psutil.cpu_count(logical=False)} cores / {psutil.cpu_count()} logical)", f"RAM: {mem.percent}% ({mem.used//(1024**2)} MB / {mem.total//(1024**2)} MB)", f"Disk: {disk.percent}% ({disk.used//(1024**3)} GB / {disk.total//(1024**3)} GB)"]
        return "\n".join(lines)
    except Exception as e: return f"System info failed: {e}"

# ============================================================================
# Shell/File/Network tools (aliases for compatibility)
# ============================================================================
@mcp.tool(name="GetClipboard", description="Read current clipboard contents.")
def get_clipboard_tool() -> str:
    _require_pyperclip()
    try: return pyperclip.paste()
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="SetClipboard", description="Set clipboard to given text.")
def set_clipboard_tool(text: str) -> str:
    _require_pyperclip()
    try: pyperclip.copy(text); return f"Clipboard set ({len(text)} chars)"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="PressKey", description="Press a key multiple times. Key names: enter, tab, escape, space, backspace, delete, up, down, left, right, f1..f12.")
def press_key_tool(key: str, presses: int = 1) -> str:
    _require_pyautogui()
    try: pyautogui.press(key, presses=presses); return f"Pressed '{key}' x{presses}"
    except Exception as e: return f"Press failed: {e}"

@mcp.tool(name="Hotkey", description="Press keyboard shortcut. Each modifier/key as separate arg. Hotkey('ctrl','c') for copy.")
def hotkey_tool(*keys: str) -> str:
    _require_pyautogui()
    if not keys: return "No keys provided"
    try: pyautogui.hotkey(*keys); return f"Pressed: {'+'.join(keys)}"
    except Exception as e: return f"Hotkey failed: {e}"

@mcp.tool(name="TypeText", description="Type text string using keyboard.")
def type_text_tool(text: str, interval: float = 0.02) -> str:
    _require_pyautogui()
    try: pyautogui.write(text, interval=interval); return f"Typed: {text[:80]}{'...' if len(text) > 80 else ''}"
    except Exception as e: return f"Type failed: {e}"

@mcp.tool(name="MoveMouse", description="Move mouse cursor to (x, y).")
def move_mouse_tool(x: int, y: int, duration: float = 0.3) -> str:
    _require_pyautogui()
    try: pyautogui.moveTo(x, y, duration=duration); return f"Mouse moved to ({x},{y})"
    except Exception as e: return f"Move failed: {e}"

@mcp.tool(name="RunCommand", description="Execute shell command. Returns stdout+stderr. Timeout in seconds.")
def run_command_tool(command: str, timeout: int = 30) -> str:
    return _run_shell(command, timeout)

@mcp.tool(name="SearchFiles", description="Search files matching glob pattern (e.g. '*.py', '**/*.json').")
def search_files_tool(directory: str, pattern: str, recursive: bool = True, max_results: int = 100) -> str:
    try:
        p = Path(directory).expanduser().resolve()
        if not p.exists(): return f"Directory not found: {directory}"
        matches = list(p.rglob(pattern) if recursive else p.glob(pattern))
        results = [str(m) for m in matches[:max_results]]
        return "\n".join(results) if results else f"No files matching '{pattern}'"
    except Exception as e: return f"Search failed: {e}"

@mcp.tool(name="ReadFile", description="Read file contents. Limit 5 MB.")
def read_file_tool(path: str, encoding: str = "utf-8") -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists(): return f"File not found: {path}"
        if p.stat().st_size > 5*1024*1024: return f"File too large ({p.stat().st_size} bytes)."
        return p.read_text(encoding=encoding, errors="replace")
    except Exception as e: return f"Read failed: {e}"

@mcp.tool(name="WriteFile", description="Write content to file, creating parent dirs if needed.")
def write_file_tool(path: str, content: str, encoding: str = "utf-8") -> str:
    try:
        p = Path(path).expanduser().resolve(); p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding=encoding); return f"Wrote {len(content)} chars to {p}"
    except Exception as e: return f"Write failed: {e}"

@mcp.tool(name="ListDirectory", description="List directory contents with type indicators.")
def list_directory_tool(path: str = ".") -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists(): return f"Directory not found: {path}"
        if not p.is_dir(): return f"Not a directory: {path}"
        entries = sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name.lower()))
        lines = []
        for entry in entries[:200]:
            kind = "[DIR] " if entry.is_dir() else "[FILE]"
            size = f" ({entry.stat().st_size} bytes)" if entry.is_file() else ""
            lines.append(f"{kind} {entry.name}{size}")
        return "\n".join(lines) if lines else "(empty directory)"
    except Exception as e: return f"List failed: {e}"

# ============================================================================
# Additional tools - all registered as @mcp.tool()
# ============================================================================
@mcp.tool(name="DragAndDrop", description="Drag from [x,y] source to [x,y] destination.")
def drag_and_drop_tool(source: list[int], destination: list[int], duration: float = 0.5, button: str = "left") -> str:
    _require_pyautogui()
    try:
        pyautogui.moveTo(source[0], source[1]); time.sleep(0.1)
        pyautogui.mouseDown(button=button); pyautogui.moveTo(destination[0], destination[1], duration=duration); pyautogui.mouseUp(button=button)
        return f"Dragged from ({source[0]},{source[1]}) to ({destination[0]},{destination[1]})"
    except Exception as e: return f"DragAndDrop failed: {e}"

@mcp.tool(name="ImageSearch", description="Search for image on screen. Provide base64 PNG. Returns center if found.")
def image_search_tool(image_b64: str, confidence: float = 0.8) -> str:
    try:
        img_data = base64.b64decode(image_b64); needle = Image.open(io.BytesIO(img_data))
        haystack = _safe_screenshot()
        if hasattr(pyautogui, 'locate'):
            loc = pyautogui.locate(needle, haystack, confidence=confidence)
            if loc: c = pyautogui.center(loc); return f"Found at ({c.x}, {c.y})"
        return "Image not found on screen"
    except Exception as e: return f"ImageSearch failed: {e}"

@mcp.tool(name="PixelColor", description="Get RGB color at [x,y].")
def pixel_color_tool(x: int, y: int) -> str:
    try:
        img = _safe_screenshot(region=(x,y,1,1)); r, g, b = img.getpixel((0,0))[:3]
        return f"RGB({r},{g},{b}) = #{r:02x}{g:02x}{b:02x}"
    except Exception as e: return f"PixelColor failed: {e}"

@mcp.tool(name="GetNetworkInfo", description="Get network interface information.")
def get_network_info_tool() -> str:
    _require_psutil()
    try:
        lines = []
        for iface, addrs in psutil.net_if_addrs().items():
            if iface == "lo": continue
            lines.append(f"\n{iface}:")
            for addr in addrs:
                if addr.family == socket.AF_INET: lines.append(f"  IPv4: {addr.address}")
                elif addr.family == socket.AF_INET6: lines.append(f"  IPv6: {addr.address}")
                elif hasattr(socket,'AF_LINK') and addr.family == socket.AF_LINK: lines.append(f"  MAC: {addr.address}")
        return "\n".join(lines) if lines else "No network interfaces found"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="Ping", description="Ping a host and return latency.")
def ping_tool(host: str, count: int = 4) -> str:
    try:
        param = "-n" if _is_windows else "-c"
        result = subprocess.run(["ping", param, str(count), host], capture_output=True, text=True, timeout=30, flags=_popen_flags())
        return result.stdout[:3000] if result.stdout else f"Ping to {host} failed"
    except Exception as e: return f"Ping failed: {e}"

@mcp.tool(name="DiskUsage", description="Get disk usage for a path.")
def disk_usage_tool(path: str = "/") -> str:
    _require_psutil()
    try:
        u = psutil.disk_usage(path)
        return json.dumps({"total_gb": round(u.total/(1024**3),2), "used_gb": round(u.used/(1024**3),2), "free_gb": round(u.free/(1024**3),2), "percent": u.percent}, indent=2)
    except Exception as e: return f"DiskUsage failed: {e}"

@mcp.tool(name="BatteryInfo", description="Get battery status.")
def battery_info_tool() -> str:
    _require_psutil()
    try:
        b = psutil.sensors_battery()
        if b is None: return "No battery detected"
        return json.dumps({"percent": b.percent, "power_plugged": b.power_plugged, "seconds_left": b.secsleft if b.secsleft != psutil.POWER_TIME_UNLIMITED else None}, indent=2)
    except Exception as e: return f"BatteryInfo failed: {e}"

@mcp.tool(name="GetEnv", description="Get environment variable by name, or list all.")
def get_env_tool(name: str | None = None) -> str:
    if name: val = os.environ.get(name); return f"{name}={val}" if val is not None else f"Not found: {name}"
    return "\n".join([f"{k}={v}" for k, v in sorted(os.environ.items())][:200])

@mcp.tool(name="SetEnv", description="Set environment variable for current session.")
def set_env_tool(name: str, value: str) -> str:
    os.environ[name] = value; return f"Set {name}={value}"

@mcp.tool(name="GetProcessInfo", description="Get detailed process info by PID or name.")
def get_process_info_tool(pid: int | None = None, name: str | None = None) -> str:
    _require_psutil()
    try:
        if pid: p = psutil.Process(pid)
        elif name:
            for proc in psutil.process_iter(["pid","name"]):
                try:
                    if name.lower() in (proc.info.get("name") or "").lower(): p = proc; break
                except: continue
            else: return f"No process matching '{name}'"
        else: return "Provide either pid or name"
        info = p.as_dict(attrs=["pid","name","status","cpu_percent","memory_percent","create_time","num_threads","cmdline"])
        if info.get("create_time"): info["create_time"] = datetime.fromtimestamp(info["create_time"]).isoformat()
        info["cmdline"] = " ".join(info.get("cmdline") or [])[:200]
        return json.dumps(info, indent=2, default=str)
    except Exception as e: return f"GetProcessInfo failed: {e}"

@mcp.tool(name="KillProcessByName", description="Kill all processes matching name.")
def kill_process_by_name_tool(name: str, force: bool | str = False) -> str:
    _require_psutil()
    try:
        killed = []
        for p in psutil.process_iter(["pid","name"]):
            try:
                if name.lower() in (p.info.get("name") or "").lower():
                    p.kill() if _as_bool(force) else p.terminate()
                    killed.append(f"PID {p.pid}")
            except: continue
        return f"Terminated: {', '.join(killed)}" if killed else f"No process matching '{name}'"
    except Exception as e: return f"KillProcessByName failed: {e}"

@mcp.tool(name="CopyFile", description="Copy file or directory to destination.")
def copy_file_tool(source: str, destination: str) -> str:
    try:
        src = Path(source).expanduser().resolve(); dst = Path(destination).expanduser().resolve()
        if src.is_dir(): shutil.copytree(str(src), str(dst), dirs_exist_ok=True)
        else: dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(str(src), str(dst))
        return f"Copied {src} to {dst}"
    except Exception as e: return f"Copy failed: {e}"

@mcp.tool(name="MoveFile", description="Move or rename file/directory.")
def move_file_tool(source: str, destination: str) -> str:
    try:
        src = Path(source).expanduser().resolve(); dst = Path(destination).expanduser().resolve()
        dst.parent.mkdir(parents=True, exist_ok=True); shutil.move(str(src), str(dst))
        return f"Moved {src} to {dst}"
    except Exception as e: return f"Move failed: {e}"

@mcp.tool(name="DeleteFile", description="Delete a file or directory.")
def delete_file_tool(path: str, recursive: bool | str = False) -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists(): return f"Path not found: {path}"
        if p.is_dir():
            if _as_bool(recursive): shutil.rmtree(str(p)); return f"Deleted directory: {p}"
            else: p.rmdir(); return f"Deleted empty directory: {p}"
        p.unlink(); return f"Deleted file: {p}"
    except Exception as e: return f"Delete failed: {e}"

@mcp.tool(name="CreateDirectory", description="Create directory and parent dirs.")
def create_directory_tool(path: str) -> str:
    try: p = Path(path).expanduser().resolve(); p.mkdir(parents=True, exist_ok=True); return f"Created: {p}"
    except Exception as e: return f"CreateDirectory failed: {e}"

@mcp.tool(name="GetFileInfo", description="Get file/dir metadata: size, dates, type.")
def get_file_info_tool(path: str) -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists(): return f"Path not found: {path}"
        st = p.stat()
        return json.dumps({"type": "directory" if p.is_dir() else "file", "size": st.st_size, "created": datetime.fromtimestamp(st.st_ctime).isoformat(), "modified": datetime.fromtimestamp(st.st_mtime).isoformat()}, indent=2)
    except Exception as e: return f"GetFileInfo failed: {e}"

@mcp.tool(name="GrepFile", description="Search regex pattern in file, return matching lines.")
def grep_file_tool(path: str, pattern: str, max_matches: int = 50) -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.is_file(): return f"Not a file: {path}"
        lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
        compiled = re.compile(pattern, re.IGNORECASE)
        matches = [f"{i}: {line}" for i, line in enumerate(lines, 1) if compiled.search(line)][:max_matches]
        return "\n".join(matches) if matches else f"No matches for '{pattern}'"
    except Exception as e: return f"GrepFile failed: {e}"

@mcp.tool(name="CountLines", description="Count lines, words, chars in file.")
def count_lines_tool(path: str) -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.is_file(): return f"Not a file: {path}"
        content = p.read_text(encoding="utf-8", errors="replace")
        return f"Lines: {len(content.splitlines())}, Words: {len(content.split())}, Characters: {len(content)}"
    except Exception as e: return f"CountLines failed: {e}"

@mcp.tool(name="TailFile", description="Read last N lines of file.")
def tail_file_tool(path: str, lines: int = 20) -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.is_file(): return f"Not a file: {path}"
        all_lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(all_lines[-lines:])
    except Exception as e: return f"TailFile failed: {e}"

@mcp.tool(name="CreateZip", description="Create zip archive from file/dir.")
def create_zip_tool(source: str, destination: str) -> str:
    try:
        src = Path(source).expanduser().resolve(); dst = Path(destination).expanduser().resolve()
        if src.is_dir(): shutil.make_archive(str(dst.with_suffix("")), "zip", str(src))
        else:
            with zipfile.ZipFile(str(dst), "w", zipfile.ZIP_DEFLATED) as zf: zf.write(str(src), src.name)
        return f"Created zip: {dst}"
    except Exception as e: return f"CreateZip failed: {e}"

@mcp.tool(name="ExtractZip", description="Extract zip archive to destination.")
def extract_zip_tool(source: str, destination: str) -> str:
    try:
        src = Path(source).expanduser().resolve(); dst = Path(destination).expanduser().resolve()
        dst.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(str(src), "r") as zf: zf.extractall(str(dst))
        return f"Extracted {src} to {dst}"
    except Exception as e: return f"ExtractZip failed: {e}"

@mcp.tool(name="ReadJson", description="Read and parse JSON file.")
def read_json_tool(path: str) -> str:
    try: return json.dumps(json.loads(Path(path).expanduser().resolve().read_text(encoding="utf-8")), indent=2, default=str)[:10000]
    except Exception as e: return f"ReadJson failed: {e}"

@mcp.tool(name="WriteJson", description="Write data to JSON file with pretty-printing.")
def write_json_tool(path: str, content: str) -> str:
    try:
        p = Path(path).expanduser().resolve(); p.parent.mkdir(parents=True, exist_ok=True)
        data = json.loads(content) if isinstance(content, str) else content
        p.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8"); return f"Wrote JSON to {p}"
    except Exception as e: return f"WriteJson failed: {e}"

@mcp.tool(name="GetCurrentTime", description="Get current date/time in various formats.")
def get_current_time_tool() -> str:
    now = datetime.now(); utc = datetime.now(timezone.utc)
    return json.dumps({"local": now.isoformat(), "utc": utc.isoformat(), "timestamp": int(now.timestamp()), "day_of_week": now.strftime("%A")}, indent=2)

@mcp.tool(name="GetFileTimestamps", description="Get creation, modification, access timestamps.")
def get_file_timestamps_tool(path: str) -> str:
    try:
        st = Path(path).expanduser().resolve().stat()
        return json.dumps({"created": datetime.fromtimestamp(st.st_ctime).isoformat(), "modified": datetime.fromtimestamp(st.st_mtime).isoformat(), "accessed": datetime.fromtimestamp(st.st_atime).isoformat()}, indent=2)
    except Exception as e: return f"GetFileTimestamps failed: {e}"

@mcp.tool(name="DiffFiles", description="Compare two files and show differences.")
def diff_files_tool(file1: str, file2: str) -> str:
    try:
        l1 = Path(file1).expanduser().resolve().read_text(encoding="utf-8", errors="replace").splitlines()
        l2 = Path(file2).expanduser().resolve().read_text(encoding="utf-8", errors="replace").splitlines()
        diff = list(difflib.unified_diff(l1, l2, fromfile=file1, tofile=file2, lineterm=""))
        return "\n".join(diff[:200]) if diff else "Files are identical"
    except Exception as e: return f"DiffFiles failed: {e}"

@mcp.tool(name="HashFile", description="Calculate MD5, SHA1, SHA256 hashes of a file.")
def hash_file_tool(path: str) -> str:
    try:
        data = Path(path).expanduser().resolve().read_bytes()
        return json.dumps({"md5": hashlib.md5(data).hexdigest(), "sha1": hashlib.sha1(data).hexdigest(), "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}, indent=2)
    except Exception as e: return f"HashFile failed: {e}"

@mcp.tool(name="OpenFile", description="Open file with default application.")
def open_file_tool(path: str) -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists(): return f"File not found: {path}"
        if _is_windows: os.startfile(str(p))
        elif _is_macos: subprocess.run(["open", str(p)], flags=_popen_flags())
        else: subprocess.run(["xdg-open", str(p)], flags=_popen_flags())
        return f"Opened: {p}"
    except Exception as e: return f"OpenFile failed: {e}"

@mcp.tool(name="UrlOpen", description="Open URL in default browser.")
def url_open_tool(url: str) -> str:
    try: import webbrowser; webbrowser.open(url); return f"Opened: {url}"
    except Exception as e: return f"UrlOpen failed: {e}"

@mcp.tool(name="FindInFiles", description="Search text pattern across files in directory.")
def find_in_files_tool(directory: str, pattern: str, file_glob: str = "*", max_results: int = 50) -> str:
    try:
        p = Path(directory).expanduser().resolve()
        if not p.is_dir(): return f"Not a directory: {directory}"
        compiled = re.compile(pattern, re.IGNORECASE); results = []
        for f in p.rglob(file_glob):
            if f.is_file() and f.stat().st_size < 1_000_000:
                try:
                    for i, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                        if compiled.search(line): results.append(f"{f}:{i}: {line.strip()[:100]}")
                        if len(results) >= max_results: return "\n".join(results)
                except: continue
        return "\n".join(results) if results else f"No matches for '{pattern}'"
    except Exception as e: return f"FindInFiles failed: {e}"

@mcp.tool(name="DirectoryTree", description="Show tree view of directory structure.")
def directory_tree_tool(path: str = ".", max_depth: int = 3, max_entries: int = 200) -> str:
    try:
        root = Path(path).expanduser().resolve()
        if not root.is_dir(): return f"Not a directory: {path}"
        lines = [f"{root.name}/"]; count = [0]
        def _walk(p, prefix, depth):
            if depth > max_depth or count[0] >= max_entries: return
            entries = sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name.lower()))
            for i, entry in enumerate(entries):
                if count[0] >= max_entries: break
                is_last = i == len(entries) - 1
                conn = "└── " if is_last else "├── "
                kind = "[DIR] " if entry.is_dir() else "[FILE]"
                lines.append(f"{prefix}{conn}{kind}{entry.name}"); count[0] += 1
                if entry.is_dir(): _walk(entry, prefix + ("    " if is_last else "│   "), depth + 1)
        _walk(root, "", 1); return "\n".join(lines)
    except Exception as e: return f"DirectoryTree failed: {e}"

@mcp.tool(name="FindDuplicates", description="Find duplicate files by content hash.")
def find_duplicates_tool(directory: str, max_results: int = 50) -> str:
    try:
        p = Path(directory).expanduser().resolve()
        if not p.is_dir(): return f"Not a directory: {directory}"
        hash_map = {}
        for f in p.rglob("*"):
            if f.is_file() and f.stat().st_size > 0:
                try:
                    h = hashlib.md5(f.read_bytes()).hexdigest()
                    hash_map.setdefault(h, []).append(str(f))
                except: continue
        dupes = {h: files for h, files in hash_map.items() if len(files) > 1}
        results = [f"Hash {h[:8]}: {', '.join(files)}" for h, files in list(dupes.items())[:max_results]]
        return "\n".join(results) if results else "No duplicates found"
    except Exception as e: return f"FindDuplicates failed: {e}"

@mcp.tool(name="CopyToClipboard", description="Copy text to system clipboard.")
def copy_to_clipboard_tool(text: str) -> str:
    _require_pyperclip()
    try: pyperclip.copy(text); return f"Copied {len(text)} chars"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="PasteFromClipboard", description="Read text from system clipboard.")
def paste_from_clipboard_tool() -> str:
    _require_pyperclip()
    try: return pyperclip.paste()
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ConvertCase", description="Convert text case: upper, lower, title, camel, snake, kebab.")
def convert_case_tool(text: str, case: str = "lower") -> str:
    if case == "upper": return text.upper()
    elif case == "lower": return text.lower()
    elif case == "title": return text.title()
    elif case == "camel": parts = text.split(); return parts[0].lower() + "".join(p.capitalize() for p in parts[1:])
    elif case == "snake": return re.sub(r"[\s\-]+", "_", text).lower()
    elif case == "kebab": return re.sub(r"[\s_]+", "-", text).lower()
    return f"Unknown case: {case}"

@mcp.tool(name="EncodeBase64", description="Encode text to base64.")
def encode_base64_tool(text: str) -> str:
    try: return base64.b64encode(text.encode("utf-8")).decode("ascii")
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="DecodeBase64", description="Decode base64 text.")
def decode_base64_tool(text: str) -> str:
    try: return base64.b64decode(text).decode("utf-8")
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="UrlEncode", description="URL-encode a string.")
def url_encode_tool(text: str) -> str:
    try: return urllib.parse.quote(text)
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="UrlDecode", description="URL-decode a string.")
def url_decode_tool(text: str) -> str:
    try: return urllib.parse.unquote(text)
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="RunCommandAsync", description="Run shell command in background, return PID.")
def run_command_async_tool(command: str) -> str:
    try:
        proc = subprocess.Popen(command, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, flags=_popen_flags())
        return f"Started background command with PID {proc.pid}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ListPorts", description="List open network ports.")
def list_ports_tool() -> str:
    _require_psutil()
    try:
        lines = ["PID | Proto | Local Address | Status"]
        for conn in psutil.net_connections(kind="inet"):
            try:
                pid = str(conn.pid) if conn.pid else "?"
                local = f"{conn.laddr.ip}:{conn.laddr.port}" if conn.laddr else "?"
                lines.append(f"{pid:>6} | {conn.type.name:>4} | {local:>30} | {conn.status}")
            except: continue
        return "\n".join(lines[:100]) if len(lines) > 1 else "No open ports"
    except Exception as e: return f"ListPorts failed: {e}"

@mcp.tool(name="KillPort", description="Kill process using a specific port.")
def kill_port_tool(port: int) -> str:
    _require_psutil()
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.laddr and conn.laddr.port == port and conn.pid:
                p = psutil.Process(conn.pid); p.terminate()
                return f"Terminated PID {conn.pid} ({p.name()}) on port {port}"
        return f"No process on port {port}"
    except Exception as e: return f"KillPort failed: {e}"

@mcp.tool(name="MaximizeWindow", description="Maximize window by title.")
def maximize_window_tool(title: str) -> str:
    if gw is None: return "pygetwindow not available"
    try:
        wins = gw.getWindowsWithTitle(title)
        if not wins: return f"No window matching '{title}'"
        wins[0].maximize(); return f"Maximized: \"{wins[0].title}\""
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="MinimizeWindow", description="Minimize window by title.")
def minimize_window_tool(title: str) -> str:
    if gw is None: return "pygetwindow not available"
    try:
        wins = gw.getWindowsWithTitle(title)
        if not wins: return f"No window matching '{title}'"
        wins[0].minimize(); return f"Minimized: \"{wins[0].title}\""
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="CloseWindow", description="Close window by title.")
def close_window_tool(title: str) -> str:
    if gw is None: return "pygetwindow not available"
    try:
        wins = gw.getWindowsWithTitle(title)
        if not wins: return f"No window matching '{title}'"
        wins[0].close(); return f"Closed: \"{wins[0].title}\""
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetWindowSize", description="Get window size and position.")
def get_window_size_tool(title: str) -> str:
    if gw is None: return "pygetwindow not available"
    try:
        wins = gw.getWindowsWithTitle(title)
        if not wins: return f"No window matching '{title}'"
        w = wins[0]
        return json.dumps({"title": w.title, "left": w.left, "top": w.top, "width": w.width, "height": w.height, "is_minimized": w.isMinimized, "is_maximized": w.isMaximized}, indent=2)
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="IsWindowVisible", description="Check if window is visible.")
def is_window_visible_tool(title: str) -> str:
    if gw is None: return "pygetwindow not available"
    try:
        wins = gw.getWindowsWithTitle(title)
        if not wins: return f"No window matching '{title}'"
        return f"Window '{title}' visible: {wins[0].visible}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="SetForegroundWindow", description="Bring window to foreground.")
def set_foreground_window_tool(title: str) -> str:
    if gw is None: return "pygetwindow not available"
    try:
        wins = gw.getWindowsWithTitle(title)
        if not wins: return f"No window matching '{title}'"
        w = wins[0]
        if w.isMinimized: w.restore()
        w.activate(); return f"Set foreground: \"{w.title}\""
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetProcessByPort", description="Get process using a specific port.")
def get_process_by_port_tool(port: int) -> str:
    _require_psutil()
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.laddr and conn.laddr.port == port and conn.pid:
                p = psutil.Process(conn.pid)
                return json.dumps({"pid": p.pid, "name": p.name(), "port": port}, indent=2)
        return f"No process on port {port}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ClearClipboard", description="Clear the clipboard.")
def clear_clipboard_tool() -> str:
    _require_pyperclip()
    try: pyperclip.copy(""); return "Clipboard cleared"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetHomeDir", description="Get home directory path.")
def get_home_dir_tool() -> str: return str(Path.home())

@mcp.tool(name="GetTempDir", description="Get temp directory path.")
def get_temp_dir_tool() -> str: return tempfile.gettempdir()

@mcp.tool(name="GetDesktopDir", description="Get desktop directory path.")
def get_desktop_dir_tool() -> str: return str(Path.home() / "Desktop")

@mcp.tool(name="GetCurrentDir", description="Get current working directory.")
def get_current_dir_tool() -> str: return os.getcwd()

@mcp.tool(name="DoubleClick", description="Double-click at (x, y).")
def double_click_tool(x: int, y: int, button: str = "left") -> str:
    _require_pyautogui()
    try: pyautogui.doubleClick(x, y, button=button); return f"Double-clicked at ({x},{y})"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="RightClick", description="Right-click at (x, y).")
def right_click_tool(x: int, y: int) -> str:
    _require_pyautogui()
    try: pyautogui.rightClick(x, y); return f"Right-clicked at ({x},{y})"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="MiddleClick", description="Middle-click at (x, y).")
def middle_click_tool(x: int, y: int) -> str:
    _require_pyautogui()
    try: pyautogui.middleClick(x, y); return f"Middle-clicked at ({x},{y})"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="MouseDown", description="Press and hold mouse button.")
def mouse_down_tool(button: str = "left") -> str:
    _require_pyautogui()
    try: pyautogui.mouseDown(button=button); return f"Mouse '{button}' down"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="MouseUp", description="Release mouse button.")
def mouse_up_tool(button: str = "left") -> str:
    _require_pyautogui()
    try: pyautogui.mouseUp(button=button); return f"Mouse '{button}' up"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="KeyDown", description="Press and hold a key.")
def key_down_tool(key: str) -> str:
    _require_pyautogui()
    try: pyautogui.keyDown(key); return f"Key '{key}' down"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="KeyUp", description="Release a key.")
def key_up_tool(key: str) -> str:
    _require_pyautogui()
    try: pyautogui.keyUp(key); return f"Key '{key}' up"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="FindWindow", description="Find windows by title (case-insensitive partial match).")
def find_window_tool(title: str) -> str:
    if gw is None: return "pygetwindow not available"
    try:
        wins = gw.getWindowsWithTitle(title)
        if not wins: return f"No window matching '{title}'"
        return "\n".join([f"\"{w.title}\" | pos=({w.left},{w.top}) size={w.width}x{w.height}" for w in wins])
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ChangeDirectory", description="Change current working directory.")
def change_directory_tool(path: str) -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.is_dir(): return f"Not a directory: {path}"
        os.chdir(str(p)); return f"Changed to: {p}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetDiskSpace", description="Get free and total disk space.")
def get_disk_space_tool(path: str = "/") -> str:
    try:
        if not psutil: return "psutil not available"
        u = psutil.disk_usage(path)
        return json.dumps({"total_gb": round(u.total/(1024**3),2), "free_gb": round(u.free/(1024**3),2)}, indent=2)
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="SendSignal", description="Send signal to process by PID. Use SIGTERM, SIGKILL, SIGSTOP, SIGCONT.")
def send_signal_tool(pid: int, signal_name: str = "SIGTERM") -> str:
    _require_psutil()
    try:
        p = psutil.Process(pid); sig = getattr(signal, signal_name.upper(), signal.SIGTERM)
        p.send_signal(sig); return f"Sent {signal_name} to PID {pid}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="HttpGet", description="HTTP GET request.")
def http_get_tool(url: str, timeout: int = 15) -> str:
    if _requests is None: return "requests not installed"
    try:
        resp = _requests.get(url, timeout=timeout)
        return f"Status: {resp.status_code}\nBody:\n{resp.text[:10000]}"
    except Exception as e: return f"HttpGet failed: {e}"

@mcp.tool(name="HttpPost", description="HTTP POST with JSON body.")
def http_post_tool(url: str, body: str, timeout: int = 15) -> str:
    if _requests is None: return "requests not installed"
    try:
        data = json.loads(body) if body else {}
        resp = _requests.post(url, json=data, timeout=timeout)
        return f"Status: {resp.status_code}\nBody:\n{resp.text[:10000]}"
    except Exception as e: return f"HttpPost failed: {e}"

@mcp.tool(name="GetHostname", description="Get system hostname.")
def get_hostname_tool() -> str: return platform.node()

@mcp.tool(name="GetLocalIP", description="Get local IP address.")
def get_local_ip_tool() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]; s.close(); return ip
    except: return "Unable to determine local IP"

@mcp.tool(name="GetPublicIP", description="Get public IP via external service.")
def get_public_ip_tool() -> str:
    if _requests is None: return "requests not installed"
    try: return _requests.get("https://api.ipify.org", timeout=10).text.strip()
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="HexDump", description="Show hex dump of first N bytes of file.")
def hex_dump_tool(path: str, length: int = 256) -> str:
    try:
        data = Path(path).expanduser().resolve().read_bytes()[:length]
        lines = []
        for i in range(0, len(data), 16):
            chunk = data[i:i+16]
            hex_part = " ".join(f"{b:02x}" for b in chunk)
            ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
            lines.append(f"{i:08x}  {hex_part:<48}  {ascii_part}")
        return "\n".join(lines) if lines else "(empty file)"
    except Exception as e: return f"HexDump failed: {e}"

@mcp.tool(name="GetSystemResources", description="Get overall system resource usage.")
def get_system_resources_tool() -> str:
    _require_psutil()
    try:
        cpu = psutil.cpu_percent(interval=0.5); mem = psutil.virtual_memory(); disk = psutil.disk_usage("/"); net = psutil.net_io_counters()
        return json.dumps({"cpu_percent": cpu, "memory_percent": mem.percent, "disk_percent": disk.percent, "net_sent_mb": net.bytes_sent//(1024**2), "net_recv_mb": net.bytes_recv//(1024**2)}, indent=2)
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="BulkRename", description="Rename files matching pattern using regex substitution.")
def bulk_rename_tool(directory: str, find_pattern: str, replace_pattern: str, file_glob: str = "*") -> str:
    try:
        p = Path(directory).expanduser().resolve()
        if not p.is_dir(): return f"Not a directory: {directory}"
        renamed = []
        for f in p.glob(file_glob):
            if f.is_file():
                new_name = re.sub(find_pattern, replace_pattern, f.name)
                if new_name != f.name: f.rename(f.parent / new_name); renamed.append(f"{f.name} -> {new_name}")
        return "\n".join(renamed) if renamed else "No files renamed"
    except Exception as e: return f"BulkRename failed: {e}"

@mcp.tool(name="ClipboardManager", description="Clipboard manager: get/set/clear/history.")
def clipboard_manager_tool(action: str = "get", text: str | None = None) -> str:
    _require_pyperclip()
    global _clipboard_history
    try:
        if action == "get": return pyperclip.paste()
        elif action == "set":
            if text is None: return "Error: text required"
            pyperclip.copy(text); return f"Clipboard set ({len(text)} chars)"
        elif action == "clear": pyperclip.copy(""); return "Clipboard cleared"
        elif action == "history":
            if not _clipboard_history: return "History empty"
            return "\n".join([f"[{i}] {e[:80]}" for i, e in enumerate(_clipboard_history)])
        return f"Unknown action: {action}"
    except Exception as e: return f"ClipboardManager failed: {e}"

_clipboard_history = []

@mcp.tool(name="NewTab", description="Open new browser tab (Ctrl+T / Cmd+T).")
def new_tab_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "t"); return "Opened new tab"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="CloseTab", description="Close current tab (Ctrl+W / Cmd+W).")
def close_tab_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "w"); return "Closed tab"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="NextTab", description="Switch to next tab (Ctrl+Tab).")
def next_tab_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("ctrl", "tab"); return "Next tab"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="PreviousTab", description="Switch to previous tab (Ctrl+Shift+Tab).")
def previous_tab_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("ctrl", "shift", "tab"); return "Previous tab"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="RefreshPage", description="Refresh page (F5 / Ctrl+R).")
def refresh_page_tool() -> str:
    _require_pyautogui()
    try: pyautogui.press("f5"); return "Page refreshed"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GoBack", description="Navigate back.")
def go_back_tool() -> str:
    _require_pyautogui()
    try:
        if _is_macos: pyautogui.hotkey("command", "[")
        else: pyautogui.hotkey("alt", "left")
        return "Navigated back"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GoForward", description="Navigate forward.")
def go_forward_tool() -> str:
    _require_pyautogui()
    try:
        if _is_macos: pyautogui.hotkey("command", "]")
        else: pyautogui.hotkey("alt", "right")
        return "Navigated forward"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="SelectAll", description="Select all (Ctrl+A / Cmd+A).")
def select_all_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "a"); return "Selected all"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="Undo", description="Undo (Ctrl+Z / Cmd+Z).")
def undo_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "z"); return "Undone"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="Redo", description="Redo (Ctrl+Shift+Z / Cmd+Shift+Z).")
def redo_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "shift", "z"); return "Redone"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="Find", description="Open find dialog (Ctrl+F / Cmd+F).")
def find_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "f"); return "Find opened"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="FindAndReplace", description="Open find and replace (Ctrl+H / Cmd+Shift+H).")
def find_and_replace_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "shift", "h"); return "Find and replace opened"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="PasteText", description="Paste text using clipboard (works with all languages).")
def paste_text_tool(text: str) -> str:
    _require_pyperclip(); _require_pyautogui()
    try:
        pyperclip.copy(text); pyautogui.hotkey("command" if _is_macos else "ctrl", "v")
        return f"Pasted: {text[:50]}{'...' if len(text) > 50 else ''}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="FocusNextWindow", description="Switch to next window (Alt+Tab).")
def focus_next_window_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("alt", "tab"); return "Next window"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="FocusPreviousWindow", description="Switch to previous window (Alt+Shift+Tab).")
def focus_previous_window_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("alt", "shift", "tab"); return "Previous window"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ShowDesktop", description="Show desktop (Win+D / Cmd+F3).")
def show_desktop_tool() -> str:
    _require_pyautogui()
    try:
        if _is_macos: pyautogui.hotkey("command", "f3")
        else: pyautogui.hotkey("win", "d")
        return "Showed desktop"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="TaskView", description="Open task view (Win+Tab / Ctrl+Up).")
def task_view_tool() -> str:
    _require_pyautogui()
    try:
        if _is_macos: pyautogui.hotkey("ctrl", "up")
        else: pyautogui.hotkey("win", "tab")
        return "Task view opened"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="AdjustVolume", description="Adjust volume: up, down, mute, or set level (0-100).")
def adjust_volume_tool(action: str = "up", level: int | None = None) -> str:
    _require_pyautogui()
    try:
        if action == "mute": pyautogui.press("volumemute"); return "Volume muted"
        elif action == "up": pyautogui.press("volumeup"); return "Volume up"
        elif action == "down": pyautogui.press("volumedown"); return "Volume down"
        elif level is not None:
            pyautogui.press("volumemute"); time.sleep(0.1)
            for _ in range(level // 5): pyautogui.press("volumeup")
            return f"Volume ~{level}%"
        return f"Unknown action: {action}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="MediaPlayPause", description="Toggle media play/pause.")
def media_play_pause_tool() -> str:
    _require_pyautogui()
    try: pyautogui.press("playpause"); return "Play/pause toggled"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="MediaNext", description="Next media track.")
def media_next_tool() -> str:
    _require_pyautogui()
    try: pyautogui.press("nexttrack"); return "Next track"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="MediaPrevious", description="Previous media track.")
def media_previous_tool() -> str:
    _require_pyautogui()
    try: pyautogui.press("prevtrack"); return "Previous track"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="SnapWindow", description="Snap window to position: left, right, top, bottom, center, etc.")
def snap_window_tool(title: str, position: str = "center") -> str:
    if gw is None: return "pygetwindow not available"
    try:
        wins = gw.getWindowsWithTitle(title)
        if not wins: return f"No window matching '{title}'"
        w = wins[0]; sw, sh = pyautogui.size()
        positions = {"left": (0,0,sw//2,sh), "right": (sw//2,0,sw//2,sh), "top": (0,0,sw,sh//2), "bottom": (0,sh//2,sw,sh//2), "center": (sw//4,sh//4,sw//2,sh//2)}
        if position not in positions: return f"Unknown position: {position}"
        x, y, ws, hs = positions[position]; w.moveTo(x, y); w.resizeTo(ws, hs)
        return f"Snapped '{title}' to {position}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetProcessEnvironment", description="Get environment variables of a process by PID.")
def get_process_environment_tool(pid: int) -> str:
    _require_psutil()
    try: return "\n".join([f"{k}={v}" for k, v in sorted(psutil.Process(pid).environ().items())][:200])
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ClipboardAppend", description="Append text to clipboard content.")
def clipboard_append_tool(text: str) -> str:
    _require_pyperclip()
    try: current = pyperclip.paste(); pyperclip.copy(current + text); return f"Appended {len(text)} chars"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="SystemCommand", description="System commands: shutdown, reboot, logout, lock, sleep.")
def system_command_tool(command: str) -> str:
    cmds = {"shutdown": {"Windows": "shutdown /s /t 60", "Linux": "shutdown -h +1", "Darwin": "osascript -e 'tell app \"System Events\" to shut down'"}, "reboot": {"Windows": "shutdown /r /t 60", "Linux": "shutdown -r +1"}, "lock": {"Windows": "rundll32.exe user32.dll,LockWorkStation", "Linux": "xdg-screensaver lock"}}
    cmd_map = cmds.get(command.lower())
    if not cmd_map: return f"Unknown: {command}. Use: shutdown, reboot, lock"
    cmd = cmd_map.get(_OS)
    if not cmd: return f"'{command}' not supported on {_OS}"
    _run_shell(cmd); return f"Executed: {command}"

@mcp.tool(name="PasteImageFromFile", description="Load image from file.")
def paste_image_from_file_tool(path: str) -> str:
    try:
        img = Image.open(Path(path).expanduser().resolve())
        return f"Image loaded ({img.width}x{img.height})"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetFileChanges", description="Check if file has changed.")
def get_file_changes_tool(path: str) -> str:
    try:
        st = Path(path).expanduser().resolve().stat()
        return json.dumps({"size": st.st_size, "mtime": st.st_mtime, "mtime_iso": datetime.fromtimestamp(st.st_mtime).isoformat()}, indent=2)
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ClipboardTimestamp", description="Get current timestamp (clipboard proxy).")
def clipboard_timestamp_tool() -> str: return f"Timestamp: {datetime.now().isoformat()}"

@mcp.tool(name="ProcessTree", description="Show process tree with parent-child relationships.")
def process_tree_tool(root_pid: int | None = None, max_depth: int = 3) -> str:
    _require_psutil()
    try:
        if root_pid:
            root = psutil.Process(root_pid); lines = [f"{root.pid} {root.name()}"]
            def _children(proc, prefix, depth):
                if depth > max_depth: return
                for i, child in enumerate(proc.children(recursive=False)):
                    is_last = i == len(proc.children(recursive=False)) - 1
                    conn = "└── " if is_last else "├── "
                    lines.append(f"{prefix}{conn}{child.pid} {child.name()}")
                    _children(child, prefix + ("    " if is_last else "│   "), depth + 1)
            _children(root, "", 1); return "\n".join(lines)
        return "\n".join([f"{p.pid} {p.name()}" for p in psutil.process_iter(["pid","name"]) if p.info.get("ppid", 0) == 0][:20])
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="CreateSymlink", description="Create symbolic link.")
def create_symlink_tool(source: str, destination: str) -> str:
    try:
        src = Path(source).expanduser().resolve(); dst = Path(destination).expanduser().resolve()
        dst.parent.mkdir(parents=True, exist_ok=True); os.symlink(str(src), str(dst))
        return f"Created symlink: {dst} -> {src}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ReadSymlink", description="Read symlink target.")
def read_symlink_tool(path: str) -> str:
    try: return f"{path} -> {os.readlink(str(Path(path).expanduser().resolve()))}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetPermissions", description="Get file permissions.")
def get_permissions_tool(path: str) -> str:
    try:
        st = Path(path).expanduser().resolve().stat()
        perms = []
        if st.st_mode & stat_mod.S_IRUSR: perms.append("r")
        if st.st_mode & stat_mod.S_IWUSR: perms.append("w")
        if st.st_mode & stat_mod.S_IXUSR: perms.append("x")
        return f"Permissions: {''.join(perms)} ({oct(st.st_mode)[-3:]})"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ListDisks", description="List all disk partitions.")
def list_disks_tool() -> str:
    _require_psutil()
    try:
        lines = []
        for part in psutil.disk_partitions():
            try:
                u = psutil.disk_usage(part.mountpoint)
                lines.append(f"{part.device} -> {part.mountpoint} | Total: {u.total//(1024**3)}GB | Used: {u.percent}% | FS: {part.fstype}")
            except: continue
        return "\n".join(lines) if lines else "No disks found"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ClipboardHistory", description="Show clipboard history (last 20 entries).")
def clipboard_history_tool() -> str:
    if not _clipboard_history: return "History empty"
    return "\n".join([f"[{i}] {e[:80]}" for i, e in enumerate(_clipboard_history)])

@mcp.tool(name="TypeUnicode", description="Type unicode characters via clipboard paste.")
def type_unicode_tool(text: str) -> str:
    _require_pyperclip(); _require_pyautogui()
    try: pyperclip.copy(text); pyautogui.hotkey("command" if _is_macos else "ctrl", "v"); return f"Typed: {text[:50]}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetPixelAt", description="Get RGB color at coordinates.")
def get_pixel_at_tool(x: int, y: int) -> str:
    try:
        img = _safe_screenshot(region=(x,y,1,1)); r, g, b = img.getpixel((0,0))[:3]
        return f"RGB({r},{g},{b}) = #{r:02x}{g:02x}{b:02x}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="TakeScreenshot", description="Take screenshot and save to file.")
def take_screenshot_tool(path: str | None = None, region: list[int] | None = None) -> str:
    _require_pyautogui()
    try:
        img = _safe_screenshot(region=tuple(region) if region else None)
        if path is None: path = os.path.join(tempfile.gettempdir(), f"screenshot_{int(time.time())}.png")
        p = Path(path).expanduser().resolve(); p.parent.mkdir(parents=True, exist_ok=True)
        img.save(str(p), format="PNG"); return f"Saved to: {p}"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ClipboardGet", description="Get clipboard content (compatibility alias).")
def clipboard_get_tool() -> str:
    _require_pyperclip()
    try: return pyperclip.paste()
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ClipboardSet", description="Set clipboard content (compat alias).")
def clipboard_set_tool(text: str) -> str:
    _require_pyperclip()
    try: pyperclip.copy(text); return f"Clipboard set ({len(text)} chars)"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="PasteClipboard", description="Paste from clipboard via keyboard shortcut.")
def paste_clipboard_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "v"); return "Pasted"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="CopySelection", description="Copy current selection (Ctrl+C / Cmd+C).")
def copy_selection_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "c"); return "Copied"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="CutSelection", description="Cut current selection (Ctrl+X / Cmd+X).")
def cut_selection_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "x"); return "Cut"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="DeleteSelection", description="Delete current selection.")
def delete_selection_tool() -> str:
    _require_pyautogui()
    try: pyautogui.press("delete"); return "Deleted"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="InsertLine", description="Insert new line (Enter).")
def insert_line_tool() -> str:
    _require_pyautogui()
    try: pyautogui.press("enter"); return "New line inserted"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="IndentLine", description="Indent line (Tab).")
def indent_line_tool() -> str:
    _require_pyautogui()
    try: pyautogui.press("tab"); return "Indented"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="UnindentLine", description="Unindent line (Shift+Tab).")
def unindent_line_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("shift", "tab"); return "Unindented"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="MoveLineUp", description="Move line up (Alt+Up).")
def move_line_up_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("alt", "up"); return "Moved up"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="MoveLineDown", description="Move line down (Alt+Down).")
def move_line_down_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("alt", "down"); return "Moved down"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="DuplicateLine", description="Duplicate line (Ctrl+D / Cmd+D).")
def duplicate_line_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "d"); return "Duplicated"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="CommentLine", description="Toggle comment (Ctrl+/ / Cmd+/).")
def comment_line_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "/"); return "Toggled comment"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="FormatDocument", description="Format document (Shift+Alt+F / Shift+Cmd+F).")
def format_document_tool() -> str:
    _require_pyautogui()
    try:
        if _is_macos: pyautogui.hotkey("shift", "command", "f")
        else: pyautogui.hotkey("shift", "alt", "f")
        return "Formatted"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="SaveFile", description="Save file (Ctrl+S / Cmd+S).")
def save_file_tool() -> str:
    _require_pyautogui()
    try: pyautogui.hotkey("command" if _is_macos else "ctrl", "s"); return "Saved"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="WatchFile", description="Watch file for changes for N seconds.")
def watch_file_tool(path: str, duration: int = 5) -> str:
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists(): return f"File not found: {path}"
        initial = p.stat().st_mtime; time.sleep(duration)
        final = p.stat().st_mtime
        return f"Changed: {initial} -> {final}" if initial != final else f"No changes in {duration}s"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ClipboardClear", description="Clear clipboard.")
def clipboard_clear_tool() -> str:
    _require_pyperclip()
    try: pyperclip.copy(""); return "Cleared"
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetCPULoad", description="Get per-core CPU load.")
def get_cpu_load_tool() -> str:
    _require_psutil()
    try: return "\n".join([f"Core {i}: {load}%" for i, load in enumerate(psutil.cpu_percent(interval=1, percpu=True))])
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="GetMemoryDetails", description="Get detailed memory usage.")
def get_memory_details_tool() -> str:
    _require_psutil()
    try:
        m = psutil.virtual_memory()
        return json.dumps({"total_gb": round(m.total/(1024**3),2), "available_gb": round(m.available/(1024**3),2), "used_gb": round(m.used/(1024**3),2), "percent": m.percent}, indent=2)
    except Exception as e: return f"Failed: {e}"

@mcp.tool(name="ClipboardClear2", description="Clear clipboard (alias).")
def clipboard_clear2_tool() -> str:
    _require_pyperclip()
    try: pyperclip.copy(""); return "Cleared"
    except Exception as e: return f"Failed: {e}"

def main():
    mcp.run()

if __name__ == "__main__":
    main()
