#!/usr/bin/env python3
"""Generate mcp-tool-fallbacks.ts"""
import os

OUT = os.path.join(os.path.dirname(__file__), "mcp-tool-fallbacks.ts")

lines = []
lines.append('import type { XToolDef } from "../x-tool-registry"')
lines.append('')
lines.append('function fb(id: string, name: string, desc: string, params: Record<string, { type: string; description: string; required?: boolean }>, cat: string, server: string): XToolDef {')
lines.append('  return { id, name, description: desc, category: cat, parameters: params,')
lines.append('    execute: async () => ({ ok: true, data: { tool: id, message: "Connect to " + server + " MCP to use this tool" } }) }')
lines.append('}')
lines.append('')

# NUPHUS TOOLS
lines.append('// Nuphus MCP — Desktop automation + CDP Chrome (19 tools)')
lines.append('export const nuphusMcpTools: XToolDef[] = [')

nuphus = [
    ("nuphus_screenshot", "Nuphus: Screenshot", "Take screenshot of screen or window. Returns base64 PNG.", [("window_id", "string", "Optional window ID", False)]),
    ("nuphus_list_windows", "Nuphus: List Windows", "List all open windows with titles, app names, PIDs, positions.", []),
    ("nuphus_focus_window", "Nuphus: Focus Window", "Bring window to foreground. Required before typing/clicking.", [("window_id", "string", "Window ID", True)]),
    ("nuphus_click", "Nuphus: Click", "Click at screen coordinates. Supports left/right/middle.", [("x", "number", "Screen X", True), ("y", "number", "Screen Y", True), ("button", "string", "left/right/middle", False)]),
    ("nuphus_type", "Nuphus: Type Text", "Type text via keyboard. Focus a field FIRST.", [("text", "string", "Text to type", True)]),
    ("nuphus_hotkey", "Nuphus: Hotkey", "Press keyboard shortcut. Examples: ctrl+c, alt+tab.", [("keys", "string", "Key combo with +", True)]),
    ("nuphus_scroll", "Nuphus: Scroll", "Scroll at mouse position. Negative dy = down.", [("dy", "number", "Vertical (neg=down)", True), ("dx", "number", "Horizontal", False)]),
    ("nuphus_mouse_move", "Nuphus: Mouse Move", "Move mouse cursor to coordinates.", [("x", "number", "Screen X", True), ("y", "number", "Screen Y", True)]),
    ("nuphus_drag", "Nuphus: Drag", "Drag from (x1,y1) to (x2,y2).", [("x1", "number", "Start X", True), ("y1", "number", "Start Y", True), ("x2", "number", "End X", True), ("y2", "number", "End Y", True)]),
    ("nuphus_ocr", "Nuphus: OCR", "Read text from screen region using OCR.", [("region", "string", "x,y,w,h or full", False)]),
    ("nuphus_clipboard_get", "Nuphus: Clipboard Get", "Get clipboard content.", []),
    ("nuphus_clipboard_set", "Nuphus: Clipboard Set", "Set clipboard to text.", [("text", "string", "Text to copy", True)]),
    ("nuphus_browser_navigate", "Nuphus: Browser Navigate", "Navigate Chrome to URL via CDP.", [("url", "string", "URL", True)]),
    ("nuphus_browser_snapshot", "Nuphus: Browser Snapshot", "Get accessibility snapshot of page.", []),
    ("nuphus_browser_click", "Nuphus: Browser Click", "Click element on page.", [("selector", "string", "CSS selector or a11y ref", True)]),
    ("nuphus_browser_type", "Nuphus: Browser Type", "Type into browser input.", [("selector", "string", "CSS selector", True), ("text", "string", "Text to type", True)]),
    ("nuphus_browser_screenshot", "Nuphus: Browser Screenshot", "Screenshot browser page.", []),
    ("nuphus_browser_cookies", "Nuphus: Browser Cookies", "Get all browser cookies.", []),
    ("nuphus_browser_execute", "Nuphus: Browser Execute JS", "Execute JS in page context.", [("script", "string", "JS code", True)]),
]

for tid, tname, tdesc, tparams in nuphus:
    if not tparams:
        lines.append(f'  fb("{tid}", "{tname}", "{tdesc}", {{}}, "nuphus-desktop", "nuphus-desktop"),')
    else:
        param_parts = []
        for pn, pt, pd, pr in tparams:
            param_parts.append(f'{pn}: {{ type: "{pt}", description: "{pd}", required: {"true" if pr else "false"} }}')
        param_str = ", ".join(param_parts)
        lines.append(f'  fb("{tid}", "{tname}", "{tdesc}", {{ {param_str} }}, "nuphus-desktop", "nuphus-desktop"),')

lines.append(']')
lines.append('')

# TOUCHPOINT TOOLS
lines.append('// Touchpoint MCP — Accessibility-based desktop automation (56 tools)')
lines.append('export const touchpointMcpTools: XToolDef[] = [')

touchpoint = [
    # Discovery (8)
    ("tp_apps", "Touchpoint: Apps", "List all open apps with accessibility elements.", []),
    ("tp_windows", "Touchpoint: Windows", "List all windows with title, app, PID, position, size.", []),
    ("tp_elements", "Touchpoint: Elements", "Get UI elements from accessibility tree.", [("app", "string", "Scope to app", False), ("window_id", "string", "Scope to window", False), ("tree", "string", "true for recursive", False), ("max_depth", "string", "Max depth (default 10)", False), ("role", "string", "Filter by role", False)]),
    ("tp_find", "Touchpoint: Find", "Search elements by name - exact, contains, fuzzy.", [("query", "string", "Text to find", True), ("app", "string", "Scope to app", False), ("role", "string", "Filter by role", False)]),
    ("tp_snapshot", "Touchpoint: Snapshot", "Structured accessibility tree of a window.", [("app", "string", "Scope to app", False), ("window_id", "string", "Scope to window", False), ("max_depth", "string", "Max depth", False)]),
    ("tp_get_element", "Touchpoint: Get Element", "Get detailed info about element by ID.", [("element_id", "string", "Element ID", True)]),
    ("tp_element_at", "Touchpoint: Element At", "Get deepest element at screen coords (x,y).", [("x", "number", "Screen X", True), ("y", "number", "Screen Y", True)]),
    ("tp_diagnostics", "Touchpoint: Diagnostics", "Check accessibility backend, CDP, platform info.", []),
    # Window Management (8)
    ("tp_activate_window", "Touchpoint: Activate Window", "Bring window to foreground.", [("window_id", "string", "Window ID", True)]),
    ("tp_minimize_window", "Touchpoint: Minimize Window", "Minimize a window.", [("window_id", "string", "Window ID", True)]),
    ("tp_fullscreen_window", "Touchpoint: Fullscreen", "Enter or exit fullscreen.", [("window_id", "string", "Window ID", True), ("fullscreen", "string", "true/false", False)]),
    ("tp_close_window", "Touchpoint: Close Window", "Close a window.", [("window_id", "string", "Window ID", True)]),
    ("tp_move_window", "Touchpoint: Move Window", "Move window to position (x,y).", [("window_id", "string", "Window ID", True), ("x", "number", "Target X", True), ("y", "number", "Target Y", True)]),
    ("tp_resize_window", "Touchpoint: Resize Window", "Resize window to width x height.", [("window_id", "string", "Window ID", True), ("width", "number", "Width", True), ("height", "number", "Height", True)]),
    ("tp_find_window", "Touchpoint: Find Window", "Find window by title substring.", [("title", "string", "Title to search", True), ("app", "string", "Filter by app", False)]),
    ("tp_monitor_count", "Touchpoint: Monitor Count", "Get number of monitors.", []),
    # Click & Mouse (8)
    ("tp_click", "Touchpoint: Click", "Left-click element by ID.", [("element_id", "string", "Element ID", True)]),
    ("tp_double_click", "Touchpoint: Double Click", "Double-click element.", [("element_id", "string", "Element ID", True)]),
    ("tp_right_click", "Touchpoint: Right Click", "Right-click element.", [("element_id", "string", "Element ID", True)]),
    ("tp_click_at", "Touchpoint: Click At", "Click at exact screen coords.", [("x", "number", "Screen X", True), ("y", "number", "Screen Y", True), ("button", "string", "left/right", False)]),
    ("tp_double_click_at", "Touchpoint: Double Click At", "Double-click at coords.", [("x", "number", "Screen X", True), ("y", "number", "Screen Y", True)]),
    ("tp_right_click_at", "Touchpoint: Right Click At", "Right-click at coords.", [("x", "number", "Screen X", True), ("y", "number", "Screen Y", True)]),
    ("tp_mouse_move", "Touchpoint: Mouse Move", "Move mouse to coords.", [("x", "number", "Screen X", True), ("y", "number", "Screen Y", True)]),
    ("tp_drag", "Touchpoint: Drag", "Drag from (x1,y1) to (x2,y2).", [("x1", "number", "Start X", True), ("y1", "number", "Start Y", True), ("x2", "number", "End X", True), ("y2", "number", "End Y", True), ("button", "string", "left/right", False)]),
    # Text Input (4)
    ("tp_type_text", "Touchpoint: Type Text", "Type text via keyboard.", [("text", "string", "Text to type", True)]),
    ("tp_press_key", "Touchpoint: Press Key", "Press key(s). Examples: enter, tab, escape, f5.", [("keys", "string", "Key name(s)", True), ("repeat", "string", "Repeat count", False)]),
    ("tp_hotkey", "Touchpoint: Hotkey", "Press hotkey combo. Examples: ctrl+s, alt+tab.", [("keys", "string", "Key combo with +", True)]),
    ("tp_scroll", "Touchpoint: Scroll", "Scroll at mouse position.", [("dy", "number", "Vertical (neg=down)", False), ("dx", "number", "Horizontal", False)]),
    # Value Setting (6)
    ("tp_set_value", "Touchpoint: Set Value", "Set text value of editable element.", [("element_id", "string", "Element ID", True), ("value", "string", "Text value", True), ("replace", "string", "true to replace all", False)]),
    ("tp_set_numeric_value", "Touchpoint: Set Numeric", "Set numeric value of slider/spinbox.", [("element_id", "string", "Element ID", True), ("value", "number", "Numeric value", True)]),
    ("tp_focus", "Touchpoint: Focus", "Move keyboard focus to element.", [("element_id", "string", "Element ID", True)]),
    ("tp_select_text", "Touchpoint: Select Text", "Select substring in element text.", [("element_id", "string", "Element ID", True), ("text", "string", "Text to select", True), ("occurrence", "string", "Which match (1-based)", False)]),
    ("tp_select_text_range", "Touchpoint: Select Range", "Select char range [start,end) in element.", [("element_id", "string", "Element ID", True), ("start", "number", "Start offset", True), ("end", "number", "End offset", True)]),
    ("tp_action", "Touchpoint: Raw Action", "Perform accessibility action by name.", [("element_id", "string", "Element ID", True), ("action_name", "string", "Action name", True)]),
    # Text Reading (1)
    ("tp_read_text", "Touchpoint: Read Text", "Read text from element. Faster than OCR.", [("element_id", "string", "Element ID", True)]),
    # Screenshot (2)
    ("tp_screenshot", "Touchpoint: Screenshot", "Take screenshot. Crop to app if specified.", [("app", "string", "App to crop to", False)]),
    ("tp_screenshot_window", "Touchpoint: Screenshot Window", "Screenshot specific window even if minimized.", [("window_id", "string", "Window ID", True)]),
    # Chrome Tabs (6)
    ("tp_chrome_profiles", "Touchpoint: Chrome Profiles", "List Chrome profiles and logged-in accounts.", []),
    ("tp_open_chrome_profile", "Touchpoint: Open Chrome Profile", "Open Chrome with specific profile.", [("profile_name", "string", "Profile name", False), ("url", "string", "URL to open", False)]),
    ("tp_new_tab", "Touchpoint: New Tab", "Open new tab in Chrome silently.", [("url", "string", "URL", False)]),
    ("tp_list_tabs", "Touchpoint: List Tabs", "List all Chrome tabs.", []),
    ("tp_switch_tab", "Touchpoint: Switch Tab", "Switch to Chrome tab by title or index.", [("tab_identifier", "string", "Tab title or number", True)]),
    ("tp_close_tab", "Touchpoint: Close Tab", "Close Chrome tab.", [("tab_identifier", "string", "Tab to close", False)]),
    # Waiting (3)
    ("tp_wait_for", "Touchpoint: Wait For", "Wait for element to appear/disappear.", [("element", "string", "Element name", True), ("gone", "string", "true to wait for disappear", False), ("timeout", "string", "Timeout seconds (default 10)", False)]),
    ("tp_wait_for_app", "Touchpoint: Wait For App", "Wait for app to appear/disappear.", [("app", "string", "App name", True), ("timeout", "string", "Timeout seconds", False), ("gone", "string", "true to wait for disappear", False)]),
    ("tp_wait_for_window", "Touchpoint: Wait For Window", "Wait for window by title.", [("title", "string", "Window title", True), ("app", "string", "Filter by app", False), ("timeout", "string", "Timeout seconds", False), ("gone", "string", "true to wait for disappear", False)]),
    # Config (1)
    ("tp_configure", "Touchpoint: Configure", "Configure Touchpoint runtime settings.", [("scale_factor", "string", "Display scale", False), ("fuzzy_threshold", "string", "0.0-1.0", False), ("max_elements", "string", "Max elements", False)]),
]

for tid, tname, tdesc, tparams in touchpoint:
    if not tparams:
        lines.append(f'  fb("{tid}", "{tname}", "{tdesc}", {{}}, "touchpoint", "touchpoint-mcp"),')
    else:
        param_parts = []
        for pn, pt, pd, pr in tparams:
            param_parts.append(f'{pn}: {{ type: "{pt}", description: "{pd}", required: {"true" if pr else "false"} }}')
        param_str = ", ".join(param_parts)
        lines.append(f'  fb("{tid}", "{tname}", "{tdesc}", {{ {param_str} }}, "touchpoint", "touchpoint-mcp"),')

lines.append(']')
lines.append('')

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print(f'Written {len(touchpoint) + len(nuphus)} tool definitions to {OUT}')
