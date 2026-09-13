import { join } from "path"
import { existsSync, readFileSync } from "fs"
import { execSync, spawn, ChildProcess } from "child_process"
import http from "http"

const PORT = 19800
const PROFILE_DIR = join(process.env.TEMP || "", "ZYRAXON-Voice-Profile")

let chromeProcess: ChildProcess | null = null
let httpServer: http.Server | null = null
let rendererCallback: ((data: any) => void) | null = null
let currentLanguage = "en-US"
let currentVoiceGender = "female"
let pendingListening = false
let htmlContent: string | null = null
let pendingCommands: any[] = []

export function setRendererCallback(cb: (data: any) => void) { rendererCallback = cb }

function sendToVoice(data: any) {
  pendingCommands.push(data)
}

function broadcastState() {
  pendingCommands.push({
    type: "sync-state",
    language: currentLanguage,
    gender: currentVoiceGender,
    listening: pendingListening,
  })
}

export function setVoiceLanguage(lang: string) {
  currentLanguage = lang
  pendingCommands.push({ type: "set-language", lang })
  broadcastState()
}

export function setVoiceGender(gender: string) {
  currentVoiceGender = gender
  pendingCommands.push({ type: "set-voice", gender })
  broadcastState()
}

export function setVoiceListening(listening: boolean) {
  pendingListening = listening
  pendingCommands.push({ type: listening ? "start-listening" : "stop-listening" })
  broadcastState()
}

export function sendVoiceTranscript(text: string) {
  pendingCommands.push({ type: "transcript-display", text })
}

export function getCurrentLanguage() { return currentLanguage }
export function getCurrentVoiceGender() { return currentVoiceGender }

function handleMessage(raw: string) {
  try {
    const data = JSON.parse(raw)
    if (data.type === "ready") {
      broadcastState()
      rendererCallback?.({ type: "voice-mic-state", active: false })
      return
    }
    if (data.type === "ping") return
    if (data.type === "transcript") rendererCallback?.({ type: "voice-transcript", text: data.text, fullText: data.fullText, isFinal: data.final, lang: data.lang })
    else if (data.type === "send-to-chat") rendererCallback?.({ type: "voice-send", text: data.text, lang: data.lang })
    else if (data.type === "language-changed") { currentLanguage = data.lang; rendererCallback?.({ type: "voice-language", lang: data.lang }) }
    else if (data.type === "voice-changed") { currentVoiceGender = data.gender; rendererCallback?.({ type: "voice-gender", gender: data.gender }) }
    else if (data.type === "mic-state") rendererCallback?.({ type: "voice-mic-state", active: data.active })
  } catch {}
}

function findHTMLPath(): string | null {
  const candidates = [
    join(process.resourcesPath || "", "voice-bridge.html"),
    join(__dirname, "..", "..", "resources", "voice-bridge.html"),
    join(__dirname, "..", "resources", "voice-bridge.html"),
  ]
  return candidates.find((p) => existsSync(p)) || null
}

function findChrome(): string | null {
  const pf = process.env["PROGRAMFILES"] || ""
  const pf86 = process.env["PROGRAMFILES(X86)"] || ""
  const local = process.env["LOCALAPPDATA"] || ""
  const candidates = [
    pf ? join(pf, "Google", "Chrome", "Application", "chrome.exe") : null,
    pf86 ? join(pf86, "Google", "Chrome", "Application", "chrome.exe") : null,
    local ? join(local, "Google", "Chrome", "Application", "chrome.exe") : null,
  ].filter(Boolean) as string[]
  return candidates.find((p) => existsSync(p)) || null
}

function killPort(port: number) {
  try {
    const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: "utf8", timeout: 3000 })
    for (const line of out.trim().split("\n")) {
      const pid = line.trim().split(/\s+/).pop()
      if (pid && pid !== "0") {
        try { execSync(`taskkill /F /PID ${pid}`, { encoding: "utf8", timeout: 3000 }) } catch {}
      }
    }
  } catch {}
}

function startHTTPServer(): Promise<void> {
  return new Promise((resolve) => {
    if (httpServer) { resolve(); return }
    killPort(PORT)

    const htmlPath = findHTMLPath()
    if (htmlPath) {
      try { htmlContent = readFileSync(htmlPath, "utf8") } catch {}
    }

    httpServer = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*")
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      res.setHeader("Access-Control-Allow-Headers", "Content-Type")

      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return }

      if (req.method === "GET" && (req.url === "/" || req.url === "/index.html") && htmlContent) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        res.end(htmlContent)
        return
      }

      if (req.method === "GET" && req.url === "/api/poll") {
        const cmds = pendingCommands.splice(0)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(cmds))
        return
      }

      if (req.method === "GET" && req.url === "/api/health") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      if (req.method === "POST" && req.url === "/api/message") {
        let body = ""
        req.on("data", (c) => { body += c })
        req.on("end", () => {
          handleMessage(body)
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end('{"ok":true}')
        })
        return
      }

      res.writeHead(404)
      res.end("Not found")
    })

    httpServer.listen(PORT, "127.0.0.1", () => {
      console.log(`[VoiceBridge] HTTP server on port ${PORT}`)
      resolve()
    })

    httpServer.on("error", (e: any) => {
      if (e.code === "EADDRINUSE") {
        console.log(`[VoiceBridge] Port ${PORT} busy, killing...`)
        killPort(PORT)
        setTimeout(() => httpServer?.listen(PORT, "127.0.0.1"), 500)
      }
    })
  })
}

function launchChrome() {
  const chromePath = findChrome()
  if (!chromePath) {
    console.log("[VoiceBridge] Chrome not found")
    return
  }

  const args = [
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-popup-blocking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    `--app=http://127.0.0.1:${PORT}/`,
  ]

  try {
    chromeProcess = spawn(chromePath, args, { detached: true, stdio: "ignore" })
    chromeProcess.unref()
    chromeProcess.on("error", (e) => console.log("[VoiceBridge] Chrome error:", e.message))
    chromeProcess.on("exit", () => {
      console.log("[VoiceBridge] Chrome exited")
      chromeProcess = null
    })
    console.log("[VoiceBridge] Chrome launched")
  } catch (e) {
    console.log("[VoiceBridge] Failed to launch Chrome:", e)
  }
}

function killVoiceChrome() {
  try {
    const out = execSync(`tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV /NH`, { encoding: "utf8", timeout: 3000 })
    for (const line of out.trim().split("\n")) {
      const match = line.match(/"chrome\.exe","(\d+)"/)
      if (match) {
        const pid = match[1]
        try {
          const cmdLine = execSync(`wmic process where ProcessId=${pid} get CommandLine /VALUE`, { encoding: "utf8", timeout: 3000 })
          if (cmdLine.includes("ZYRAXON-Voice") || cmdLine.includes("ZYRAXON-Voice-Profile") || cmdLine.includes(`127.0.0.1:${PORT}/`)) {
            execSync(`taskkill /F /PID ${pid}`, { encoding: "utf8", timeout: 3000 })
          }
        } catch {}
      }
    }
  } catch {}
}

let nodeTTSModule: typeof import("./tts-node") | null = null
async function startTTSServer() {
  if (nodeTTSModule) return
  try {
    const mod = await import("./tts-node")
    nodeTTSModule = mod
    await mod.startNodeTTS()
    console.log("[VoiceBridge] TTS started")
  } catch (e) { nodeTTSModule = null }
}
function stopTTSServer() {
  if (nodeTTSModule) { try { nodeTTSModule.stopNodeTTS() } catch {} nodeTTSModule = null }
}

export async function startVoiceBridge() {
  await startHTTPServer()
  launchChrome()
  await startTTSServer()
}

export function stopVoiceBridge() {
  killVoiceChrome()
  if (chromeProcess) {
    try { chromeProcess.kill("SIGTERM") } catch {}
    try { chromeProcess.kill("SIGKILL") } catch {}
  }
  chromeProcess = null
  killPort(PORT)
  if (httpServer) { try { httpServer.close() } catch {} httpServer = null }
  stopTTSServer()
}
