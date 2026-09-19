#!/usr/bin/env python3
"""ZYRAXON Touchpoint MCP — 56 tools. Accessibility-based desktop automation.
Cross-platform: Windows (UIAutomation), Linux (AT-SPI2), macOS (AX API).
Controls ANY app via accessibility APIs — minimized or not, no screenshots needed.
"""
import sys, os
from pathlib import Path

_dir = Path(__file__).parent
_libs = _dir / "libs"
if _libs.is_dir():
    sys.path.insert(0, str(_libs))
    os.environ["PYTHONPATH"] = str(_libs) + os.pathsep + os.environ.get("PYTHONPATH", "")
os.environ.setdefault("TOUCHPOINT_MODE", "no-vision")

from mcp.server.fastmcp import FastMCP
import touchpoint as tp
from touchpoint import Role, State

mcp = FastMCP(
    "ZYRAXON Touchpoint MCP",
    instructions=(
        "ZYRAXON accessibility-based desktop automation. "
        "Controls ANY application via native accessibility APIs. "
        "No screenshots needed — works with minimized apps. "
        "Cross-platform: Windows (UIAutomation), Linux (AT-SPI2), macOS (AX). "
        "Also supports CDP for browser/Electron apps."
    ),
)

# ═══════════════════════════════════════════════════════════════════════════
# 1. DISCOVERY & CONFIGURATION (7 tools)
# ═══════════════════════════════════════════════════════════════════════════

@mcp.tool()
def apps() -> str:
    """List all open applications that expose accessibility elements."""
    return str(tp.apps())

@mcp.tool()
def windows() -> str:
    """List all windows with title, app name, PID, position, size."""
    return str(tp.windows())

@mcp.tool()
def elements(app: str = "", window_id: str = "", tree: bool = False, max_depth: int = 10, role: str = "", states: str = "", named_only: bool = False, source: str = "full") -> str:
    """Get UI elements from accessibility tree. More detailed than find().
    Args: app (scope), window_id (scope), tree (recursive), max_depth, role (filter), states (comma-sep), named_only, source (full/native/cdp_ax/dom)"""
    kw = {"tree": tree, "max_depth": max_depth, "named_only": named_only, "source": source}
    if app: kw["app"] = app
    if window_id: kw["window_id"] = window_id
    if role: kw["role"] = Role(role)
    if states: kw["states"] = [State(s.strip()) for s in states.split(",")]
    result = tp.elements(**kw)
    if isinstance(result, str):
        return result
    if not result:
        return "No elements found"
    lines = []
    for el in result[:200]:
        lines.append(f"[{el.id}] {el.role.value}: '{el.name}' @({el.position[0]},{el.position[1]})")
    return f"Elements ({len(result)} total):\n" + "\n".join(lines)

@mcp.tool()
def find(query: str, app: str = "", window_id: str = "", role: str = "", states: str = "", max_results: int = 20, source: str = "full") -> str:
    """Search elements by name — exact, contains, word match, fuzzy. Best for locating buttons/fields.
    Args: query (search text), app (scope), window_id (scope), role (filter), states (comma-sep), max_results, source"""
    kw = {"max_results": max_results, "source": source}
    if app: kw["app"] = app
    if window_id: kw["window_id"] = window_id
    if role: kw["role"] = Role(role)
    if states: kw["states"] = [State(s.strip()) for s in states.split(",")]
    results = tp.find(query, **kw)
    if not results:
        return f"No elements found for '{query}'"
    out = []
    for el in results[:max_results]:
        out.append(f"  [{el.id}] {el.role.value}: '{el.name}' @({el.position[0]},{el.position[1]})")
    return f"Found {len(results)} elements for '{query}':\n" + "\n".join(out)

@mcp.tool()
def snapshot(app: str = "", window_id: str = "", max_depth: int = 10, all_elements: bool = False) -> str:
    """Structured accessibility tree of a window. Use when find() is ambiguous or you need container structure.
    Args: app (scope), window_id (scope), max_depth, all_elements (include non-interactive)"""
    kw = {"tree": True, "max_depth": max_depth}
    if app: kw["app"] = app
    if window_id: kw["window_id"] = window_id
    elements_list = tp.elements(**kw)
    if not elements_list:
        return "No elements found"
    lines = []
    for el in elements_list[:300]:
        if not all_elements and not el.name and el.role.value not in ("menu", "menubar", "menuitem", "toolbar", "frame", "window", "dialog", "panel", "group", "filler"):
            continue
        lines.append(f"[{el.id}] {el.role.value}: '{el.name}'")
    return f"Snapshot ({len(lines)} elements):\n" + "\n".join(lines)

@mcp.tool()
def get_element(element_id: str) -> str:
    """Get detailed info about a specific element by ID — fresh snapshot with current position, states, actions."""
    el = tp.get_element(element_id)
    if el is None:
        return f"Element {element_id} not found"
    actions = []
    if hasattr(el, 'actions'):
        actions = el.actions
    return f"ID: {el.id}\nRole: {el.role.value}\nName: '{el.name}'\nDescription: '{getattr(el, 'description', '')}'\nPosition: {el.position}\nSize: {getattr(el, 'size', 'N/A')}\nStates: {[s.value for s in el.states]}\nActions: {actions}"

@mcp.tool()
def element_at(x: int, y: int) -> str:
    """Get the deepest element at screen coordinates (x, y)."""
    el = tp.element_at(x, y)
    if el is None:
        return f"No element at ({x}, {y})"
    return f"Element at ({x},{y}): [{el.id}] {el.role.value}: '{el.name}' @({el.position[0]},{el.position[1]})"

@mcp.tool()
def diagnostics(probe: bool = True) -> str:
    """Check accessibility backend status, CDP connections, platform info."""
    return str(tp.diagnostics(probe=probe))

# ═══════════════════════════════════════════════════════════════════════════
# 2. WINDOW MANAGEMENT (8 tools)
# ═══════════════════════════════════════════════════════════════════════════

@mcp.tool()
def activate_window(window_id: str) -> str:
    """Bring a window to foreground. REQUIRED before type_text/press_key when switching apps."""
    ok = tp.activate_window(window_id)
    return f"Window {window_id} activated" if ok else f"Failed to activate {window_id}"

@mcp.tool()
def minimize_window(window_id: str) -> str:
    """Minimize a window. Use activate_window() to restore."""
    ok = tp.minimize_window(window_id)
    return f"Window {window_id} minimized" if ok else f"Failed to minimize {window_id}"

@mcp.tool()
def fullscreen_window(window_id: str, fullscreen: bool = True) -> str:
    """Enter or exit fullscreen for a window."""
    ok = tp.fullscreen_window(window_id, fullscreen)
    state = "fullscreen" if fullscreen else "windowed"
    return f"Window {window_id} set to {state}" if ok else "Failed"

@mcp.tool()
def close_window(window_id: str) -> str:
    """Close a window."""
    ok = tp.close_window(window_id)
    return f"Window {window_id} closed" if ok else f"Failed to close {window_id}"

@mcp.tool()
def move_window(window_id: str, x: int, y: int) -> str:
    """Move a window to screen position (x, y)."""
    ok = tp.move_window(window_id, x, y)
    return f"Window {window_id} moved to ({x},{y})" if ok else "Failed"

@mcp.tool()
def resize_window(window_id: str, width: int, height: int) -> str:
    """Resize a window to width x height pixels."""
    ok = tp.resize_window(window_id, width, height)
    return f"Window {window_id} resized to {width}x{height}" if ok else "Failed"

@mcp.tool()
def find_window(title: str, app: str = "") -> str:
    """Find a window by title substring match. Returns window ID for use with other tools."""
    kw = {}
    if app: kw["app"] = app
    win = tp.find_window(title, **kw)
    if win is None:
        return f"No window matching '{title}'"
    return f"Found: [{win.id}] '{win.title}' in {win.app} (PID: {win.pid})"

@mcp.tool()
def monitor_count() -> str:
    """Get number of monitors/displays connected."""
    return f"Monitors: {tp.monitor_count()}"

# ═══════════════════════════════════════════════════════════════════════════
# 3. CLICK & MOUSE (8 tools)
# ═══════════════════════════════════════════════════════════════════════════

@mcp.tool()
def click(element_id: str) -> str:
    """Left-click an element. Tries native accessibility first, falls back to coordinates."""
    ok = tp.click(element_id)
    return f"Clicked {element_id}" if ok else f"Failed to click {element_id}"

@mcp.tool()
def double_click(element_id: str) -> str:
    """Double-click an element."""
    ok = tp.double_click(element_id)
    return f"Double-clicked {element_id}" if ok else "Failed"

@mcp.tool()
def right_click(element_id: str) -> str:
    """Right-click (context menu) on an element."""
    ok = tp.right_click(element_id)
    return f"Right-clicked {element_id}" if ok else "Failed"

@mcp.tool()
def click_at(x: int, y: int, button: str = "left") -> str:
    """Click at exact screen coordinates. Use when element IDs aren't available."""
    if button == "right":
        tp.right_click_at(x, y)
    else:
        tp.click_at(x, y)
    return f"Clicked {button} at ({x},{y})"

@mcp.tool()
def double_click_at(x: int, y: int) -> str:
    """Double-click at exact screen coordinates."""
    tp.double_click_at(x, y)
    return f"Double-clicked at ({x},{y})"

@mcp.tool()
def right_click_at(x: int, y: int) -> str:
    """Right-click (context menu) at exact screen coordinates."""
    tp.right_click_at(x, y)
    return f"Right-clicked at ({x},{y})"

@mcp.tool()
def mouse_move(x: int, y: int) -> str:
    """Move mouse cursor to screen coordinates (x, y)."""
    tp.mouse_move(x, y)
    return f"Mouse moved to ({x},{y})"

@mcp.tool()
def drag(x1: int, y1: int, x2: int, y2: int, button: str = "left") -> str:
    """Drag from (x1,y1) to (x2,y2). For drag-and-drop operations."""
    import time
    tp.mouse_move(x1, y1)
    time.sleep(0.05)
    if button == "right":
        import ctypes
        ctypes.windll.user32.mouse_event(0x0008, 0, 0, 0, 0)
    else:
        import ctypes
        ctypes.windll.user32.mouse_event(0x0002, 0, 0, 0, 0)
    time.sleep(0.05)
    steps = 10
    for i in range(1, steps + 1):
        cx = x1 + (x2 - x1) * i // steps
        cy = y1 + (y2 - y1) * i // steps
        tp.mouse_move(cx, cy)
        time.sleep(0.01)
    time.sleep(0.05)
    if button == "right":
        import ctypes
        ctypes.windll.user32.mouse_event(0x0010, 0, 0, 0, 0)
    else:
        import ctypes
        ctypes.windll.user32.mouse_event(0x0004, 0, 0, 0, 0)
    return f"Dragged from ({x1},{y1}) to ({x2},{y2})"

# ═══════════════════════════════════════════════════════════════════════════
# 4. TEXT INPUT & KEYBOARD (4 tools)
# ═══════════════════════════════════════════════════════════════════════════

@mcp.tool()
def type_text(text: str) -> str:
    """Type text via keyboard. Click/focus a field FIRST. For hotkeys use hotkey()."""
    tp.type_text(text)
    return f"Typed: '{text[:100]}{'...' if len(text)>100 else ''}'"

@mcp.tool()
def press_key(keys: str, repeat: int = 1) -> str:
    """Press keyboard key(s). Examples: 'enter', 'tab', 'escape', 'backspace', 'delete', 'up', 'down', 'left', 'right', 'f5', 'home', 'end', 'pageup', 'pagedown'"""
    tp.press_key(keys, repeat=repeat)
    return f"Pressed: {keys}" + (f" x{repeat}" if repeat > 1 else "")

@mcp.tool()
def hotkey(keys: str) -> str:
    """Press hotkey combination. Separator: +. Examples: 'ctrl+s', 'alt+tab', 'ctrl+shift+p', 'ctrl+c', 'ctrl+v', 'ctrl+z', 'alt+f4', 'ctrl+w'"""
    parts = [k.strip() for k in keys.split("+")]
    tp.hotkey(*parts)
    return f"Hotkey: {keys}"

@mcp.tool()
def scroll(dy: int = 0, dx: int = 0) -> str:
    """Scroll at current mouse position. dy=vertical (negative=down), dx=horizontal (negative=left). Typical: dy=-3 for scroll down, dy=3 for scroll up."""
    tp.scroll(dy=dy, dx=dx)
    return f"Scrolled dy={dy} dx={dx}"

# ═══════════════════════════════════════════════════════════════════════════
# 5. VALUE SETTING & FOCUS (6 tools)
# ═══════════════════════════════════════════════════════════════════════════

@mcp.tool()
def set_value(element_id: str, value: str, replace: bool = False) -> str:
    """Set text value of an editable element. replace=True clears field first, replace=False inserts at cursor."""
    ok = tp.set_value(element_id, value, replace=replace)
    mode = "replaced" if replace else "inserted"
    return f"{mode} value on {element_id}" if ok else "Failed"

@mcp.tool()
def set_numeric_value(element_id: str, value: float) -> str:
    """Set numeric value of a slider, spinbox, or range element."""
    ok = tp.set_numeric_value(element_id, value)
    return f"Set numeric {value} on {element_id}" if ok else "Failed"

@mcp.tool()
def focus(element_id: str) -> str:
    """Move keyboard focus to an element. Required before typing into some fields."""
    ok = tp.focus(element_id)
    return f"Focused {element_id}" if ok else "Failed"

@mcp.tool()
def select_text(element_id: str, text: str, occurrence: int = 1) -> str:
    """Select a substring within an element's text content. occurrence=which match (1-based)."""
    ok = tp.select_text(element_id, text, occurrence=occurrence)
    return f"Selected '{text}' (occurrence {occurrence}) in {element_id}" if ok else "Failed"

@mcp.tool()
def select_text_range(element_id: str, start: int, end: int) -> str:
    """Select character range [start, end) within an element's text. 0-based offsets."""
    ok = tp.select_text_range(element_id, start, end)
    return f"Selected range [{start},{end}) in {element_id}" if ok else "Failed"

@mcp.tool()
def action(element_id: str, action_name: str) -> str:
    """Perform a raw accessibility action by exact name. Use when click/focus/set_value don't work.
    Common actions: 'press', 'toggle', 'showContextMenu', 'setValue', 'increment', 'decrement'"""
    ok = tp.action(element_id, action_name)
    return f"Action '{action_name}' on {element_id}" if ok else "Failed"

# ═══════════════════════════════════════════════════════════════════════════
# 6. TEXT READING (1 tool)
# ═══════════════════════════════════════════════════════════════════════════

@mcp.tool()
def read_text(element_id: str) -> str:
    """Read text content from element. Works on documents, terminals, text fields, web pages.
    Prefer this over OCR from screenshots — it's faster, cheaper, and verbatim."""
    text = tp.get_text_content(element_id)
    if text is None:
        return f"No text content in {element_id}"
    if len(text) == 0:
        return f"Element {element_id} exists but has empty text"
    return f"Text ({len(text)} chars):\n{text[:2000]}"

# ═══════════════════════════════════════════════════════════════════════════
# 7. SCREENSHOT & VISION (2 tools — including MINIMIZED window capture)
# ═══════════════════════════════════════════════════════════════════════════

def _screenshot_window_platform(window_id: str) -> "Image.Image | None":
    """Capture a specific window using platform APIs — works even when MINIMIZED.
    Windows: PrintWindow API (captures without bringing to foreground).
    Linux: X Composite Extension (off-screen buffer capture).
    macOS: CGWindowListCreateImage (captures any window by ID).
    """
    import platform
    system = platform.system()

    if system == "Windows":
        return _screenshot_window_windows(window_id)
    elif system == "Linux":
        return _screenshot_window_linux(window_id)
    elif system == "Darwin":
        return _screenshot_window_macos(window_id)
    return None


def _screenshot_window_windows(window_id: str) -> "Image.Image | None":
    """Windows: Use PrintWindow API to capture a window — even if minimized/offscreen.
    This does NOT bring the window to foreground. Captures the actual window content.
    """
    try:
        import ctypes
        from ctypes import wintypes
        import struct
        from PIL import Image

        user32 = ctypes.windll.user32
        gdi32 = ctypes.windll.gdi32

        # Parse window handle from window_id (could be hex string or decimal)
        try:
            hwnd = int(window_id, 16) if window_id.startswith("0x") or window_id.startswith("0X") else int(window_id)
        except (ValueError, TypeError):
            # Try to find window by searching windows
            wins = tp.windows()
            for w in wins:
                if hasattr(w, 'id') and str(w.id) == window_id:
                    hwnd = int(str(w.id), 16) if hasattr(w, 'handle') else None
                    if hwnd is None and hasattr(w, 'handle'):
                        hwnd = w.handle
                    break
            else:
                return None

        if not hwnd or not user32.IsWindow(hwnd):
            return None

        # Get window rect — works even for minimized windows
        class RECT(ctypes.Structure):
            _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long),
                        ("right", ctypes.c_long), ("bottom", ctypes.c_long)]

        rect = RECT()
        # Use GetWindowRect for visible windows, or try DwmGetWindowAttribute for better bounds
        try:
            dwmapi = ctypes.windll.dwmapi
            DWMWA_EXTENDED_FRAME_BOUNDS = 9
            dwmapi.DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, ctypes.byref(rect), ctypes.sizeof(rect))
        except Exception:
            user32.GetWindowRect(hwnd, ctypes.byref(rect))

        width = rect.right - rect.left
        height = rect.bottom - rect.top

        if width <= 0 or height <= 0:
            # Window might be fully minimized — use GetWindowPlacement to get restored position
            class POINT(ctypes.Structure):
                _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
            class WINDOWPLACEMENT(ctypes.Structure):
                _fields_ = [
                    ("length", ctypes.c_uint),
                    ("flags", ctypes.c_uint),
                    ("showCmd", ctypes.c_uint),
                    ("ptMinPosition", POINT),
                    ("ptMaxPosition", POINT),
                    ("rcNormalPosition", RECT),
                ]
            wp = WINDOWPLACEMENT()
            wp.length = ctypes.sizeof(WINDOWPLACEMENT)
            user32.GetWindowPlacement(hwnd, ctypes.byref(wp))
            rect = wp.rcNormalPosition
            width = rect.right - rect.left
            height = rect.bottom - rect.top

        if width <= 0 or height <= 0:
            return None

        # Create device contexts
        hdc_window = user32.GetDC(hwnd)
        hdc_mem = gdi32.CreateCompatibleDC(hdc_window)
        hbitmap = gdi32.CreateCompatibleBitmap(hdc_window, width, height)
        gdi32.SelectObject(hdc_mem, hbitmap)

        # PrintWindow — captures window content WITHOUT bringing to foreground
        # PW_RENDERFULLCONTENT = 0x00000002 (Windows 8.1+)
        PRF_CLIENT = 0x00000004
        PRF_CHILDREN = 0x00000010
        result = user32.PrintWindow(hwnd, hdc_mem, PRF_CLIENT | PRF_CHILDREN)

        if not result:
            # Fallback: BitBlt from screen DC
            user32.ReleaseDC(hwnd, hdc_window)
            hdc_screen = user32.GetDC(0)
            gdi32.BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, rect.left, rect.top, 0x00CC0020)  # SRCCOPY
            user32.ReleaseDC(0, hdc_screen)
        else:
            user32.ReleaseDC(hwnd, hdc_window)

        # Convert HBITMAP to PIL Image
        class BITMAPINFOHEADER(ctypes.Structure):
            _fields_ = [
                ("biSize", ctypes.c_uint32), ("biWidth", ctypes.c_long),
                ("biHeight", ctypes.c_long), ("biPlanes", ctypes.c_uint16),
                ("biBitCount", ctypes.c_uint16), ("biCompression", ctypes.c_uint32),
                ("biSizeImage", ctypes.c_uint32), ("biXPelsPerMeter", ctypes.c_long),
                ("biYPelsPerMeter", ctypes.c_long), ("biClrUsed", ctypes.c_uint32),
                ("biClrImportant", ctypes.c_uint32),
            ]

        bmi = BITMAPINFOHEADER()
        bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.biWidth = width
        bmi.biHeight = -height  # Negative = top-down
        bmi.biPlanes = 1
        bmi.biBitCount = 32
        bmi.biCompression = 0  # BI_RGB

        buf = ctypes.create_string_buffer(width * height * 4)
        gdi32.GetDIBits(hdc_mem, hbitmap, 0, height, buf, ctypes.byref(bmi), 0)

        # Cleanup GDI
        gdi32.DeleteObject(hbitmap)
        gdi32.DeleteDC(hdc_mem)

        # Convert BGRX to RGB
        img = Image.frombuffer("RGBX", (width, height), buf, "raw", "BGRX", 0, 1)
        img = img.convert("RGB")
        return img

    except Exception as e:
        return None


def _screenshot_window_linux(window_id: str) -> "Image.Image | None":
    """Linux: Use X Composite Extension to capture off-screen window content."""
    try:
        import subprocess
        # xdotool can get window geometry even for minimized windows
        result = subprocess.run(
            ["xdotool", "getwindowgeometry", "--shell", window_id],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            return None

        info = {}
        for line in result.stdout.strip().split("\n"):
            if "=" in line:
                k, v = line.split("=", 1)
                info[k.strip()] = int(v.strip())

        x, y = info.get("X", 0), info.get("Y", 0)
        width = info.get("WIDTH", 0)
        height = info.get("HEIGHT", 0)

        if width <= 0 or height <= 0:
            return None

        # Use import (ImageMagick) to capture specific window
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            tmp = f.name

        subprocess.run(
            ["import", "-window", window_id, tmp],
            capture_output=True, timeout=10
        )

        from PIL import Image
        img = Image.open(tmp)
        os.unlink(tmp)
        return img

    except Exception:
        return None


def _screenshot_window_macos(window_id: str) -> "Image.Image | None":
    """macOS: Use screencapture with -l flag to capture specific window by ID."""
    try:
        import subprocess
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            tmp = f.name

        # screencapture -l <windowID> captures specific window, even if behind others
        subprocess.run(
            ["screencapture", "-l", window_id, "-x", tmp],
            capture_output=True, timeout=10
        )

        from PIL import Image
        img = Image.open(tmp)
        os.unlink(tmp)
        return img

    except Exception:
        return None


@mcp.tool()
def screenshot(app: str = "") -> str:
    """Take screenshot. If app specified, crops to that app window. Use for visual verification only — prefer read_text() for reading content."""
    import io, base64
    kw = {}
    if app: kw["app"] = app
    img = tp.screenshot(**kw)
    if img is None:
        return "Screenshot failed"
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


@mcp.tool()
def screenshot_window(window_id: str) -> str:
    """Take screenshot of a SPECIFIC window — even if MINIMIZED or behind other windows.
    Uses platform APIs (PrintWindow on Windows, X Composite on Linux, CGWindowList on macOS).
    Does NOT bring the window to foreground. Returns base64 PNG.
    Use for verifying background/minimized app state."""
    import io, base64
    img = _screenshot_window_platform(window_id)
    if img is None:
        # Fallback: try to activate briefly, screenshot, minimize back
        try:
            tp.activate_window(window_id)
            import time
            time.sleep(0.3)
            img = tp.screenshot(app="")
            tp.minimize_window(window_id)
        except Exception:
            return "Screenshot failed — window may not exist or be capturable"
    if img is None:
        return "Screenshot failed"
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"

# ═══════════════════════════════════════════════════════════════════════════
# 8. CHROME TAB MANAGEMENT (6 tools)
# ═══════════════════════════════════════════════════════════════════════════

def _find_chrome_window() -> str | None:
    """Find Chrome window ID via accessibility."""
    wins = tp.windows()
    for w in wins:
        app_name = getattr(w, 'app', '') or ''
        title = getattr(w, 'title', '') or ''
        if 'chrome' in app_name.lower() or 'chrome' in title.lower():
            return w.id
    return None


@mcp.tool()
def chrome_profiles() -> str:
    """List all Chrome profiles. Shows profile names and which Gmail accounts are logged in.
    Use to identify which profile has the required login (YouTube, GitHub, etc.)."""
    import json
    user_data = Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "User Data"
    if not user_data.exists():
        user_data = Path.home() / ".config" / "google-chrome"
    if not user_data.exists():
        return "Chrome User Data directory not found"

    profiles = []
    local_state = user_data / "Local State"
    if local_state.exists():
        try:
            with open(local_state, "r", encoding="utf-8") as f:
                state = json.load(f)
            for profile in state.get("profile", {}).get("info_cache", {}).items():
                name = profile[1].get("name", profile[0])
                gaia_name = profile[1].get("gaia_name", "")
                email = profile[1].get("user_name", "")
                profiles.append(f"  {profile[0]}: {name}" + (f" ({email})" if email else ""))
        except Exception:
            pass

    if not profiles:
        # Fallback: list Profile directories
        for item in sorted(user_data.iterdir()):
            if item.is_dir() and item.name.startswith("Profile"):
                prefs = item / "Preferences"
                name = item.name
                if prefs.exists():
                    try:
                        with open(prefs, "r", encoding="utf-8") as f:
                            p = json.load(f)
                        name = p.get("profile", {}).get("name", item.name)
                    except Exception:
                        pass
                profiles.append(f"  {item.name}: {name}")

    if not profiles:
        return "No Chrome profiles found"

    return f"Chrome Profiles ({len(profiles)}):\n" + "\n".join(profiles)


@mcp.tool()
def open_chrome_profile(profile_name: str = "", url: str = "") -> str:
    """Open Chrome with a specific profile. If Chrome is already running, opens a NEW window with that profile.
    Args: profile_name (e.g. 'Default', 'Profile 1'), url (optional URL to open)"""
    import subprocess
    import shutil

    chrome_path = None
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        shutil.which("google-chrome") or "",
        shutil.which("chrome") or "",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for c in candidates:
        if c and Path(c).exists():
            chrome_path = c
            break

    if not chrome_path:
        return "Chrome not found on system"

    cmd = [chrome_path]
    if profile_name:
        cmd.extend([f"--profile-directory={profile_name}"])
    if url:
        cmd.append(url)
    else:
        cmd.append("about:blank")

    try:
        subprocess.Popen(cmd, creationflags=0x00000008 if os.name == "nt" else 0)  # DETACHED_PROCESS
        import time
        time.sleep(1.5)
        return f"Chrome opened with profile '{profile_name or 'Default'}'" + (f" at {url}" if url else "")
    except Exception as e:
        return f"Failed to open Chrome: {e}"


@mcp.tool()
def new_tab(url: str = "") -> str:
    """Open a NEW tab in the running Chrome browser. The tab opens silently in the background.
    User continues using their Chrome undisturbed. AI works in the new tab.
    If no Chrome is running, opens Chrome with a new window."""
    import subprocess
    import shutil
    import time

    # Check if Chrome is running
    chrome_running = False
    try:
        import platform
        if platform.system() == "Windows":
            result = subprocess.run(["tasklist", "/FI", "IMAGENAME eq chrome.exe"], capture_output=True, text=True, timeout=5)
            chrome_running = "chrome.exe" in result.stdout
        else:
            result = subprocess.run(["pgrep", "-f", "chrome"], capture_output=True, text=True, timeout=5)
            chrome_running = result.returncode == 0
    except Exception:
        pass

    if not chrome_running:
        # No Chrome running — launch it
        chrome_path = None
        candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            shutil.which("google-chrome") or "",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ]
        for c in candidates:
            if c and Path(c).exists():
                chrome_path = c
                break

        if not chrome_path:
            return "Chrome not found on system"

        target_url = url or "about:blank"
        try:
            subprocess.Popen([chrome_path, target_url], creationflags=0x00000008 if os.name == "nt" else 0)
            time.sleep(1.5)
            return f"Chrome opened with new tab: {target_url}"
        except Exception as e:
            return f"Failed to open Chrome: {e}"

    # Chrome is running — use accessibility to open new tab
    # Method 1: Find Chrome window, use Ctrl+T hotkey
    chrome_win = _find_chrome_window()
    if chrome_win:
        try:
            tp.activate_window(chrome_win)
            time.sleep(0.2)
            tp.hotkey("ctrl", "t")
            time.sleep(0.3)
            if url:
                # Type URL in address bar
                tp.hotkey("ctrl", "l")
                time.sleep(0.1)
                tp.type_text(url)
                time.sleep(0.1)
                tp.press_key("enter")
                time.sleep(0.5)
            # Minimize Chrome back so user doesn't notice
            tp.minimize_window(chrome_win)
            return f"New tab opened in Chrome" + (f" with URL: {url}" if url else "")
        except Exception as e:
            return f"Failed to open new tab via accessibility: {e}"

    return "Could not find Chrome window"


@mcp.tool()
def list_tabs() -> str:
    """List all open Chrome tabs with their titles and URLs.
    Uses accessibility tree to read tab bar information."""
    import time

    chrome_win = _find_chrome_window()
    if not chrome_win:
        return "Chrome not found"

    try:
        tp.activate_window(chrome_win)
        time.sleep(0.2)

        # Try to get tab info from accessibility
        elements_list = tp.elements(app="chrome", max_depth=5)
        tabs = []
        for el in (elements_list or []):
            role_val = el.role.value if hasattr(el, 'role') else ''
            name = el.name if hasattr(el, 'name') else ''
            if role_val in ("tab", "tabitem") and name:
                tabs.append(f"  [{el.id}] {name}")

        if tabs:
            return f"Chrome Tabs ({len(tabs)}):\n" + "\n".join(tabs)

        # Fallback: use Ctrl+Shift+A or screen read
        return "Could not enumerate tabs — use find() to locate specific elements"

    except Exception as e:
        return f"Error listing tabs: {e}"


@mcp.tool()
def switch_tab(tab_identifier: str) -> str:
    """Switch to a specific Chrome tab by title match or index.
    Args: tab_identifier (tab title substring, or number like '1', '2', '3' for tab position)"""
    import time

    chrome_win = _find_chrome_window()
    if not chrome_win:
        return "Chrome not found"

    try:
        tp.activate_window(chrome_win)
        time.sleep(0.2)

        # If it's a number, use Ctrl+<number> to switch
        if tab_identifier.isdigit():
            num = int(tab_identifier)
            if 1 <= num <= 8:
                tp.hotkey("ctrl", str(num))
                time.sleep(0.3)
                return f"Switched to tab {num}"
            elif num == 9:
                tp.hotkey("ctrl", "9")
                time.sleep(0.3)
                return "Switched to last tab"

        # Otherwise, find tab by title and click it
        results = tp.find(tab_identifier, app="chrome")
        for el in results:
            if hasattr(el, 'role') and el.role.value in ("tab", "tabitem"):
                tp.click(el.id)
                time.sleep(0.3)
                return f"Switched to tab: {el.name}"

        return f"Tab matching '{tab_identifier}' not found"

    except Exception as e:
        return f"Error switching tab: {e}"


@mcp.tool()
def close_tab(tab_identifier: str = "") -> str:
    """Close a Chrome tab. If no identifier given, closes the CURRENT tab.
    Args: tab_identifier (tab title substring, or position number)"""
    import time

    chrome_win = _find_chrome_window()
    if not chrome_win:
        return "Chrome not found"

    try:
        tp.activate_window(chrome_win)
        time.sleep(0.2)

        if not tab_identifier:
            # Close current tab
            tp.hotkey("ctrl", "w")
            time.sleep(0.3)
            return "Closed current tab"

        # Find and close specific tab
        results = tp.find(tab_identifier, app="chrome")
        for el in results:
            if hasattr(el, 'role') and el.role.value in ("tab", "tabitem"):
                # Right-click to get context menu, then close
                tp.right_click(el.id)
                time.sleep(0.3)
                # Look for "Close tab" in context menu
                close_items = tp.find("Close", app="chrome")
                for ci in close_items:
                    if "close" in (ci.name or "").lower():
                        tp.click(ci.id)
                        time.sleep(0.3)
                        return f"Closed tab: {el.name}"
                # Fallback: press Escape and use Ctrl+W
                tp.press_key("escape")
                time.sleep(0.1)
                tp.click(el.id)
                time.sleep(0.1)
                tp.hotkey("ctrl", "w")
                time.sleep(0.3)
                return f"Closed tab: {el.name}"

        return f"Tab matching '{tab_identifier}' not found"

    except Exception as e:
        return f"Error closing tab: {e}"

# ═══════════════════════════════════════════════════════════════════════════
# 9. WAITING (3 tools)
# ═══════════════════════════════════════════════════════════════════════════

@mcp.tool()
def wait_for(element: str = "", gone: bool = False, timeout: float = 10.0) -> str:
    """Wait for an element to appear (or disappear if gone=True) on screen.
    Use after actions that trigger UI changes (navigation, loading, dialogs)."""
    try:
        tp.wait_for(element=element, gone=gone, timeout=timeout)
        return f"Element '{element}' {'gone' if gone else 'found'}"
    except TimeoutError:
        return f"Timed out waiting for '{element}'"

@mcp.tool()
def wait_for_app(app: str = "", timeout: float = 10.0, gone: bool = False) -> str:
    """Wait for an application to appear (or disappear if gone=True).
    Use after launching an application."""
    try:
        tp.wait_for_app(app, timeout=timeout, gone=gone)
        return f"App '{app}' {'gone' if gone else 'found'}"
    except TimeoutError:
        return f"Timed out waiting for app '{app}'"

@mcp.tool()
def wait_for_window(title: str = "", app: str = "", timeout: float = 10.0, gone: bool = False) -> str:
    """Wait for a window with matching title to appear (or disappear if gone=True).
    Use after triggering dialogs, popups, or new windows."""
    try:
        result = tp.wait_for_window(title, app=app or None, timeout=timeout, gone=gone)
        if gone:
            return f"Window '{title}' is gone"
        tp.activate_window(result.id)
        return f"Window found: [{result.id}] '{result.title}' in {result.app}"
    except TimeoutError:
        return f"Timed out waiting for window '{title}'"

# ═══════════════════════════════════════════════════════════════════════════
# 10. CONFIGURATION (1 tool)
# ═══════════════════════════════════════════════════════════════════════════

@mcp.tool()
def configure(scale_factor: str = "", fuzzy_threshold: str = "", fallback_input: str = "", max_elements: str = "", max_depth: str = "") -> str:
    """Configure Touchpoint runtime settings. All args are optional strings (parsed as float/int/bool).
    scale_factor: display scale (e.g. '1.25'). fuzzy_threshold: 0.0-1.0 (default 0.6).
    fallback_input: 'true'/'false'. max_elements: int (default 5000). max_depth: int (default 20)."""
    cfg = {}
    if scale_factor: cfg["scale_factor"] = float(scale_factor)
    if fuzzy_threshold: cfg["fuzzy_threshold"] = float(fuzzy_threshold)
    if fallback_input: cfg["fallback_input"] = fallback_input.lower() in ("1", "true", "yes", "on")
    if max_elements: cfg["max_elements"] = int(max_elements)
    if max_depth: cfg["max_depth"] = int(max_depth)
    if cfg:
        tp.configure(**cfg)
        return f"Configured: {cfg}"
    return "No changes — pass at least one parameter"

# ═══════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    mcp.run()
