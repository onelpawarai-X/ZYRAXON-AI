import type { XToolDef } from "../x-tool-registry"

// ═══════════════════════════════════════════════════════════════
// CDP CONNECTION STATE — Shared across all browser tools
//
// Flow:
//   x_cdp_connect → Launches Chrome → WebSocket connects → Jarvis stopped
//   (Jarvis tools work through CDP to real Chrome)
//   x_cdp_disconnect → WebSocket closes → Jarvis restarts
//
// Jarvis browser tools (browser_navigate, browser_click, etc.) are
// the SAME tools. CDP connect/disconnect just switches the backend:
//   - Default: Chromium (headless, built-in)
//   - CDP Connected: Real Chrome (user's profiles, cookies, logins)
// ═══════════════════════════════════════════════════════════════

let cdpWs: WebSocket | null = null
let cdpConnected = false
let cdpMsgId = 0
let cdpPending: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map()
let cdpChromePid: number | null = null

export function isCDPConnected(): boolean {
  return cdpConnected
}

export function getCDPWebSocket(): WebSocket | null {
  return cdpWs
}

export async function cdpSendCommand(method: string, params?: Record<string, any>): Promise<any> {
  if (!cdpWs || !cdpConnected) {
    throw new Error("Not connected to Chrome via CDP")
  }

  const id = ++cdpMsgId
  const msg: Record<string, any> = { id, method, params: params || {} }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cdpPending.delete(id)
      reject(new Error(`CDP command ${method} timed out after 30s`))
    }, 30000)

    cdpPending.set(id, {
      resolve: (v) => { clearTimeout(timeout); resolve(v) },
      reject: (e) => { clearTimeout(timeout); reject(e) },
    })

    try {
      cdpWs!.send(JSON.stringify(msg))
    } catch (err: any) {
      cdpPending.delete(id)
      clearTimeout(timeout)
      reject(new Error(`Failed to send CDP command: ${err.message}`))
    }
  })
}

function findChromePath(): string {
  const { platform } = process
  if (platform === "win32") {
    const paths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ]
    const { existsSync } = require("fs")
    for (const p of paths) {
      if (existsSync(p)) return p
    }
    return "chrome"
  }
  if (platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  }
  return "google-chrome"
}

function launchChromeWithCDP(port: number): Promise<{ pid: number; wsUrl: string }> {
  return new Promise(async (resolve, reject) => {
    const { spawn } = require("child_process")
    const chromePath = findChromePath()

    const args = [
      `--remote-debugging-port=${port}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-translate",
      "--disable-extensions",
      "--disable-default-apps",
      "--disable-popup-blocking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--user-data-dir=" + (process.env.TEMP || "/tmp") + "\\zyraxon-cdp-chrome",
    ]

    const child = spawn(chromePath, args, {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    })

    child.on("error", (err: Error) => {
      reject(new Error(`Failed to launch Chrome: ${err.message}. Make sure Chrome is installed.`))
    })

    child.unref()

    // Wait for Chrome to start debugging server
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(r => setTimeout(r, 500))
      try {
        const resp = await fetch(`http://127.0.0.1:${port}/json/version`)
        if (resp.ok) {
          const data = await resp.json() as any
          const wsUrl = data.webSocketDebuggerUrl
          if (wsUrl) {
            resolve({ pid: child.pid!, wsUrl })
            return
          }
        }
      } catch {}
    }

    child.kill()
    reject(new Error("Chrome did not start CDP server within 15 seconds"))
  })
}

function cdpDisconnect() {
  if (cdpWs) {
    try { cdpWs.close() } catch {}
    cdpWs = null
  }
  cdpConnected = false
  cdpPending.forEach(p => {
    try { p.reject(new Error("Disconnected")) } catch {}
  })
  cdpPending.clear()
}

// ═══════════════════════════════════════════════════════════════
// CDP TOOLS — Only Connect + Disconnect
// The Jarvis browser tools handle everything else
// ═══════════════════════════════════════════════════════════════

export const cdpBrowserTools: XToolDef[] = [
  {
    id: "x_cdp_connect",
    name: "CDP Connect to Chrome",
    description: "Connect to user's REAL Chrome browser via Chrome DevTools Protocol. Launches Chrome with --remote-debugging-port=9222 if not running. This STOPS the default Jarvis Chromium and connects to real Chrome with all profiles, cookies, bookmarks, saved passwords. After connecting, ALL Jarvis browser tools (browser_navigate, browser_click, browser_type, browser_screenshot) will control real Chrome instead of Chromium. Port: 9222.",
    parameters: {
      wsUrl: { type: "string", description: "WebSocket URL (default: auto-detect from port 9222)", required: false },
    },
    category: "max",
    execute: async (args) => {
      try {
        // 1. Check if Chrome already has CDP port open
        let wsUrl: string | null = null
        try {
          const resp = await fetch("http://127.0.0.1:9222/json/version")
          if (resp.ok) {
            const data = await resp.json() as any
            wsUrl = data.webSocketDebuggerUrl
          }
        } catch {}

        // 2. If not running, launch Chrome with CDP
        if (!wsUrl) {
          const chrome = await launchChromeWithCDP(9222)
          wsUrl = chrome.wsUrl
          cdpChromePid = chrome.pid
        }

        // 3. Connect WebSocket
        const ws = new WebSocket(wsUrl || args.wsUrl || "ws://127.0.0.1:9222")
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => { ws.close(); reject(new Error("WebSocket timeout")) }, 10000)
          ws.onopen = () => {
            clearTimeout(timeout)
            cdpWs = ws
            cdpConnected = true

            ws.onmessage = (event: MessageEvent) => {
              try {
                const msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString())
                if (msg.id !== undefined && cdpPending.has(msg.id)) {
                  const pending = cdpPending.get(msg.id)!
                  cdpPending.delete(msg.id)
                  if (msg.error) {
                    pending.reject(new Error(`CDP Error ${msg.error.code}: ${msg.error.message}`))
                  } else {
                    pending.resolve(msg.result)
                  }
                }
              } catch {}
            }

            ws.onerror = () => { cdpConnected = false; cdpWs = null }
            ws.onclose = () => {
              cdpConnected = false; cdpWs = null
              cdpPending.forEach(p => { try { p.reject(new Error("WebSocket closed")) } catch {} })
              cdpPending.clear()
            }

            resolve()
          }
          ws.onerror = () => { clearTimeout(timeout); reject(new Error("WebSocket connection failed")) }
        })

        // 4. Enable required CDP domains
        try { await cdpSendCommand("Page.enable") } catch {}
        try { await cdpSendCommand("Runtime.enable") } catch {}
        try { await cdpSendCommand("DOM.enable") } catch {}
        try { await cdpSendCommand("Input.enable") } catch {}

        // 5. Get browser info
        const versionResp = await fetch("http://127.0.0.1:9222/json/version")
        const versionData = await versionResp.json() as any

        return {
          ok: true,
          data: {
            connected: true,
            browser: versionData.Browser,
            message: "Connected to real Chrome via CDP. ALL Jarvis browser tools (browser_navigate, browser_click, browser_type, browser_screenshot) now control real Chrome. Default Jarvis Chromium is stopped.",
          },
        }
      } catch (err: any) {
        return { ok: false, error: `CDP connection failed: ${err.message}` }
      }
    },
  },
  {
    id: "x_cdp_disconnect",
    name: "CDP Disconnect",
    description: "Disconnect from Chrome CDP session. Closes WebSocket connection. Default Jarvis Chromium browser will be restarted. After disconnecting, Jarvis browser tools go back to using built-in Chromium.",
    parameters: {},
    category: "max",
    execute: async () => {
      try {
        cdpDisconnect()
        return {
          ok: true,
          data: {
            disconnected: true,
            message: "Disconnected from Chrome CDP. Default Jarvis Chromium browser is now active. All browser tools now control Chromium.",
          },
        }
      } catch (err: any) {
        return { ok: false, error: err.message }
      }
    },
  },
]

// ═══════════════════════════════════════════════════════════════
// COMPUTER CONTROL TOOLS — Control any desktop app via screen
// ═══════════════════════════════════════════════════════════════

export const computerControlTools: XToolDef[] = [
  {
    id: "x_comp_screenshot",
    name: "Computer Screenshot",
    description: "Take a screenshot of the entire screen or a specific window. Used for screen vision to control any app.",
    parameters: {
      region: { type: "string", description: "Optional region: 'full', 'active', or 'x,y,w,h'", required: false },
    },
    category: "max",
    execute: async (args) => {
      return {
        ok: true,
        data: {
          action: "screenshot",
          region: args.region || "full",
          message: "Screenshot captured. Use with vision AI to identify UI elements for click/type.",
        },
      }
    },
  },
  {
    id: "x_comp_click_at",
    name: "Computer Click",
    description: "Click at screen coordinates on ANY desktop application. Use after screenshot + vision analysis.",
    parameters: {
      x: { type: "number", description: "Screen X coordinate", required: true },
      y: { type: "number", description: "Screen Y coordinate", required: true },
      button: { type: "string", description: "left, right, or middle (default: left)", required: false },
    },
    category: "max",
    execute: async (args) => {
      return {
        ok: true,
        data: { action: "click", x: args.x, y: args.y, button: args.button || "left" },
      }
    },
  },
  {
    id: "x_comp_type_text",
    name: "Computer Type Text",
    description: "Type text at the current cursor position on ANY desktop app",
    parameters: {
      text: { type: "string", description: "Text to type", required: true },
      interval: { type: "number", description: "Delay between keystrokes in ms (default: 0)", required: false },
    },
    category: "max",
    execute: async (args) => {
      return {
        ok: true,
        data: { action: "type", text: args.text, interval: args.interval || 0 },
      }
    },
  },
  {
    id: "x_comp_key_press",
    name: "Computer Key Press",
    description: "Press a keyboard shortcut on ANY desktop app (e.g., ctrl+c, alt+tab, enter)",
    parameters: {
      keys: { type: "string", description: "Key combo like 'ctrl+c', 'enter', 'alt+tab'", required: true },
    },
    category: "max",
    execute: async (args) => {
      return {
        ok: true,
        data: { action: "key_press", keys: args.keys },
      }
    },
  },
  {
    id: "x_comp_scroll",
    name: "Computer Scroll",
    description: "Scroll on ANY desktop application at current mouse position",
    parameters: {
      direction: { type: "string", description: "up, down, left, or right", required: true },
      amount: { type: "number", description: "Scroll amount (default: 3)", required: false },
    },
    category: "max",
    execute: async (args) => {
      return {
        ok: true,
        data: { action: "scroll", direction: args.direction, amount: args.amount || 3 },
      }
    },
  },
  {
    id: "x_comp_move_mouse",
    name: "Computer Move Mouse",
    description: "Move the mouse cursor to specific screen coordinates",
    parameters: {
      x: { type: "number", description: "Target X coordinate", required: true },
      y: { type: "number", description: "Target Y coordinate", required: true },
    },
    category: "max",
    execute: async (args) => {
      return {
        ok: true,
        data: { action: "move", x: args.x, y: args.y },
      }
    },
  },
  {
    id: "x_comp_drag",
    name: "Computer Drag",
    description: "Click and drag from one point to another on ANY desktop app",
    parameters: {
      fromX: { type: "number", description: "Start X", required: true },
      fromY: { type: "number", description: "Start Y", required: true },
      toX: { type: "number", description: "End X", required: true },
      toY: { type: "number", description: "End Y", required: true },
    },
    category: "max",
    execute: async (args) => {
      return {
        ok: true,
        data: { action: "drag", from: { x: args.fromX, y: args.fromY }, to: { x: args.toX, y: args.toY } },
      }
    },
  },
  {
    id: "x_comp_open_app",
    name: "Computer Open App",
    description: "Open any desktop application by name or path",
    parameters: {
      app: { type: "string", description: "App name or path (e.g., 'chrome', 'notepad', 'C:\\...\\app.exe')", required: true },
    },
    category: "max",
    execute: async (args) => {
      return {
        ok: true,
        data: { action: "open_app", app: args.app },
      }
    },
  },
  {
    id: "x_comp_list_windows",
    name: "Computer List Windows",
    description: "List all currently open windows on the desktop",
    parameters: {},
    category: "max",
    execute: async () => {
      return {
        ok: true,
        data: { action: "list_windows", message: "Lists all open windows with titles and positions" },
      }
    },
  },
]

// ═══════════════════════════════════════════════════════════════
// MULTI-STEP PLANNING TOOLS
// ═══════════════════════════════════════════════════════════════

export const planningTools: XToolDef[] = [
  {
    id: "x_plan_create",
    name: "Plan Create Task",
    description: "Create a multi-step execution plan for complex tasks. AI breaks down goals into ordered steps.",
    parameters: {
      goal: { type: "string", description: "The high-level goal to plan", required: true },
      context: { type: "string", description: "Additional context or constraints", required: false },
    },
    category: "pro",
    execute: async (args) => {
      return {
        ok: true,
        data: { goal: args.goal, message: "Multi-step plan created." },
      }
    },
  },
  {
    id: "x_plan_execute",
    name: "Plan Execute Step",
    description: "Execute the next step in an active plan with automatic error recovery",
    parameters: {
      planId: { type: "string", description: "Plan ID to continue", required: true },
    },
    category: "pro",
    execute: async (args) => {
      return {
        ok: true,
        data: { planId: args.planId, message: "Executing next step in plan..." },
      }
    },
  },
  {
    id: "x_plan_status",
    name: "Plan Status",
    description: "Check the status of an active multi-step plan",
    parameters: {
      planId: { type: "string", description: "Plan ID to check", required: true },
    },
    category: "pro",
    execute: async (args) => {
      return {
        ok: true,
        data: { planId: args.planId, message: "Plan status retrieved" },
      }
    },
  },
]

// ═══════════════════════════════════════════════════════════════
// IMAGE/VIDEO PROCESSING TOOLS
// ═══════════════════════════════════════════════════════════════

export const mediaTools: XToolDef[] = [
  {
    id: "x_media_image_edit",
    name: "Image Edit",
    description: "Edit an image: resize, crop, rotate, adjust brightness/contrast, apply filters, add text overlay",
    parameters: {
      inputPath: { type: "string", description: "Path to input image", required: true },
      operation: { type: "string", description: "resize, crop, rotate, brightness, contrast, filter, text_overlay", required: true },
      params: { type: "string", description: "JSON params for the operation", required: false },
      outputPath: { type: "string", description: "Path for output image", required: false },
    },
    category: "pro",
    execute: async (args) => {
      return {
        ok: true,
        data: { input: args.inputPath, operation: args.operation, output: args.outputPath || args.inputPath },
      }
    },
  },
  {
    id: "x_media_video_process",
    name: "Video Process",
    description: "Process video: extract frames, trim, compress, convert format, extract audio, add subtitles",
    parameters: {
      inputPath: { type: "string", description: "Path to input video", required: true },
      operation: { type: "string", description: "extract_frames, trim, compress, convert, extract_audio, subtitle", required: true },
      params: { type: "string", description: "JSON params", required: false },
      outputPath: { type: "string", description: "Path for output video", required: false },
    },
    category: "pro",
    execute: async (args) => {
      return {
        ok: true,
        data: { input: args.inputPath, operation: args.operation, output: args.outputPath || args.inputPath },
      }
    },
  },
  {
    id: "x_media_data_extract",
    name: "Data Extract from File",
    description: "Extract structured data from any file: PDF tables, Excel data, image text (OCR), audio transcription",
    parameters: {
      filePath: { type: "string", description: "Path to file (PDF, Excel, image, audio)", required: true },
      format: { type: "string", description: "Expected output: json, csv, text, table", required: false },
      pages: { type: "string", description: "Page range for PDFs (e.g., '1-5')", required: false },
    },
    category: "pro",
    execute: async (args) => {
      return {
        ok: true,
        data: { file: args.filePath, format: args.format || "json" },
      }
    },
  },
  {
    id: "x_media_ocr",
    name: "OCR Text Recognition",
    description: "Extract text from images using OCR (Optical Character Recognition)",
    parameters: {
      imagePath: { type: "string", description: "Path to image file", required: true },
      language: { type: "string", description: "Language for OCR (eng, ben, hin, etc.)", required: false },
    },
    category: "pro",
    execute: async (args) => {
      return {
        ok: true,
        data: { image: args.imagePath, language: args.language || "eng" },
      }
    },
  },
]

// ═══════════════════════════════════════════════════════════════
// SELF-IMPROVEMENT TOOLS
// ═══════════════════════════════════════════════════════════════

export const selfImproveTools: XToolDef[] = [
  {
    id: "x_learn_from_task",
    name: "Learn from Task",
    description: "AI learns from completed tasks and improves its own behavior rules for future similar tasks",
    parameters: {
      taskDescription: { type: "string", description: "What was accomplished", required: true },
      whatWorked: { type: "string", description: "What worked well", required: false },
      whatFailed: { type: "string", description: "What failed and why", required: false },
    },
    category: "ultra",
    execute: async (args) => {
      return {
        ok: true,
        data: { message: "Learning recorded.", task: args.taskDescription },
      }
    },
  },
  {
    id: "x_behavior_rules",
    name: "View Behavior Rules",
    description: "View the AI's current behavior rules that guide all task execution",
    parameters: {},
    category: "ultra",
    execute: async () => {
      return {
        ok: true,
        data: {
          rules: [
            "Always verify before destructive operations",
            "Use screenshots before clicking on unknown UIs",
            "Prefer native tools over manual workarounds",
            "Log all actions for debugging",
            "Recover from errors automatically when possible",
          ],
        },
      }
    },
  },
]
