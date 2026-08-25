import { WebSocketServer, WebSocket } from "ws"
import { createServer, IncomingMessage } from "http"
import { spawn, execSync } from "child_process"
import { join } from "path"
import { readFileSync, existsSync } from "fs"
import { app } from "electron"

const PORT = 14600
let server: ReturnType<typeof createServer> | null = null
let wss: WebSocketServer | null = null
let chromeProcess: ReturnType<typeof spawn> | null = null
let rendererCallback: ((data: any) => void) | null = null
let currentLanguage: string = "auto"
let currentVoiceGender: string = "male"

export function setRendererCallback(cb: (data: any) => void) {
  rendererCallback = cb
}

export function setVoiceLanguage(lang: string) {
  currentLanguage = lang
  sendToVoiceBridge({ type: "set-language", lang })
}

export function setVoiceGender(gender: string) {
  currentVoiceGender = gender
  sendToVoiceBridge({ type: "set-voice", gender })
}

function findChrome(): string | null {
  const isWin = process.platform === "win32"
  const isMac = process.platform === "darwin"
  const isLinux = process.platform === "linux"

  try {
    if (isWin) {
      const result = execSync("where chrome 2>nul", { encoding: "utf8", timeout: 5000 }).trim()
      if (result) return result.split("\n")[0].trim()
    } else if (isMac) {
      const result = execSync('mdfind "kMDItemCFBundleIdentifier == com.google.Chrome"', { encoding: "utf8", timeout: 5000 }).trim()
      if (result) return result.split("\n")[0].trim() + "/Contents/MacOS/Google Chrome"
    } else {
      const result = execSync("which google-chrome || which google-chrome-stable || which chromium-browser || which chromium 2>/dev/null", { encoding: "utf8", timeout: 5000 }).trim()
      if (result) return result.split("\n")[0].trim()
    }
  } catch {}

  const candidates = isWin
    ? [
        join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
        join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
        join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
      ]
    : isMac
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser", "/usr/bin/chromium"]

  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return null
}

function findHTML(): string | null {
  const candidates = [
    join(process.resourcesPath || "", "voice-bridge.html"),
    join(__dirname, "..", "..", "resources", "voice-bridge.html"),
    join(__dirname, "..", "resources", "voice-bridge.html"),
  ]
  return candidates.find((p) => existsSync(p)) || null
}

// ─── Combined HTTP + WebSocket Server (single port) ─────────────────
function startServer(htmlPath: string) {
  if (server) return

  server = createServer((req: IncomingMessage, res: any) => {
    if (req.url === "/" || req.url === "/voice-bridge.html") {
      try {
        const html = readFileSync(htmlPath, "utf8")
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        res.end(html)
      } catch {
        res.writeHead(500)
        res.end("Error loading")
      }
    } else if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: true, clients: wss?.clients?.size || 0 }))
    } else {
      res.writeHead(404)
      res.end("Not found")
    }
  })

  // WebSocket upgraded from same HTTP server
  wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req: IncomingMessage, socket: any, head: Buffer) => {
    // Only allow WebSocket upgrade on root path
    if (req.url === "/") {
      wss!.handleUpgrade(req, socket, head, (ws) => {
        wss!.emit("connection", ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  wss.on("connection", (ws) => {
    console.log("[VoiceBridge] Client connected")
    // Send current language and voice gender to newly connected client
    if (currentLanguage && currentLanguage !== "auto") {
      ws.send(JSON.stringify({ type: "set-language", lang: currentLanguage }))
    }
    if (currentVoiceGender) {
      ws.send(JSON.stringify({ type: "set-voice", gender: currentVoiceGender }))
    }
    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString())
        if (data.type === "pong") return
        if (data.type === "transcript") {
          rendererCallback?.({ type: "voice-transcript", text: data.text, fullText: data.fullText, isFinal: data.final, lang: data.lang })
        } else if (data.type === "send-to-chat") {
          rendererCallback?.({ type: "voice-send", text: data.text, lang: data.lang })
        } else if (data.type === "language-changed") {
          rendererCallback?.({ type: "voice-language", lang: data.lang })
        } else if (data.type === "voice-changed") {
          rendererCallback?.({ type: "voice-gender", gender: data.gender })
        } else if (data.type === "tts-changed") {
          rendererCallback?.({ type: "voice-tts-config", enabled: data.enabled, gender: data.gender })
        }
      } catch {}
    })
    ws.on("close", () => console.log("[VoiceBridge] Client disconnected"))
  })

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[VoiceBridge] HTTP+WS on http://127.0.0.1:${PORT}`)
  })

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.log(`[VoiceBridge] Port ${PORT} in use, killing existing process`)
      // Try to kill whatever is using the port
      try {
        if (process.platform === "win32") {
          execSync(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${PORT}') do taskkill /F /PID %a 2>nul`, { timeout: 5000 })
        }
      } catch {}
      // Retry after short delay
      setTimeout(() => {
        server?.close()
        server = null
        startServer(htmlPath)
      }, 1000)
    }
  })
}

// ─── Launch Chrome ───────────────────────────────────────────────────
function launchChrome() {
  const chrome = findChrome()
  if (!chrome) {
    console.log("[VoiceBridge] Chrome not found")
    return
  }
  const url = `http://127.0.0.1:${PORT}/`
  const profileDir = join(app?.getPath("userData") || homedir(), "voice-chrome-profile")
  console.log(`[VoiceBridge] Launching Chrome → ${url}`)
  chromeProcess = spawn(chrome, [
    `--user-data-dir=${profileDir}`,
    `--app=${url}`,
    "--window-size=400,100",
    "--window-position=-32000,-32000",
    "--window-minimized",
    "--no-first-run",
    "--disable-extensions",
    "--disable-popup-blocking",
    "--disable-default-apps",
    "--disable-translate",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ], { detached: false, stdio: "ignore" })
  chromeProcess.on("error", () => { chromeProcess = null })
  chromeProcess.on("exit", () => { chromeProcess = null })
}

// ─── Public API ──────────────────────────────────────────────────────
export function startVoiceBridge() {
  const htmlPath = findHTML()
  if (!htmlPath) {
    console.log("[VoiceBridge] voice-bridge.html not found in any location")
    return
  }
  console.log(`[VoiceBridge] Using HTML: ${htmlPath}`)
  startServer(htmlPath)
  // Delay Chrome launch slightly so HTTP server is ready
  setTimeout(launchChrome, 500)
}

export function stopVoiceBridge() {
  if (chromeProcess) { try { chromeProcess.kill() } catch {} chromeProcess = null }
  if (wss) { wss.close(); wss = null }
  if (server) { server.close(); server = null }
}

export function sendToVoiceBridge(data: any) {
  if (!wss) return
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data))
  })
}
