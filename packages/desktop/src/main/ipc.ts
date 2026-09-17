import { execFile } from "node:child_process"
import { stat } from "node:fs/promises"
import { readFileSync, existsSync } from "node:fs"
import { basename, join } from "node:path"
import { app, BrowserWindow, Notification, clipboard, dialog, ipcMain, shell } from "electron"
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"
import type { DesktopMenuAction } from "@zyraxon-ai/app/desktop-menu"


import type { FatalRendererError, PreviewState, ServerReadyData, TitlebarTheme } from "../preload/types"
import { runDesktopMenuAction } from "./desktop-menu-actions"
import { setForceFocus } from "./debug"
import { assertAttachmentBudget, createPickedFileAuthorizations } from "./attachment-picker"
import { getStore, removeStoreFileIfEmpty } from "./store"
import { getPinchZoomEnabled, getWindowID, setPinchZoomEnabled, setTitlebar, updateTitlebar } from "./windows"
import { getEditorPid, isEditorRunning, killEditor, launchZyraxonCode, launchZyraxonCodeWithFolder, openFolderInEditor, openFileInEditor, getEditorStatus, getEditorProviders, executeEditorCommand } from "./editor-server"
import type { UpdaterController } from "./updater-controller"
import { createUpdaterSubscriptions } from "./updater-subscriptions"
import { YouTubeStreamManager } from "./youtube-stream"

// Backend Manager — lazy-loaded
let backendManager: typeof import("./backend-manager") | null = null
function getBackendManager() {
  if (!backendManager) {
    try { backendManager = require("./backend-manager") } catch { return null }
  }
  return backendManager
}

  // TTS Server — auto-start + health check (ensures port 19810 is always alive)
async function ensureTTSServer(): Promise<boolean> {
  try {
    const http = await import("node:http")
    // Quick health check
    await new Promise<void>((resolve, reject) => {
      http.get("http://127.0.0.1:19810/health", (res) => {
        res.resume()
        resolve()
      }).on("error", () => reject(new Error("not running")))
    })
    return true
  } catch {
    // Not running — start it
    try {
      const tts = await import("./tts-node")
      await tts.startNodeTTS()
      return true
    } catch (e) {
      console.error("[TTS] Auto-start failed:", e)
      return false
    }
  }
}

const streamManager = new YouTubeStreamManager()
let streamListenerAttached = false

// TTS debounce — skip if same text arrives within 300ms
let lastTtsText = ""
let lastTtsTime = 0
const TTS_DEBOUNCE_MS = 300

// Voice bridge module — singleton reference (shared with index.ts)
import { getVoiceBridgeModule } from "./voice-bridge-singleton"

const pickerFilters = (ext?: string[]) => {
  if (!ext || ext.length === 0) return undefined
  return [{ name: "Files", extensions: ext }]
}

const pickedFiles = createPickedFileAuthorizations()

type Deps = {
  killSidecar: () => Promise<void> | void
  relaunch: () => void
  awaitInitialization: () => Promise<ServerReadyData>
  consumeInitialDeepLinks: () => Promise<string[]> | string[]
  getDefaultServerUrl: () => Promise<string | null> | string | null
  setDefaultServerUrl: (url: string | null) => Promise<void> | void
  isFirstLaunchOnboardingPending: () => Promise<boolean> | boolean
  finishFirstLaunchOnboarding: (createDefaultProject: boolean) => Promise<string | null> | string | null
  isOldLayoutEligible: () => Promise<boolean> | boolean
  getDisplayBackend: () => Promise<string | null>
  setDisplayBackend: (backend: string | null) => Promise<void> | void
  parseMarkdown: (markdown: string) => Promise<string> | string
  checkAppExists: (appName: string) => Promise<boolean> | boolean
  resolveAppPath: (appName: string) => Promise<string | null>
  updater: UpdaterController
  showUpdater: () => Promise<void> | void
  setBackgroundColor: (color: string) => void
  exportDebugLogs: () => Promise<string>
  recordFatalRendererError: (error: FatalRendererError) => Promise<void> | void
}

export function registerIpcHandlers(deps: Deps) {
  const updaterSubscriptions = createUpdaterSubscriptions()
  app.once("will-quit", updaterSubscriptions.clear)

  ipcMain.handle("kill-sidecar", () => deps.killSidecar())
  ipcMain.handle("await-initialization", () => deps.awaitInitialization())
  ipcMain.handle("consume-initial-deep-links", () => deps.consumeInitialDeepLinks())
  ipcMain.handle("get-default-server-url", () => deps.getDefaultServerUrl())
  ipcMain.handle("set-default-server-url", (_event: IpcMainInvokeEvent, url: string | null) =>
    deps.setDefaultServerUrl(url),
  )
  ipcMain.handle("is-first-launch-onboarding-pending", () => deps.isFirstLaunchOnboardingPending())
  ipcMain.handle("finish-first-launch-onboarding", (_event: IpcMainInvokeEvent, createDefaultProject: boolean) =>
    deps.finishFirstLaunchOnboarding(createDefaultProject),
  )
  ipcMain.handle("is-old-layout-eligible", () => deps.isOldLayoutEligible())
  ipcMain.handle("get-display-backend", () => deps.getDisplayBackend())
  ipcMain.handle("set-display-backend", (_event: IpcMainInvokeEvent, backend: string | null) =>
    deps.setDisplayBackend(backend),
  )
  ipcMain.handle("parse-markdown", (_event: IpcMainInvokeEvent, markdown: string) => deps.parseMarkdown(markdown))
  ipcMain.handle("check-app-exists", (_event: IpcMainInvokeEvent, appName: string) => deps.checkAppExists(appName))
  ipcMain.handle("resolve-app-path", (_event: IpcMainInvokeEvent, appName: string) => deps.resolveAppPath(appName))
  ipcMain.handle("updater-subscribe", (event) => {
    const id = event.sender.id
    updaterSubscriptions.set(
      id,
      deps.updater.subscribe((state) => {
        if (event.sender.isDestroyed()) return updaterSubscriptions.delete(id)
        event.sender.send("updater-state", state)
      }),
    )
    event.sender.once("destroyed", () => updaterSubscriptions.delete(id))
  })
  ipcMain.handle("updater-unsubscribe", (event) => updaterSubscriptions.delete(event.sender.id))
  ipcMain.handle("updater-check", () => deps.updater.check())
  ipcMain.handle("updater-install", () => deps.updater.install())
  ipcMain.handle("set-background-color", (_event: IpcMainInvokeEvent, color: string) => deps.setBackgroundColor(color))
  ipcMain.handle("export-debug-logs", () => deps.exportDebugLogs())
  ipcMain.handle("launch-zyraxon-code", (_event: IpcMainInvokeEvent, args?: string[]) => launchZyraxonCode(args))
  ipcMain.handle("launch-zyraxon-code-with-folder", (_event: IpcMainInvokeEvent, folderPath: string) =>
    launchZyraxonCodeWithFolder(folderPath),
  )
  ipcMain.handle("open-folder-in-editor", (_event: IpcMainInvokeEvent, folderPath: string) =>
    openFolderInEditor(folderPath),
  )
  ipcMain.handle("open-file-in-editor", (_event: IpcMainInvokeEvent, filePath: string) =>
    openFileInEditor(filePath),
  )
  ipcMain.handle("get-editor-status", () => getEditorStatus())
  ipcMain.handle("get-editor-providers", () => getEditorProviders())
  ipcMain.handle("execute-editor-command", (_event: IpcMainInvokeEvent, command: string, args?: any[]) =>
    executeEditorCommand(command, args),
  )
  ipcMain.handle("get-editor-pid", () => getEditorPid())
  ipcMain.handle("is-editor-running", () => isEditorRunning())
  ipcMain.handle("kill-editor", () => killEditor())
  ipcMain.handle("set-force-focus", (event: IpcMainInvokeEvent, enabled: boolean) =>
    setForceFocus(event.sender, enabled),
  )
  ipcMain.handle("record-fatal-renderer-error", (_event: IpcMainInvokeEvent, error: FatalRendererError) =>
    deps.recordFatalRendererError(error),
  )

  ipcMain.handle("store-get", (_event: IpcMainInvokeEvent, name: string, key: string) => {
    try {
      const store = getStore(name)
      const value = store.get(key)
      if (value === undefined || value === null) return null
      return typeof value === "string" ? value : JSON.stringify(value)
    } catch {
      return null
    }
  })
  ipcMain.handle("store-set", (_event: IpcMainInvokeEvent, name: string, key: string, value: string) => {
    getStore(name).set(key, value)
  })
  ipcMain.handle("store-delete", (_event: IpcMainInvokeEvent, name: string, key: string) => {
    getStore(name).delete(key)
    void removeStoreFileIfEmpty(name)
  })
  ipcMain.handle("store-clear", (_event: IpcMainInvokeEvent, name: string) => {
    getStore(name).clear()
    void removeStoreFileIfEmpty(name)
  })
  ipcMain.handle("store-keys", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name)
    return Object.keys(store.store)
  })
  ipcMain.handle("store-length", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name)
    return Object.keys(store.store).length
  })

  ipcMain.handle("write-file", async (_event: IpcMainInvokeEvent, filePath: string, content: string) => {
    try {
      const fs = require("node:fs")
      fs.writeFileSync(filePath, content, "utf-8")
      return true
    } catch (error: any) {
      console.error("[IPC] Failed to write file:", error.message, "path:", filePath)
      return false
    }
  })

  ipcMain.handle("get-github-token", () => {
    try {
      const { execSync } = require("node:child_process") as typeof import("node:child_process")
      const url = execSync("git remote get-url origin", { encoding: "utf-8", timeout: 3000 }).trim()
      const match = url.match(/ghp_[A-Za-z0-9]+/)
      if (match) return match[0]
      if (process.env.ZYRAXON_GITHUB_TOKEN) return process.env.ZYRAXON_GITHUB_TOKEN
    } catch {}
    return null
  })

  ipcMain.handle("save-ecosystem-auth", async (_event: IpcMainInvokeEvent, data: { token: string; user: any }) => {
    try {
      const fs = await import("node:fs/promises")
      const path = await import("node:path")
      const dataDir = path.join(app.getPath("userData"), "ecosystem")
      await fs.mkdir(dataDir, { recursive: true })
      const filePath = path.join(dataDir, "auth.json")
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle("open-directory-picker",
    async (_event: IpcMainInvokeEvent, opts?: { multiple?: boolean; title?: string; defaultPath?: string }) => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", ...(opts?.multiple ? ["multiSelections" as const] : []), "createDirectory"],
        title: opts?.title ?? "Choose a folder",
        defaultPath: opts?.defaultPath,
      })
      if (result.canceled) return null
      return opts?.multiple ? result.filePaths : result.filePaths[0]
    },
  )

  ipcMain.handle(
    "open-file-picker",
    async (
      event: IpcMainInvokeEvent,
      opts?: { multiple?: boolean; title?: string; defaultPath?: string; extensions?: string[] },
    ) => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile", ...(opts?.multiple ? ["multiSelections" as const] : [])],
        title: opts?.title ?? "Choose a file",
        defaultPath: opts?.defaultPath,
        filters: pickerFilters(opts?.extensions),
      })
      if (result.canceled) return null
      const files = await Promise.all(
        result.filePaths.map(async (filePath) => ({
          path: filePath,
          name: basename(filePath),
          size: (await stat(filePath)).size,
        })),
      )
      assertAttachmentBudget(files)
      const token = pickedFiles.add(event.sender.id, result.filePaths)
      return { token, files }
    },
  )

  ipcMain.handle("read-picked-file", async (event: IpcMainInvokeEvent, token: string, filePath: string) => {
    return pickedFiles.read(event.sender.id, token, filePath)
  })

  ipcMain.handle("release-picked-files", (event: IpcMainInvokeEvent, token: string) => {
    pickedFiles.release(event.sender.id, token)
  })

  ipcMain.handle(
    "save-file-picker",
    async (_event: IpcMainInvokeEvent, opts?: { title?: string; defaultPath?: string }) => {
      const result = await dialog.showSaveDialog({
        title: opts?.title ?? "Save file",
        defaultPath: opts?.defaultPath,
      })
      if (result.canceled) return null
      return result.filePath ?? null
    },
  )

  ipcMain.on("open-link", (_event: IpcMainEvent, url: string) => {
    void shell.openExternal(url)
  })

  // YouTube player — opens video in a new Electron BrowserWindow (no iframe needed)
  ipcMain.handle("open-youtube-player", (_event: IpcMainInvokeEvent, videoUrl: string) => {
    const win = new BrowserWindow({
      width: 800,
      height: 500,
      minWidth: 400,
      minHeight: 300,
      title: "YouTube Player",
      backgroundColor: "#000000",
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })
    win.loadURL(videoUrl)
    win.setMenuBarVisibility(false)
    win.on("closed", () => {})
    return true
  })

  ipcMain.handle("open-path", async (_event: IpcMainInvokeEvent, path: string, app?: string) => {
    if (!app) return shell.openPath(path)
    await new Promise<void>((resolve, reject) => {
      const [cmd, args] =
        process.platform === "darwin" ? (["open", ["-a", app, path]] as const) : ([app, [path]] as const)
      execFile(cmd, args, (err) => (err ? reject(err) : resolve()))
    })
  })

  ipcMain.handle("reveal-path", async (_event: IpcMainInvokeEvent, path: string) => {
    const exists = await stat(path).then(
      () => true,
      () => false,
    )
    if (!exists) return false
    shell.showItemInFolder(path)
    return true
  })

  ipcMain.handle("read-clipboard-image", () => {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    const buffer = image.toPNG().buffer
    const size = image.getSize()
    return { buffer, width: size.width, height: size.height }
  })

  ipcMain.on("show-notification", (_event: IpcMainEvent, title: string, body?: string) => {
    new Notification({ title, body }).show()
  })

  ipcMain.handle("get-window-count", () => BrowserWindow.getAllWindows().length)

  ipcMain.handle("get-window-id", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error("Window not found")
    const id = getWindowID(win)
    if (!id) throw new Error("Window ID not found")
    return id
  })

  ipcMain.handle("get-window-focused", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFocused() ?? false
  })

  ipcMain.handle("set-window-focus", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.focus()
  })

  ipcMain.handle("show-window", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.show()
  })

  ipcMain.on("relaunch", () => {
    deps.relaunch()
  })

  ipcMain.handle("get-zoom-factor", (event: IpcMainInvokeEvent) => event.sender.getZoomFactor())
  ipcMain.handle("set-zoom-factor", (event: IpcMainInvokeEvent, factor: number) => {
    event.sender.setZoomFactor(factor)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    updateTitlebar(win)
  })
  ipcMain.handle("get-pinch-zoom-enabled", () => getPinchZoomEnabled())
  ipcMain.handle("set-pinch-zoom-enabled", (_event: IpcMainInvokeEvent, enabled: boolean) => {
    setPinchZoomEnabled(enabled)
  })
  ipcMain.handle("set-titlebar", (event: IpcMainInvokeEvent, theme: TitlebarTheme) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    setTitlebar(win, theme)
  })
  ipcMain.handle("run-desktop-menu-action", (event: IpcMainInvokeEvent, action: DesktopMenuAction) => {
    runDesktopMenuAction(BrowserWindow.fromWebContents(event.sender), action, {
      checkForUpdates: () => void deps.showUpdater(),
      relaunch: deps.relaunch,
    })
  })

  ipcMain.handle("transcribe-audio", async (_event: IpcMainInvokeEvent, _audioBase64: string, _mimeType: string) => {
    console.warn("[IPC] transcribe-audio is deprecated — use voice bridge IPC (voiceStartListening/voiceStopListening) instead")
    throw new Error("Direct audio transcription is no longer supported. Use the voice bridge mic button instead.")
  })

  // Voice Bridge — Chrome speech recognition controls
  ipcMain.handle("voice-start-listening", () => {
    const vb = getVoiceBridgeModule()
    if (!vb) return false
    vb.setVoiceListening(true)
    return true
  })
  ipcMain.handle("voice-stop-listening", () => {
    const vb = getVoiceBridgeModule()
    if (!vb) return false
    vb.setVoiceListening(false)
    return true
  })
  ipcMain.handle("voice-set-language", (_event: IpcMainInvokeEvent, lang: string) => {
    const vb = getVoiceBridgeModule()
    if (!vb) return false
    vb.setVoiceLanguage(lang)
    return true
  })
  ipcMain.handle("voice-send-text", (_event: IpcMainInvokeEvent, text: string) => {
    const vb = getVoiceBridgeModule()
    if (!vb) return false
    vb.sendVoiceTranscript(text)
    return true
  })

  // TTS restart — called from renderer when server is down
  ipcMain.handle("tts-restart", async () => {
    try {
      const tts = await import("./tts-node")
      tts.stopNodeTTS()
      await new Promise(r => setTimeout(r, 500))
      await tts.startNodeTTS()
      console.log("[TTS] Server restarted successfully")
      return true
    } catch (e) {
      console.error("[TTS] Restart failed:", e)
      return false
    }
  })

  ipcMain.on("voice-tts-speak", async (event: IpcMainEvent, text: string) => {
    if (!text) return

    // Debounce: skip if same text arrives within 300ms (prevents double-speak)
    const now = Date.now()
    if (text === lastTtsText && now - lastTtsTime < TTS_DEBOUNCE_MS) {
      console.log("[TTS-IPC] Debounced duplicate request")
      return
    }
    lastTtsText = text
    lastTtsTime = now

    console.log("[TTS-IPC] Received voice-tts-speak, text:", text.slice(0, 80))
    const ready = await ensureTTSServer()
    if (!ready) {
      console.error("[TTS-IPC] Server not available, skipping speak")
      event.reply("voice-tts-error", "TTS server failed to start")
      return
    }
    const vb = getVoiceBridgeModule()
    const lang = vb?.getCurrentLanguage()?.split("-")[0] || "bn"
    const gender = vb?.getCurrentVoiceGender() === "male" ? "m" : "f"

    // Split into sentences — larger chunks = fewer HTTP requests = faster
    const sentences: string[] = []
    let rem = text
    if (rem.length > 500) {
      while (rem.length > 800) {
        let idx = rem.lastIndexOf(".", 790)
        if (idx < 300) idx = rem.lastIndexOf("!", 790)
        if (idx < 300) idx = rem.lastIndexOf("?", 790)
        if (idx < 300) idx = rem.lastIndexOf("।", 790)
        if (idx < 300) idx = rem.lastIndexOf("\n", 790)
        if (idx < 300) idx = rem.lastIndexOf(" ", 790)
        if (idx < 300) idx = 800
        sentences.push(rem.slice(0, idx + 1).trim())
        rem = rem.slice(idx + 1)
      }
    }
    if (rem.trim()) sentences.push(rem.trim())

    // SEQUENTIAL: process one sentence at a time to prevent overlapping audio
    let anySuccess = false
    for (const s of sentences) {
      if (!s) continue
      try {
        const url = `http://127.0.0.1:19810/speak?text=${encodeURIComponent(s)}&lang=${lang}&gender=${gender}`
        const resp = await fetch(url)
        if (!resp.ok) {
          console.error("[TTS-Direct] HTTP error:", resp.status)
          continue
        }
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length > 100) {
          event.reply("voice-tts-audio", buf)
          anySuccess = true
        }
      } catch (e) {
        console.error("[TTS-Direct] Error:", e)
      }
    }
    if (!anySuccess && sentences.length > 0) {
      console.error("[TTS-IPC] All sentences failed to generate audio")
      event.reply("voice-tts-error", "TTS generation failed — check internet connection")
    }
  })

  ipcMain.handle("voice-tts-stop", () => {
    // Voice bridge no longer handles TTS — main app does
    return true
  })

  ipcMain.handle("voice-tts-enabled", (_event: IpcMainInvokeEvent, enabled: boolean) => {
    // Voice bridge no longer handles TTS — main app does
    return true
  })

  ipcMain.handle("voice-set-gender", (_event: IpcMainInvokeEvent, gender: string) => {
    const vb = getVoiceBridgeModule()
    if (!vb) return false
    vb.setVoiceGender(gender)
    return true
  })

  // YouTube Live Streaming
  ipcMain.handle("youtube-stream-start", (event: IpcMainInvokeEvent, config: { streamKey: string; streamUrl?: string; youtubeApiKey?: string; quality?: "4k" | "1440p" | "1080p" | "720p"; captureMode?: "fullscreen" | "app"; audioMode?: "none" | "microphone" | "system" }) => {
    // Remove old listeners before adding new ones (prevent leak on repeated start/stop)
    streamManager.removeAllListeners("status")
    streamManager.removeAllListeners("viewers")
    streamManager.removeAllListeners("duration")

    streamManager.on("status", (state) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("youtube-stream-status", state)
      }
    })
    streamManager.on("viewers", (count: number) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("youtube-stream-viewers", count)
      }
    })
    streamManager.on("duration", (seconds: number) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("youtube-stream-duration", seconds)
      }
    })
    return streamManager.start(config)
  })

  ipcMain.handle("youtube-stream-stop", () => {
    return streamManager.stop()
  })

  ipcMain.handle("youtube-stream-toggle-capture-mode", () => {
    return streamManager.toggleCaptureMode()
  })

  ipcMain.handle("youtube-stream-status", () => {
    return streamManager.getState()
  })

  ipcMain.handle("youtube-stream-probe-devices", () => {
    return streamManager.probeDevices()
  })

  // ─── Site Preview ────────────────────────────────────────────────────────────
  ipcMain.handle("get-preview-state", async () => {
    try {
      const { join } = await import("node:path")
      const { homedir } = await import("node:os")
      const { readFile, access } = await import("node:fs/promises")
      const previewPath = join(homedir(), ".zyraxon", "websites", "preview-state.json")
      await access(previewPath)
      const data = await readFile(previewPath, "utf-8")
      return JSON.parse(data) as PreviewState
    } catch {
      return { url: null, siteName: null, siteId: null, timestamp: new Date().toISOString() } as PreviewState
    }
  })

  ipcMain.handle("set-preview-state", async (_event: IpcMainInvokeEvent, state: PreviewState) => {
    try {
      const { join } = await import("node:path")
      const { homedir } = await import("node:os")
      const { writeFile, mkdir } = await import("node:fs/promises")
      const dir = join(homedir(), ".zyraxon", "websites")
      await mkdir(dir, { recursive: true })
      const previewPath = join(dir, "preview-state.json")
      await writeFile(previewPath, JSON.stringify({ ...state, timestamp: new Date().toISOString() }))
    } catch (error) {
      console.error("[IPC] Failed to set preview state:", error)
    }
  })

  // ─── Model Download IPC ───────────────────────────────────────────────────
  ipcMain.handle("download-model", async (_event: IpcMainInvokeEvent, config: { url: string; targetPath: string; modelId: string }) => {
    const { join, dirname, resolve } = await import("node:path")
    const { homedir } = await import("node:os")
    const { mkdir, access, stat } = await import("node:fs/promises")
    const { createWriteStream } = await import("node:fs")
    const https = await import("node:https")
    const http = await import("node:http")

    // Resolve targetPath relative to home directory
    const resolvedTarget = config.targetPath.startsWith("/")
      ? config.targetPath
      : resolve(homedir(), config.targetPath)
    const targetDir = dirname(resolvedTarget)
    await mkdir(targetDir, { recursive: true })

    // Check if already downloaded
    try {
      await access(resolvedTarget)
      const s = await stat(resolvedTarget)
      if (s.size > 10_000_000) {
        return { success: true, path: resolvedTarget, skipped: true }
      }
    } catch {}

    return new Promise((resolve, reject) => {
      const protocol = config.url.startsWith("https") ? https : http
      const request = protocol.get(config.url, { headers: { "User-Agent": "ZYRAXON/1.0" } }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Follow redirect
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            const redirProtocol = redirectUrl.startsWith("https") ? https : http
            redirProtocol.get(redirectUrl, { headers: { "User-Agent": "ZYRAXON/1.0" } }, (redirResponse) => {
              if (redirResponse.statusCode !== 200) {
                reject(new Error(`Download failed with status ${redirResponse.statusCode}`))
                return
              }
              const fileStream = createWriteStream(resolvedTarget)
              let bytesDownloaded = 0
              const totalBytes = parseInt(redirResponse.headers["content-length"] || "0", 10)

              redirResponse.on("data", (chunk: Buffer) => {
                bytesDownloaded += chunk.length
                const percent = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0
                _event.sender.send("download-model-progress", {
                  modelId: config.modelId,
                  bytesDownloaded,
                  totalBytes,
                  percent,
                })
              })

              redirResponse.pipe(fileStream)
              fileStream.on("finish", () => {
                fileStream.close()
                resolve({ success: true, path: resolvedTarget })
              })
              fileStream.on("error", (err) => {
                reject(err)
              })
            }).on("error", reject)
            return
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`))
          return
        }

        const fileStream = createWriteStream(resolvedTarget)
        let bytesDownloaded = 0
        const totalBytes = parseInt(response.headers["content-length"] || "0", 10)

        response.on("data", (chunk: Buffer) => {
          bytesDownloaded += chunk.length
          const percent = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0
          _event.sender.send("download-model-progress", {
            modelId: config.modelId,
            bytesDownloaded,
            totalBytes,
            percent,
          })
        })

        response.pipe(fileStream)
        fileStream.on("finish", () => {
          fileStream.close()
          resolve({ success: true, path: resolvedTarget })
        })
        fileStream.on("error", (err) => {
          reject(err)
        })
      })

      request.on("error", reject)
      request.setTimeout(600000, () => {
        request.destroy()
        reject(new Error("Download timeout after 10 minutes"))
      })
    })
  })

  // ─── Backend Manager IPC ─────────────────────────────────────────────────
  ipcMain.handle("backend-status", () => {
    const bm = getBackendManager()
    if (!bm) return { backends: [] }
    return { backends: bm.getAllBackendStatuses() }
  })

  ipcMain.handle("backend-start", async (_event: IpcMainInvokeEvent, config: { type: string; modelPath: string; serverFlags?: string[] }) => {
    const bm = getBackendManager()
    if (!bm) return { success: false, error: "Backend manager not available" }
    try {
      const result = await bm.startBackend(config.type, config.modelPath, config.serverFlags || [])
      return { success: true, port: result.port }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle("backend-stop", (_event: IpcMainInvokeEvent, type: string) => {
    const bm = getBackendManager()
    if (bm) bm.stopBackend(type)
    return { success: true }
  })

  ipcMain.handle("generate-image", async (_event: IpcMainInvokeEvent, config: { modelPath: string; prompt: string; width?: number; height?: number; steps?: number; seed?: number }) => {
    const bm = getBackendManager()
    if (!bm) return { success: false, error: "Backend manager not available" }
    return bm.generateImage(config.modelPath, {
      prompt: config.prompt,
      width: config.width,
      height: config.height,
      steps: config.steps,
      seed: config.seed,
    })
  })

  ipcMain.handle("generate-music", async (_event: IpcMainInvokeEvent, config: { modelPath: string; prompt: string; duration?: number }) => {
    const bm = getBackendManager()
    if (!bm) return { success: false, error: "Backend manager not available" }
    return bm.generateMusic(config.modelPath, {
      prompt: config.prompt,
      duration: config.duration,
    })
  })

  ipcMain.handle("generate-tts", async (_event: IpcMainInvokeEvent, config: { text: string; voice?: string }) => {
    const bm = getBackendManager()
    if (!bm) return { success: false, error: "Backend manager not available" }
    return bm.generateTTS(config.text, config.voice as any)
  })

  ipcMain.handle("generate-video", async (_event: IpcMainInvokeEvent, config: { modelPath: string; prompt: string; numFrames?: number }) => {
    const bm = getBackendManager()
    if (!bm) return { success: false, error: "Backend manager not available" }
    return bm.generateVideo(config.modelPath, {
      prompt: config.prompt,
      numFrames: config.numFrames,
    })
  })
}

export function pushPreviewState(win: BrowserWindow, state: PreviewState) {
  if (!win.isDestroyed()) {
    win.webContents.send("site-preview-update", state)
  }
}

export function broadcastPreviewState(state: PreviewState) {
  for (const win of BrowserWindow.getAllWindows()) {
    pushPreviewState(win, state)
  }
}

export function sendMenuCommand(win: BrowserWindow, id: string) {
  win.webContents.send("menu-command", id)
}

export function sendDeepLinks(win: BrowserWindow, urls: string[]) {
  win.webContents.send("deep-link", urls)
}

function findOpenAIKey(): string | null {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY

  const configDirs = [
    join(app.getPath("home"), ".config", "zyraxon"),
    join(app.getPath("home"), ".config", "zyraxon"),
    app.getPath("userData"),
  ]

  for (const dir of configDirs) {
    for (const name of ["config.json", "zyraxon.json", "zyraxon.jsonc"]) {
      const filePath = join(dir, name)
      if (!existsSync(filePath)) continue
      try {
        const raw = readFileSync(filePath, "utf-8")
        const cleaned = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
        const config = JSON.parse(cleaned)
        const providers = config?.provider
        if (!providers || typeof providers !== "object") continue
        for (const [id, info] of Object.entries(providers)) {
          const p = info as Record<string, unknown>
          if (typeof p.apiKey === "string" && p.apiKey && (id === "openai" || id.includes("openai"))) {
            return p.apiKey
          }
          if (typeof p.api_key === "string" && p.api_key && (id === "openai" || id.includes("openai"))) {
            return p.api_key
          }
        }
        for (const [id, info] of Object.entries(providers)) {
          const p = info as Record<string, unknown>
          if (typeof p.apiKey === "string" && p.apiKey) return p.apiKey
          if (typeof p.api_key === "string" && p.api_key) return p.api_key
        }
      } catch {
        continue
      }
    }
  }

  return null
}

// ─── Daily Tasks IPC ──────────────────────────────────────────────────────
ipcMain.handle("daily-tasks:get", async () => {
  try {
    const { loadTasks } = await import("./daily-task-storage")
    return loadTasks()
  } catch (error) {
    console.error("[IPC] Failed to get daily tasks:", error)
    return []
  }
})

ipcMain.handle("daily-tasks:save", async (_event: IpcMainInvokeEvent, tasks: any[]) => {
  try {
    const { saveTasks } = await import("./daily-task-storage")
    saveTasks(tasks)
    return true
  } catch (error) {
    console.error("[IPC] Failed to save daily tasks:", error)
    return false
  }
})

ipcMain.handle("daily-tasks:run", async (_event: IpcMainInvokeEvent, task: any) => {
  try {
    const { BrowserWindow } = await import("electron")
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const win = windows[0]
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      win.focus()
      win.webContents.send("daily-task:activate", {
        taskId: task.id,
        prompt: task.prompt,
        time: task.time,
      })
    }
    return true
  } catch (error) {
    console.error("[IPC] Failed to run daily task:", error)
    return false
  }
})

let cloudAgentWindow: BrowserWindow | null = null

export function closeCloudAgentWindow() {
  if (cloudAgentWindow && !cloudAgentWindow.isDestroyed()) {
    cloudAgentWindow.destroy()
    cloudAgentWindow = null
  }
}

ipcMain.handle("cloud-agent:open", async () => {
  if (cloudAgentWindow && !cloudAgentWindow.isDestroyed()) {
    cloudAgentWindow.focus()
    return true
  }
  cloudAgentWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Cloud Agent — ZYRAXON-Pro",
    icon: undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  // Grant microphone/camera permissions for speech recognition
  cloudAgentWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = permission === "media" || permission === "clipboard-sanitized-write" || permission === "notifications"
    callback(allowed)
  })
  cloudAgentWindow.webContents.session.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    if (permission === "media" || permission === "clipboard-sanitized-write" || permission === "notifications") {
      return details.requestingUrl?.startsWith("https://zyraxon-pro.ai.studio") ||
        details.requestingUrl?.startsWith("https://zyraxon.ai") || false
    }
    return false
  })
  // Device permission handler for microphone access
  cloudAgentWindow.webContents.session.setDevicePermissionHandler((details, callback) => {
    if (details.deviceType === "microphone" || details.deviceType === "camera") {
      const url = details.requestingUrl || details.origin
      if (url.includes("zyraxon-pro.ai.studio") || url.includes("zyraxon.ai")) {
        callback(true)
        return
      }
    }
    callback(false)
  })
  cloudAgentWindow.setMenu(null)
  await cloudAgentWindow.loadURL("https://zyraxon-pro.ai.studio/")
  cloudAgentWindow.on("closed", () => { cloudAgentWindow = null })
  // Inject speech bridge so Web Speech API works in the cloud agent window
  try {
    const { injectCloudAgentSpeechBridge } = await import("./windows")
    injectCloudAgentSpeechBridge(cloudAgentWindow)
  } catch {}
  return true
})

// Subscription state sync — writes to ~/.zyraxon/subscription.json for core to read
ipcMain.handle("set-subscription-state", async (_event, stateJson: string) => {
  try {
    const fs = await import("node:fs/promises")
    const path = await import("node:path")
    const os = await import("node:os")
    const dir = path.join(os.homedir(), ".zyraxon")
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, "subscription.json"), stateJson, "utf-8")
  } catch (e) {
    console.error("[Subscription] Failed to write state file:", e)
  }
})
