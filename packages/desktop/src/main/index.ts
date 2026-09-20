import { randomUUID } from "node:crypto"
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import * as http from "node:http"
import { createServer } from "node:net"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { getCACertificates, setDefaultCACertificates } from "node:tls"
import type { Event } from "electron"
import { app } from "electron"

import { Deferred, Effect, Fiber } from "effect"
import contextMenu from "electron-context-menu"

import type { ServerReadyData, PreviewState } from "../preload/types"
import { checkAppExists, resolveAppPath } from "./apps"
import { CHANNEL } from "./constants"
import { registerIpcHandlers, sendDeepLinks, sendMenuCommand, broadcastPreviewState, closeCloudAgentWindow } from "./ipc"
import { forwardInitializationFailure } from "./initialization"
import { exportDebugLogs, initCrashReporter, initLogging, startNetLog, write as writeLog } from "./logging"
import { createMenu } from "./menu"
import {
  finishFirstLaunchOnboarding,
  initializeOldLayoutEligibility,
  isFirstLaunchOnboardingPending,
  isOldLayoutEligible,
} from "./onboarding"
import {
  getDefaultServerUrl,
  preferAppEnv,
  setDefaultServerUrl,
  spawnLocalServer,
  type SidecarListener,
} from "./server"
import { setupAutoUpdater, showUpdaterDialog } from "./updater"
import { safeWebContentsURL } from "./window-state"
import {
  getLastFocusedWindow,
  registerRendererProtocol,
  setRelaunchHandler,
  setAppQuitting,
  setBackgroundColor,
  setDockIcon,
  restoreMainWindows,
} from "./windows"
import { createWslServersController } from "./wsl/servers"
import { registerWslIpcHandlers } from "./wsl/ipc"
import { spawnWslSidecar } from "./wsl/sidecar"
import { migrate } from "./migrate"
import { cleanupStoreFiles } from "./store-cleanup"

const APP_NAMES: Record<string, string> = {
  dev: "ZYRAXON Dev",
  beta: "ZYRAXON Beta",
  prod: "ZYRAXON",
}
const APP_IDS: Record<string, string> = {
  dev: "ai.zyraxon.desktop.dev",
  beta: "ai.zyraxon.desktop.beta",
  prod: "ai.zyraxon.desktop",
}
// Allow AudioContext playback without user gesture (critical for TTS)
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")
// Disable automation detection that can block SpeechRecognition in iframes
app.commandLine.appendSwitch("disable-features", "AutomationControlled")

const TEST_ONBOARDING = process.env.ZYRAXON_TEST_ONBOARDING === "1"
const jsCallStackFeature = "DocumentPolicyIncludeJSCallStacksInCrashReports"

let logger: ReturnType<typeof initLogging>
let server: SidecarListener | null = null
let isQuitting = false

const pendingDeepLinks: string[] = []

function useEnvProxy() {
  try {
    // Electron 41.2 runs Node 24.14.1; latest @types/node@24 is 24.12.2.
    ;(http as any).setGlobalProxyFromEnv()
  } catch (error) {
    logger.warn("failed to load proxy environment", error)
  }
}

function emitDeepLinks(urls: string[]) {
  if (urls.length === 0) return
  pendingDeepLinks.push(...urls)
  const win = getLastFocusedWindow()
  if (win) sendDeepLinks(win, urls)
}

async function killSidecar() {
  if (!server) return
  const current = server
  server = null
  await current.stop()
}

function ensureLoopbackNoProxy() {
  const loopback = ["127.0.0.1", "localhost", "::1"]
  const upsert = (key: string) => {
    const items = (process.env[key] ?? "")
      .split(",")
      .map((value: string) => value.trim())
      .filter((value: string) => Boolean(value))

    for (const host of loopback) {
      if (items.some((value: string) => value.toLowerCase() === host)) continue
      items.push(host)
    }

    process.env[key] = items.join(",")
  }

  upsert("NO_PROXY")
  upsert("no_proxy")
}

const main = Effect.gen(function* () {
  contextMenu({ showSaveImageAs: true, showLookUpSelection: false, showSearchWithGoogle: false })

  // on macOS apps run in `/` which can cause issues with ripgrep
  try {
    process.chdir(homedir())
  } catch {}

  process.env.ZYRAXON_DISABLE_EMBEDDED_WEB_UI = "true"

  const appId = app.isPackaged ? APP_IDS[CHANNEL] : "ai.zyraxon.desktop.dev"
  const onboardingTestRoot = ((): string | undefined => {
    if (!TEST_ONBOARDING) return

    const root = join(tmpdir(), `zyraxon-onboarding-${randomUUID()}`)
    rmSync(root, { recursive: true, force: true })
    ;["data", "config", "cache", "state", "desktop", "session"].forEach((dir) =>
      mkdirSync(join(root, dir), { recursive: true }),
    )
    process.env.ZYRAXON_DB = ":memory:"
    process.env.XDG_DATA_HOME = join(root, "data")
    process.env.XDG_CONFIG_HOME = join(root, "config")
    process.env.XDG_CACHE_HOME = join(root, "cache")
    process.env.XDG_STATE_HOME = join(root, "state")
    return root
  })()
  app.setName(app.isPackaged ? APP_NAMES[CHANNEL] : "ZYRAXON Dev")
  app.setAppUserModelId(appId)
  app.setPath(
    "userData",
    onboardingTestRoot ? join(onboardingTestRoot, "desktop") : join(app.getPath("appData"), appId),
  )
  if (onboardingTestRoot) app.setPath("sessionData", join(onboardingTestRoot, "session"))
  initializeOldLayoutEligibility(app.getPath("userData"))

  // Critical system file — app depends on this. If deleted, app breaks.
  const zyraxonDir = join(homedir(), ".zyraxon")
  const systemFile = join(zyraxonDir, "system.dat")
  const subFile = join(zyraxonDir, "subscription.json")
  try {
    mkdirSync(zyraxonDir, { recursive: true })
    if (!existsSync(systemFile)) {
      const systemData = JSON.stringify({
        id: randomUUID(),
        version: app.getVersion(),
        created: Date.now(),
        checksum: Buffer.from(`zyraxon-${app.getVersion()}-${Date.now()}`).toString("base64"),
      })
      writeFileSync(systemFile, systemData, "utf-8")
    }
    if (!existsSync(subFile)) {
      writeFileSync(subFile, JSON.stringify({
        tier: "free", activatedAt: null, expiresAt: null,
        secretCode: null, stripeSessionId: null,
      }), "utf-8")
    }
  } catch (e) {
    console.error("[System] Failed to init system files:", e)
  }

  logger = initLogging()
  initCrashReporter()

  const wslServers = createWslServersController(
    app.getVersion(),
    async (distro) => {
      logger.log("spawning wsl sidecar", { distro })
      return spawnWslSidecar(distro, {
        onLine: (line) => logger.log("wsl sidecar", { distro, stream: line.stream, text: line.text }),
      })
    },
    {
      logger: {
        log: (message, meta) => logger.log(message, meta),
        error: (message, meta) => logger.error(message, meta),
      },
    },
  )
  const stopSidecars = async () => {
    await killSidecar()
    wslServers.stopAll()
  }
  const relaunch = () => {
    setAppQuitting()
    void stopSidecars().finally(() => {
      app.relaunch()
      app.exit(0)
    })
  }

  try {
    setDefaultCACertificates([...new Set([...getCACertificates("default"), ...getCACertificates("system")])])
  } catch (error) {
    logger.warn("failed to load system certificates", error)
  }

  logger.log("app starting", {
    version: app.getVersion(),
    packaged: app.isPackaged,
    onboardingTest: Boolean(onboardingTestRoot),
  })

  ensureLoopbackNoProxy()
  useEnvProxy()
  app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>")
  const features = app.commandLine.getSwitchValue("enable-features")
  const speechFeatures = "SpeechRecognitionInIframe,PlatformSpeechRecognition"
  app.commandLine.appendSwitch(
    "enable-features",
    features ? `${jsCallStackFeature},${speechFeatures},${features}` : `${jsCallStackFeature},${speechFeatures}`,
  )
  if (!app.isPackaged) app.commandLine.appendSwitch("remote-debugging-port", "9222")

  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  preferAppEnv(app.getPath("userData"))

  app.on("second-instance", (_event: Event, argv: string[]) => {
    const urls = argv.filter((arg: string) => arg.startsWith("zyraxon://"))
    if (urls.length) {
      logger.log("deep link received via second-instance", { urls })
      emitDeepLinks(urls)
    }
    const win = getLastFocusedWindow()
    if (win) {
      win.show()
      win.focus()
    }
  })

  app.on("open-url", (event: Event, url: string) => {
    event.preventDefault()
    logger.log("deep link received via open-url", { url })
    emitDeepLinks([url])
  })

  app.on("before-quit", (event) => {
    if (isQuitting) return
    isQuitting = true
    event.preventDefault()
    setAppQuitting()
    closeCloudAgentWindow()
    try {
      const { getVoiceBridgeModule } = require("./voice-bridge-singleton") as typeof import("./voice-bridge-singleton")
      getVoiceBridgeModule()?.stopVoiceBridge()
    } catch {}
    void stopSidecars().finally(() => {
      app.quit()
    })
  })

  app.on("will-quit", () => {
    setAppQuitting()
    try {
      const { getVoiceBridgeModule } = require("./voice-bridge-singleton") as typeof import("./voice-bridge-singleton")
      getVoiceBridgeModule()?.stopVoiceBridge()
    } catch {}
  })

  app.on("window-all-closed", () => {
    try {
      const { getVoiceBridgeModule } = require("./voice-bridge-singleton") as typeof import("./voice-bridge-singleton")
      getVoiceBridgeModule()?.stopVoiceBridge()
    } catch {}
    if (!isQuitting) {
      isQuitting = true
      app.quit()
    }
  })

  app.on("child-process-gone", (_event, details) => {
    writeLog("utility", "child process gone", { details }, "error")
  })

  app.on("render-process-gone", (_event, webContents, details) => {
    writeLog("window", "app render process gone", { url: safeWebContentsURL(webContents), details }, "error")
  })

  setRelaunchHandler(() => {
    relaunch()
  })

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      setAppQuitting()
      try {
        const { getVoiceBridgeModule } = require("./voice-bridge-singleton") as typeof import("./voice-bridge-singleton")
        getVoiceBridgeModule()?.stopVoiceBridge()
      } catch {}
      void stopSidecars().finally(() => app.exit(0))
    })
  }

  process.on("exit", () => {
    try {
      const { getVoiceBridgeModule } = require("./voice-bridge-singleton") as typeof import("./voice-bridge-singleton")
      getVoiceBridgeModule()?.stopVoiceBridge()
    } catch {}
  })

  process.on("uncaughtException", (error) => {
    writeLog("main", "uncaught exception", { error: String(error) }, "error")
    try {
      const { getVoiceBridgeModule } = require("./voice-bridge-singleton") as typeof import("./voice-bridge-singleton")
      getVoiceBridgeModule()?.stopVoiceBridge()
    } catch {}
  })

  const serverReady = Deferred.makeUnsafe<ServerReadyData, unknown>()

  yield* Effect.promise(() => app.whenReady())

  if (!TEST_ONBOARDING) migrate()
  yield* Effect.promise(() => cleanupStoreFiles(app.getPath("userData"))).pipe(
    Effect.tap((result) =>
      Effect.sync(() => {
        if (result.deleted.length === 0) return
        logger.log("cleaned scoped store files", { count: result.deleted.length, scanned: result.scanned })
      }),
    ),
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.warn("failed to clean scoped store files", error)
      }),
    ),
  )
  app.setAsDefaultProtocolClient("zyraxon")
  registerRendererProtocol()
  setDockIcon()
  const updater = setupAutoUpdater(stopSidecars)
  registerIpcHandlers({
    killSidecar: () => killSidecar(),
    relaunch,
    awaitInitialization: Effect.fnUntraced(
      function* () {
        logger.log("awaiting server ready")
        const res = yield* Deferred.await(serverReady)
        logger.log("server ready", { url: res.url })
        return res
      },
      (e) => Effect.runPromise(e),
    ),
    consumeInitialDeepLinks: () => pendingDeepLinks.splice(0),
    getDefaultServerUrl: () => getDefaultServerUrl(),
    setDefaultServerUrl: (url) => setDefaultServerUrl(url),
    isFirstLaunchOnboardingPending,
    finishFirstLaunchOnboarding,
    isOldLayoutEligible,
    getDisplayBackend: async () => null,
    setDisplayBackend: async () => undefined,
    parseMarkdown: async (markdown) => {
      const { parseMarkdown } = await import("./markdown")
      return parseMarkdown(markdown)
    },
    checkAppExists: (appName) => checkAppExists(appName),
    resolveAppPath: async (appName) => resolveAppPath(appName),
    updater,
    showUpdater: () => showUpdaterDialog(updater, true),
    setBackgroundColor: (color) => setBackgroundColor(color),
    exportDebugLogs: () => exportDebugLogs(),
    recordFatalRendererError: (error) => writeLog("renderer", "fatal renderer error", { ...error }, "error"),
  })
  registerWslIpcHandlers(wslServers)

  void updater.start()

  const updateTimer = setInterval(() => void updater.check(), 10 * 60 * 1000)
  updateTimer.unref()

  // CRITICAL: Create window FIRST, defer net log (it can hang on some systems)
  // The window must appear immediately so the renderer can show the splash screen.
  const port = yield* Effect.gen(function* () {
    const fromEnv = process.env.ZYRAXON_PORT
    if (fromEnv) {
      const parsed = Number.parseInt(fromEnv, 10)
      if (!Number.isNaN(parsed)) return parsed
    }

    const res = yield* Deferred.make<number, unknown>()
    const srv = createServer()
    srv.on("error", (e) => Deferred.failSync(res, () => e))
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address()
      if (typeof address !== "object" || !address) {
        srv.close()
        Deferred.failSync(res, () => new Error("Failed to get port"))
        return
      }
      const port = address.port
      srv.close(() => Effect.runSync(Deferred.succeed(res, port)))
    })

    return yield* Deferred.await(res)
  })
  const hostname = "127.0.0.1"
  const url = `http://${hostname}:${port}`
  const password = randomUUID()

  // ─── CRITICAL: Show UI FIRST, fork sidecar in background ──────────────
  // This is the key OpenCode pattern: restore windows immediately,
  // then fork the sidecar loading as a background fiber.
  // The renderer waits for serverReady via IPC — it does NOT block main.
  const windows = restoreMainWindows()
  if (windows.length) {
    createMenu({
      trigger: (id) => {
        const win = getLastFocusedWindow()
        if (win) sendMenuCommand(win, id)
      },
      checkForUpdates: () => {
        void showUpdaterDialog(updater, true)
      },
      relaunch: () => {
        relaunch()
      },
    })
  }

  // Fork sidecar loading — does NOT block UI
  // NOTE: Effect.forkChild does NOT run the child fiber in this environment.
  // Using plain async/await instead to ensure sidecar actually spawns.
  void (async () => {
    try {
      logger.log("sidecar connection started", { url })

      ensureLoopbackNoProxy()
      useEnvProxy()

      logger.log("spawning sidecar", { url })
      const { listener, health } = await spawnLocalServer(hostname, port, password, {
        userDataPath: app.getPath("userData"),
        onStdout: (message) => {
          console.log("[Main] Server stdout:", message)
          writeLog("server", "stdout", { message })
        },
        onStderr: (message) => {
          console.error("[Main] Server stderr:", message)
          writeLog("server", "stderr", { message }, "warn")
        },
        onExit: (code) => {
          console.error("[Main] Server exited with code:", code)
          writeLog("utility", "sidecar exited", { code }, "warn")
        },
      })
      server = listener
      setDefaultServerUrl(url)
      logger.log("sidecar spawned successfully, resolving server ready")
      Effect.runSync(Deferred.succeed(serverReady, { url, username: "zyraxon", password } as ServerReadyData))

      if (process.platform === "win32") {
        void wslServers.initialize().catch((error) => logger.error("wsl server initialization failed", error))
      }

      logger.log("waiting for sidecar health check")
      await health.wait.catch((e) => {
        console.error("[Main] Sidecar health check failed:", String(e))
        logger.error("sidecar health check failed", String(e))
      })

      logger.log("loading task finished")
    } catch (error) {
      console.error("[Main] Sidecar failed to start:", error)
      logger.error("sidecar failed to start", String(error))
      Effect.runSync(Deferred.fail(serverReady, error))
    }
  })()

  // Deferred net log — moved here so it never blocks window creation
  void (async () => {
    try {
      await startNetLog()
    } catch (e) {
      logger.warn("failed to start net log", e)
    }
  })()

  // ─── DEFERRED: All non-critical services (background, non-blocking) ────
  // These run AFTER the UI is visible. None block startup.

  // Deferred TTS — lazy start, only when first IPC request comes in
  void (async () => {
    try {
      const tts = await import("./tts-node")
      await tts.startNodeTTS()
      logger.info("TTS server auto-started on port 19810")
    } catch (e) {
      logger.warn("TTS server auto-start failed, will retry on first request", e)
    }
  })()

  // Deferred daily task scheduler
  void (async () => {
    try {
      const scheduler = await import("./daily-task-scheduler")
      scheduler.startScheduler()
      logger.info("Daily task scheduler started")
    } catch (e) {
      logger.warn("Daily task scheduler start failed", e)
    }
  })()

  // Deferred Jarvis Browser Integration — IPC handlers registered lazily
  void (async () => {
    try {
      const { registerJarvisBrowserIPC } = await import("./jarvis-browser-integration")
      registerJarvisBrowserIPC(getLastFocusedWindow())
      logger.info("Jarvis Browser integration registered")
    } catch (error) {
      logger.warn("failed to initialize Jarvis Browser", error)
    }
  })()

  // Deferred Voice Bridge — Chrome-based speech recognition
  void (async () => {
    try {
      const voiceBridge = await import("./voice-bridge")
      const { setVoiceBridgeModule } = await import("./voice-bridge-singleton")
      setVoiceBridgeModule(voiceBridge)
      voiceBridge.setRendererCallback((data) => {
        const { BrowserWindow } = require("electron") as typeof import("electron")
        const allWindows = BrowserWindow.getAllWindows()
        for (const win of allWindows) {
          if (!win.isDestroyed()) {
            try { win.webContents.send("voice-event", data) } catch {}
          }
        }
      })
      voiceBridge.startVoiceBridge()
      logger.info("Voice bridge started on port 19800")
    } catch (error) {
      logger.warn("failed to start voice bridge", error)
    }
  })()

  // Auto Python Install — ensures Python is available for touchpoint MCP
  void (async () => {
    try {
      const { ensurePython } = await import("./python-installer")
      await ensurePython()
      logger.info("Python check complete")
    } catch (error) {
      logger.warn("Python auto-install failed (MCP may not work):", error)
    }
  })()

  // Deferred MCP Config Auto-Create — async file I/O, non-blocking
  void (async () => {
    try {
      const { writeFileSync, mkdirSync, existsSync, readFileSync } = await import("node:fs")
      const { execSync: execCmd } = await import("node:child_process")
      const resourcesPath = app.isPackaged ? process.resourcesPath : join(import.meta.dirname, "..", "..", "..", "packages", "desktop", "resources")
      const jarvisMcpPath = join(resourcesPath, "jarvis-browser-mcp.cjs")
      let nodeExe = "node"
      try {
        const resolved = execCmd("where node", { encoding: "utf8", timeout: 3000 }).trim().split("\n")[0].trim()
        if (resolved && existsSync(resolved)) nodeExe = resolved
      } catch {}
      const nuphusMcpPath = join(resourcesPath, "nuphus-mcp", "nuphus-mcp.cjs")
      const touchpointMcpCjs = join(resourcesPath, "touchpoint-mcp", "touchpoint-mcp.cjs")
      const defaultConfig = {
        "$schema": "https://zyraxon.ai/config.json",
        "mcp": {
          "jarvis-browser": {
            "type": "local",
            "command": [nodeExe, jarvisMcpPath, "--headless", "--browser", "chrome", "--no-sandbox"],
            "enabled": true,
            "timeout": 30000,
            "environment": {
              "PLAYWRIGHT_MCP_HEADLESS": "true"
            }
          },
          "nuphus-desktop": {
            "type": "local",
            "command": [nodeExe, nuphusMcpPath],
            "enabled": true,
            "environment": {}
          },
          "touchpoint-mcp": {
            "type": "local",
            "command": [nodeExe, touchpointMcpCjs],
            "enabled": true,
            "timeout": 30000,
            "environment": {
              "TOUCHPOINT_MODE": "no-vision"
            }
          }
        }
      }

      const configDirs = [
        join(homedir(), ".config", "zyraxon"),
        join(homedir(), ".zyraxon"),
      ]
      for (const configDir of configDirs) {
        if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
        const configPath = join(configDir, "zyraxon.jsonc")

        if (!existsSync(configPath)) {
          writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), "utf-8")
          logger.info("created default MCP config", { path: configPath })
        } else {
          let existing = readFileSync(configPath, "utf-8")
          if (existing.charCodeAt(0) === 0xFEFF) existing = existing.slice(1)
          const parsed = JSON.parse(existing)
          let changed = false
          if (!parsed.mcp) { parsed.mcp = {} }
          // Ensure all 3 MCP servers exist
          for (const [name, def] of Object.entries(defaultConfig.mcp)) {
            if (!parsed.mcp[name]) {
              parsed.mcp[name] = def
              changed = true
              logger.info(`added ${name} to MCP config`, { path: configPath })
            }
          }
          // Fix broken paths (hardcoded or inside asar)
          for (const [name, def] of Object.entries(defaultConfig.mcp)) {
            const existingCmd = parsed.mcp[name]?.command
            if (!existingCmd) continue
            const existingPath = existingCmd[1] ?? ""
            const pathBroken = !existingPath || !existsSync(existingPath) || existingPath.includes("__RESOURCES_PATH__") || existingPath.includes("app.asar")
            if (pathBroken) {
              parsed.mcp[name].command = def.command
              if (def.environment) parsed.mcp[name].environment = def.environment
              changed = true
              logger.info(`fixed ${name} MCP config`, { path: configPath, oldPath: existingPath })
            }
          }
          if (changed) {
            writeFileSync(configPath, JSON.stringify(parsed, null, 2), "utf-8")
          }
        }
      }
    } catch (error) {
      logger.warn("failed to auto-create MCP config", error)
    }
  })()

  // Deferred Preview State File Watcher — async file reads
  void (async () => {
    try {
      const { existsSync, readFileSync } = await import("node:fs")
      const previewPath = join(homedir(), ".zyraxon", "websites", "preview-state.json")
      let lastContent = ""
      const checkPreview = () => {
        try {
          if (!existsSync(previewPath)) return
          const content = readFileSync(previewPath, "utf-8")
          if (content !== lastContent) {
            lastContent = content
            const state = JSON.parse(content) as PreviewState
            broadcastPreviewState(state)
          }
        } catch {}
      }
      const previewTimer = setInterval(checkPreview, 2000)
      previewTimer.unref()
      app.once("will-quit", () => clearInterval(previewTimer))
      checkPreview()
    } catch {}
  })()
})

Effect.runFork(main)
