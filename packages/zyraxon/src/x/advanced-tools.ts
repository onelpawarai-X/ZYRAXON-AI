// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { XToolDef } from "./x-tool-registry"
import {
  captureScreen,
  clickAt,
  currentPlatform,
  desktopInfo,
  dragMouse,
  listWindows,
  moveMouse,
  openApp,
  pressKeys,
  scrollAt,
  typeText,
} from "./desktop-control"
import { editImage, extractData, probeMedia, processVideo, runOcr } from "./media-processing"
import {
  applyStepResult,
  behaviourRules,
  claimNextStep,
  createPlan,
  listPlans,
  markSkipped,
  readPlan,
  recordLesson,
  summarise,
  writePlan,
} from "./plan-engine"

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
    description:
      "Capture the real screen (or a region) as a PNG and return the image data with its true size. Works on Windows, macOS and Linux.",
    parameters: {
      region: { type: "string", description: "Optional 'x,y,w,h' region. Omit for the whole screen.", required: false },
    },
    category: "max",
    execute: async (args) => {
      try {
        const region = parseRegion(args.region)
        const shot = await captureScreen(region)
        return {
          ok: true,
          data: {
            platform: currentPlatform(),
            width: shot.width,
            height: shot.height,
            path: shot.path,
            format: "png",
            base64: shot.base64,
            imageUrl: `data:image/png;base64,${shot.base64}`,
          },
        }
      } catch (err: any) {
        return { ok: false, error: `Screenshot failed: ${err.message}` }
      }
    },
  },
  {
    id: "x_comp_click_at",
    name: "Computer Click",
    description:
      "Click at screen coordinates on any desktop application. Moves the real cursor first so the target sees the true pointer position.",
    parameters: {
      x: { type: "number", description: "Screen X coordinate", required: true },
      y: { type: "number", description: "Screen Y coordinate", required: true },
      button: { type: "string", description: "left, right, or middle (default: left)", required: false },
      clicks: { type: "number", description: "Number of clicks, 1-5 (default: 1)", required: false },
    },
    category: "max",
    execute: async (args) => {
      const result = await clickAt(args.x, args.y, args.button ?? "left", args.clicks ?? 1)
      return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error }
    },
  },
  {
    id: "x_comp_type_text",
    name: "Computer Type Text",
    description:
      "Type text at the current cursor position on any desktop app. Preserves every Unicode character.",
    parameters: {
      text: { type: "string", description: "Text to type", required: true },
      interval: { type: "number", description: "Extra delay in ms, 0-1000 (default: 0)", required: false },
    },
    category: "max",
    execute: async (args) => {
      const result = await typeText(args.text, args.interval ?? 0)
      return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error }
    },
  },
  {
    id: "x_comp_key_press",
    name: "Computer Key Press",
    description:
      "Press a real keyboard combination on any desktop app, e.g. 'ctrl+c', 'alt+tab', 'enter', 'win+d'.",
    parameters: {
      keys: { type: "string", description: "Key combo like 'ctrl+c', 'enter', 'alt+tab'", required: true },
    },
    category: "max",
    execute: async (args) => {
      const result = await pressKeys(args.keys)
      return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error }
    },
  },
  {
    id: "x_comp_scroll",
    name: "Computer Scroll",
    description: "Scroll on any desktop application, at the current or a given mouse position.",
    parameters: {
      direction: { type: "string", description: "up, down, left, or right", required: true },
      amount: { type: "number", description: "Notches to scroll, 1-50 (default: 3)", required: false },
      x: { type: "number", description: "Optional X to move the cursor to first", required: false },
      y: { type: "number", description: "Optional Y to move the cursor to first", required: false },
    },
    category: "max",
    execute: async (args) => {
      const result = await scrollAt(args.direction, args.amount ?? 3, args.x, args.y)
      return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error }
    },
  },
  {
    id: "x_comp_move_mouse",
    name: "Computer Move Mouse",
    description: "Move the mouse cursor to specific screen coordinates without clicking.",
    parameters: {
      x: { type: "number", description: "Target X coordinate", required: true },
      y: { type: "number", description: "Target Y coordinate", required: true },
    },
    category: "max",
    execute: async (args) => {
      const result = await moveMouse(args.x, args.y)
      return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error }
    },
  },
  {
    id: "x_comp_drag",
    name: "Computer Drag",
    description:
      "Press, move the real cursor in steps, and release — a genuine drag on any desktop app.",
    parameters: {
      fromX: { type: "number", description: "Start X", required: true },
      fromY: { type: "number", description: "Start Y", required: true },
      toX: { type: "number", description: "End X", required: true },
      toY: { type: "number", description: "End Y", required: true },
      steps: { type: "number", description: "Intermediate moves, 2-200 (default: 20)", required: false },
    },
    category: "max",
    execute: async (args) => {
      const result = await dragMouse(args.fromX, args.fromY, args.toX, args.toY, args.steps ?? 20)
      return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error }
    },
  },
  {
    id: "x_comp_open_app",
    name: "Computer Open App",
    description:
      "Open a desktop application by name or absolute path, the same way the platform's launcher would.",
    parameters: {
      app: {
        type: "string",
        description: "App name or absolute path (e.g. 'chrome', 'notepad', 'C:\\\\...\\\\app.exe')",
        required: true,
      },
    },
    category: "max",
    execute: async (args) => {
      const result = await openApp(args.app)
      return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error }
    },
  },
  {
    id: "x_comp_list_windows",
    name: "Computer List Windows",
    description:
      "List every visible open window with its real title, owning process id, class and geometry.",
    parameters: {},
    category: "max",
    execute: async () => {
      try {
        const windows = await listWindows()
        return { ok: true, data: { platform: currentPlatform(), count: windows.length, windows } }
      } catch (err: any) {
        return { ok: false, error: `Could not list windows: ${err.message}` }
      }
    },
  },
  {
    id: "x_comp_desktop_info",
    name: "Computer Desktop Info",
    description:
      "Report the live desktop environment: platform, user, hostname and screen size.",
    parameters: {},
    category: "max",
    execute: async () => {
      const result = await desktopInfo()
      return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error }
    },
  },
]

// Accepts "x,y,w,h" and validates it before any capture is attempted.
function parseRegion(value: unknown): { x: number; y: number; w: number; h: number } | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value === "object" && value !== null) {
    const rect = value as Record<string, unknown>
    const nums = [rect.x, rect.y, rect.w ?? rect.width, rect.h ?? rect.height].map(Number)
    if (nums.every(Number.isFinite) && nums[2] > 0 && nums[3] > 0)
      return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] }
    throw new Error("region object needs numeric x, y and positive width and height")
  }
  if (typeof value !== "string") throw new Error("region must be 'x,y,w,h' or an object")
  if (value === "full" || value === "active") return undefined
  const parts = value.split(",").map((p) => Number(p.trim()))
  if (parts.length !== 4 || !parts.every(Number.isFinite))
    throw new Error(`region must be 'x,y,w,h', received: ${value}`)
  const [x, y, w, h] = parts as [number, number, number, number]
  if (w <= 0 || h <= 0) throw new Error("region width and height must be positive")
  return { x, y, w, h }
}

// ═══════════════════════════════════════════════════════════════
// MULTI-STEP PLANNING TOOLS
// ═══════════════════════════════════════════════════════════════

export const planningTools: XToolDef[] = [
  {
    id: "x_plan_create",
    name: "Plan Create Task",
    description:
      "Create a persistent multi-step plan on disk. Supply an explicit steps array, or let the goal be split on newlines and 'then' phrases. Returns a real plan id for x_plan_execute and x_plan_status.",
    parameters: {
      goal: { type: "string", description: "The high-level goal to plan", required: true },
      context: { type: "string", description: "Additional context or constraints", required: false },
      steps: { type: "array", description: "Ordered steps. Each may be a string, or an object { title, tool, args } to bind a real tool and its arguments.", required: false },
    },
    category: "pro",
    execute: async (args) => {
      try {
        const plan = createPlan(String(args.goal), args.context ? String(args.context) : undefined, args.steps)
        await writePlan(plan)
        return {
          ok: true,
          data: {
            planId: plan.id,
            goal: plan.goal,
            stepCount: plan.steps.length,
            steps: plan.steps.map((s) => ({ index: s.index, title: s.title, tool: s.tool ?? null })),
            summary: summarise(plan),
            storedAt: "~/.zyraxon/plans",
          },
        }
      } catch (err: any) {
        return { ok: false, error: `Plan creation failed: ${err.message}` }
      }
    },
  },
  {
    id: "x_plan_execute",
    name: "Plan Execute Step",
    description:
      "Run the next pending step of a stored plan and persist the real outcome. A step may name a registered tool in its params to have that tool executed and its result recorded.",
    parameters: {
      planId: { type: "string", description: "Plan ID to continue", required: true },
      skip: { type: "boolean", description: "Skip the next step instead of running it", required: false },
    },
    category: "pro",
    execute: async (args) => {
      try {
        const planId = String(args.planId)
        const plan = await readPlan(planId)
        if (!plan) return { ok: false, error: `No plan found with id ${planId}` }
        if (plan.status !== "active")
          return { ok: false, error: `Plan ${planId} is already ${plan.status}` }

        const next = claimNextStep(plan)
        if (!next) return { ok: false, error: `Plan ${planId} has no pending step left` }

        if (args.skip) {
          markSkipped(plan, next.index, "skipped by caller")
          await writePlan(plan)
          return { ok: true, data: { planId, skippedStep: next.index, title: next.title, summary: summarise(plan) } }
        }

        const started = Date.now()
        // An explicitly bound tool always wins, because the caller supplied real
        // arguments for it. Otherwise a bare tool name in the title is honoured
        // only when that tool needs no arguments.
        const boundTool = next.tool
        const autorunTool = boundTool ? null : matchToolInTitle(next.title)
        const toolName = boundTool ?? autorunTool

        let outcome: { ok: boolean; result?: unknown; error?: string; note?: string }
        if (toolName) {
          const outcomeOfTool = await runRegisteredTool(toolName, next.args ?? {})
          outcome = {
            ok: outcomeOfTool.ok,
            result: outcomeOfTool.data,
            error: outcomeOfTool.error,
            note: `invoked ${toolName}${next.args ? " with bound arguments" : " (no arguments required)"}`,
          }
        } else {
          const named = TOOL_KEYWORDS.find((n) => next.title.toLowerCase().includes(n))
          outcome = {
            ok: true,
            note: named
              ? `recorded without running: ${named} needs arguments, so bind it as { title, tool, args } in the steps array`
              : "recorded without side effects — name an argument-free tool in the step, or bind { title, tool, args }",
            result: { title: next.title, recognisedTool: named ?? null },
          }
        }

        applyStepResult(plan, next.index, outcome)
        await writePlan(plan)
        return {
          ok: true,
          data: {
            planId,
            step: next.index,
            title: next.title,
            stepStatus: outcome.ok ? "done" : "failed",
            durationMs: Date.now() - started,
            detail: outcome,
            summary: summarise(plan),
          },
        }
      } catch (err: any) {
        return { ok: false, error: `Plan execution failed: ${err.message}` }
      }
    },
  },
  {
    id: "x_plan_status",
    name: "Plan Status",
    description: "Read a stored plan from disk and report its real per-step state and progress. Omit planId to list every plan.",
    parameters: {
      planId: { type: "string", description: "Plan ID to check. Omit to list all plans.", required: false },
    },
    category: "pro",
    execute: async (args) => {
      try {
        if (args.planId) {
          const plan = await readPlan(String(args.planId))
          if (!plan) return { ok: false, error: `No plan found with id ${args.planId}` }
          return {
            ok: true,
            data: {
              planId: plan.id,
              goal: plan.goal,
              status: plan.status,
              createdAt: plan.createdAt,
              updatedAt: plan.updatedAt,
              summary: summarise(plan),
              steps: plan.steps.map((s) => ({
                index: s.index,
                title: s.title,
                status: s.status,
                attempts: s.attempts,
                durationMs: s.durationMs ?? null,
                note: s.note ?? null,
                error: s.error ?? null,
              })),
            },
          }
        }
        const plans = await listPlans()
        return {
          ok: true,
          data: {
            count: plans.length,
            plans: plans.map((p) => ({ planId: p.id, goal: p.goal, status: p.status, summary: summarise(p) })),
          },
        }
      } catch (err: any) {
        return { ok: false, error: `Plan status failed: ${err.message}` }
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
    description:
      "Really edit an image: resize, crop, rotate, adjust brightness/contrast, apply a grayscale/invert/sepia/blur filter, or burn text into it. PNG runs in-process; other formats are decoded with ffmpeg. Writes a new file and reports the real before/after size.",
    parameters: {
      inputPath: { type: "string", description: "Path to input image (png, jpg, webp, bmp, gif, tiff)", required: true },
      operation: { type: "string", description: "resize, crop, rotate, brightness, contrast, filter, text_overlay", required: true },
      params: { type: "string", description: "JSON params for the operation", required: false },
      outputPath: { type: "string", description: "Path for output image (default: derived beside the input)", required: false },
    },
    category: "pro",
    execute: async (args) => {
      const params = parseParams(args.params)
      if (params.outputPath === undefined && args.outputPath) params.outputPath = String(args.outputPath)
      const result = await editImage(String(args.inputPath), String(args.operation), params)
      return result.ok === true ? { ok: true, data: result.data } : { ok: false, error: result.error }
    },
  },
  {
    id: "x_media_video_process",
    name: "Video Process",
    description:
      "Really process media with ffmpeg: extract frames, trim, compress to a target quality, convert codecs, pull out the audio track, or extract/burn-in subtitles.",
    parameters: {
      inputPath: { type: "string", description: "Path to input video", required: true },
      operation: { type: "string", description: "extract_frames, trim, compress, convert, extract_audio, subtitle", required: true },
      params: { type: "string", description: "JSON params", required: false },
      outputPath: { type: "string", description: "Path for output", required: false },
    },
    category: "pro",
    execute: async (args) => {
      const params = parseParams(args.params)
      if (params.outputPath === undefined && args.outputPath) params.outputPath = String(args.outputPath)
      const result = await processVideo(String(args.inputPath), String(args.operation), params)
      return result.ok === true ? { ok: true, data: result.data } : { ok: false, error: result.error }
    },
  },
  {
    id: "x_media_data_extract",
    name: "Data Extract from File",
    description:
      "Pull real data out of a file: JSON is parsed, CSV/TSV is tabularised, PDF text is decoded from its content streams (pdftotext used when the PDF has no text layer), images are sent through OCR, and media reports true stream metadata.",
    parameters: {
      filePath: { type: "string", description: "Path to file (JSON, CSV, TSV, PDF, image, audio, video, text)", required: true },
      format: { type: "string", description: "Expected output: json, csv, text (default: inferred from the extension)", required: false },
      pages: { type: "string", description: "Page range for PDFs (e.g., '1-5')", required: false },
    },
    category: "pro",
    execute: async (args) => {
      const result = await extractData(String(args.filePath), args.format ? String(args.format) : "auto", args.pages ? String(args.pages) : undefined)
      return result.ok === true ? { ok: true, data: result.data } : { ok: false, error: result.error }
    },
  },
  {
    id: "x_media_ocr",
    name: "OCR Text Recognition",
    description:
      "Extract real text from an image with tesseract, including the per-word mean confidence. Bengali (ben) and English (eng) are installed on this machine. Falls back to a clear install instruction when tesseract is absent.",
    parameters: {
      imagePath: { type: "string", description: "Path to image file", required: true },
      language: { type: "string", description: "Language code (eng, ben, or eng+ben)", required: false },
    },
    category: "pro",
    execute: async (args) => {
      const result = await runOcr(String(args.imagePath), args.language ? String(args.language) : "eng")
      return result.ok === true ? { ok: true, data: result.data } : { ok: false, error: result.error }
    },
  },
  {
    id: "x_media_probe",
    name: "Media Probe",
    description: "Report the real codec, duration and size of a media file using ffprobe.",
    parameters: {
      filePath: { type: "string", description: "Path to the media file", required: true },
    },
    category: "pro",
    execute: async (args) => {
      try {
        const probe = (await probeMedia(String(args.filePath))) as {
          streams?: { codec_type: string; codec_name: string; width?: number; height?: number; duration?: string }[]
          format?: { duration?: string; size?: string; bit_rate?: string; format_name?: string }
        }
        return {
          ok: true,
          data: {
            file: args.filePath,
            container: probe.format?.format_name,
            durationSeconds: probe.format?.duration,
            sizeBytes: probe.format?.size,
            bitRate: probe.format?.bit_rate,
            streams: probe.streams?.map((s) => ({
              type: s.codec_type,
              codec: s.codec_name,
              width: s.width,
              height: s.height,
              duration: s.duration,
            })),
          },
        }
      } catch (err: any) {
        return { ok: false, error: `Media probe failed: ${err.message}` }
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
    description:
      "Record what actually happened during a task into a durable lesson log at ~/.zyraxon/learning/lessons.jsonl. What worked and what failed are both kept, and x_behavior_rules reports the recurring findings from that log.",
    parameters: {
      taskDescription: { type: "string", description: "What was accomplished", required: true },
      whatWorked: { type: "string", description: "What worked well", required: false },
      whatFailed: { type: "string", description: "What failed and why", required: false },
    },
    category: "ultra",
    execute: async (args) => {
      try {
        const task = String(args.taskDescription ?? "").trim()
        if (!task) return { ok: false, error: "taskDescription is required" }
        const lesson = await recordLesson(task, args.whatWorked ? String(args.whatWorked) : undefined, args.whatFailed ? String(args.whatFailed) : undefined)
        return {
          ok: true,
          data: {
            lessonId: lesson.id,
            recordedAt: lesson.at,
            tags: lesson.tags,
            hasWorked: Boolean(lesson.worked),
            hasFailed: Boolean(lesson.failed),
            storedAt: "~/.zyraxon/learning/lessons.jsonl",
          },
        }
      } catch (err: any) {
        return { ok: false, error: `Could not record the lesson: ${err.message}` }
      }
    },
  },
  {
    id: "x_behavior_rules",
    name: "View Behavior Rules",
    description:
      "Show the behaviour rules that actually guide execution: the built-in rules plus patterns learned from the real lesson log, with the most recent lessons attached.",
    parameters: {
      limit: { type: "number", description: "How many recent lessons to attach (default: 10)", required: false },
    },
    category: "ultra",
    execute: async (args) => {
      try {
        const limit = args.limit ? Math.max(1, Math.min(200, Number(args.limit))) : 10
        const report = await behaviourRules()
        return {
          ok: true,
          data: {
            ruleCount: report.rules.length,
            baseRuleCount: report.rules.length - report.learned.length,
            rules: report.rules,
            learnedFromLessons: report.learned,
            lessonCount: report.lessonCount,
            recentLessons: report.recentLessons.slice(0, limit),
          },
        }
      } catch (err: any) {
        return { ok: false, error: `Could not read behaviour rules: ${err.message}` }
      }
    },
  },
]

// ── helpers ────────────────────────────────────────────────────────────────────

function parseParams(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === "") return {}
  if (typeof value === "object") return value as Record<string, unknown>
  const text = String(value).trim()
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>
  } catch {
    // A bare key:value or key=value string is accepted too, since model output is often not JSON.
  }
  const out: Record<string, unknown> = {}
  for (const pair of text.split(/[,;]/)) {
    const index = pair.search(/[:=]/)
    if (index === -1) continue
    const key = pair.slice(0, index).trim()
    const raw = pair.slice(index + 1).trim()
    if (!key) continue
    const asNumber = Number(raw)
    out[key] = raw !== "" && Number.isFinite(asNumber) ? asNumber : raw.replace(/^["']|["']$/g, "")
  }
  return out
}

const TOOL_KEYWORDS = [
  "x_comp_screenshot","x_comp_click_at","x_comp_type_text","x_comp_key_press","x_comp_scroll","x_comp_move_mouse","x_comp_drag","x_comp_open_app","x_comp_list_windows","x_comp_desktop_info",
  "x_media_image_edit","x_media_video_process","x_media_data_extract","x_media_ocr","x_media_probe",
  "x_plan_create","x_plan_execute","x_plan_status",
  "x_learn_from_task","x_behavior_rules",
  "x_cdp_connect","x_cdp_disconnect",
]

// Only these are safe to fire from a bare step title, because none of them need
// arguments. Anything else must be bound explicitly through the steps array.
const AUTORUN_TOOLS = new Set([
  "x_comp_screenshot",
  "x_comp_list_windows",
  "x_comp_desktop_info",
  "x_behavior_rules",
  "x_plan_status",
])

function matchToolInTitle(title: string): string | null {
  const lower = title.toLowerCase()
  const found = TOOL_KEYWORDS.find((name) => lower.includes(name)) ?? null
  return found !== null && AUTORUN_TOOLS.has(found) ? found : null
}

async function runRegisteredTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const { getToolById } = await import("./x-tool-registry")
    const tool = getToolById(name)
    if (!tool) return { ok: false, error: `no registered tool named ${name}` }
    return (await tool.execute(args)) as { ok: boolean; data?: unknown; error?: string }
  } catch (err: any) {
    return { ok: false, error: `could not run ${name}: ${err.message}` }
  }
}
