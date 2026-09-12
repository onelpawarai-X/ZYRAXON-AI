import windowState from "electron-window-state"
import { resolveThemeVariant } from "@zyraxon-ai/ui/theme/resolve"
import type { DesktopTheme } from "@zyraxon-ai/ui/theme/types"
import oc2ThemeJson from "../../../ui/src/theme/themes/oc-2.json"
import { randomUUID } from "node:crypto"
import { rmSync } from "node:fs"
import { app, BrowserWindow, dialog, net, nativeImage, nativeTheme, protocol } from "electron"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { TitlebarTheme } from "../preload/types"
import { exportDebugLogs, write as writeLog } from "./logging"
import { getStore, removeStoreFile } from "./store"
import { PINCH_ZOOM_ENABLED_KEY, WINDOW_IDS_KEY } from "./store-keys"
import { createUnresponsiveSampler } from "./unresponsive"
import { createWindowRegistry } from "./window-registry"
import { safeWindowURL } from "./window-state"

const root = dirname(fileURLToPath(import.meta.url))
const rendererRoot = join(root, "../renderer")
const rendererProtocol = "oc"
const rendererHost = "renderer"
const clipboardWritePermission = "clipboard-sanitized-write"
const notificationPermission = "notifications"
const mediaPermission = "media"
const rendererPermissions = new Set([clipboardWritePermission, notificationPermission, mediaPermission])
const oc2Theme = oc2ThemeJson as DesktopTheme
const oc2Background = {
  light: resolveThemeVariant(oc2Theme.light, false)["background-base"],
  dark: resolveThemeVariant(oc2Theme.dark, true)["background-base"],
}
const documentPolicyHeader = "Document-Policy"
const jsCallStacksDocumentPolicy = "include-js-call-stacks-in-crash-reports"

protocol.registerSchemesAsPrivileged([
  {
    scheme: rendererProtocol,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

let backgroundColor: string | undefined
let relaunchHandler = () => {
  setAppQuitting()
  app.relaunch()
  app.exit(0)
}
const titlebarThemes = new WeakMap<BrowserWindow, Partial<TitlebarTheme>>()
const pinchZoomEnabled = new WeakMap<BrowserWindow, boolean>()
const windowIDs = new WeakMap<BrowserWindow, string>()
const registry = createWindowRegistry<BrowserWindow>({
  read: () => getStore().get(WINDOW_IDS_KEY),
  write: (ids) => getStore().set(WINDOW_IDS_KEY, ids),
  cleanup: (id) => {
    rmSync(join(app.getPath("userData"), windowStateFile(id)), { force: true })
  },
})
const titlebarHeight = 40
const maxZoomLevel = 10
const minZoomLevel = 0.2

export function setRelaunchHandler(handler: () => void) {
  relaunchHandler = handler
}

export function setAppQuitting(quitting = true) {
  registry.setQuitting(quitting)
}

export function setBackgroundColor(color: string) {
  backgroundColor = color
  BrowserWindow.getAllWindows().forEach((win) => {
    win.setBackgroundColor(color)
    if (process.platform === "darwin") win.invalidateShadow()
  })
}

export function getBackgroundColor(): string | undefined {
  return backgroundColor
}

function iconsDir() {
  return app.isPackaged ? join(process.resourcesPath, "icons") : join(root, "../../resources/icons")
}

function iconPath() {
  const ext = process.platform === "win32" ? "ico" : "png"
  return join(iconsDir(), `icon.${ext}`)
}

function tone() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light"
}

function defaultBackgroundColor() {
  return oc2Background[tone()]
}

function overlay(theme: Partial<TitlebarTheme> = {}, zoom = 1) {
  const mode = theme.mode ?? tone()
  return {
    color: "#00000000",
    symbolColor: mode === "dark" ? "white" : "black",
    height: Math.max(titlebarHeight, Math.round(titlebarHeight * zoom)),
  }
}

export function setTitlebar(win: BrowserWindow, theme: Partial<TitlebarTheme> = {}) {
  titlebarThemes.set(win, theme)
  // macOS draws the window frame hairline and shadow using the NSWindow
  // appearance, which follows nativeTheme rather than the rendered content.
  // Align it with the app theme so a light app on a dark system does not get
  // the dark-appearance border and shadow. A "system" scheme must map to
  // "system" (not the resolved mode) or prefers-color-scheme stops tracking
  // OS appearance changes in the renderer.
  if (process.platform === "darwin") nativeTheme.themeSource = theme.scheme ?? theme.mode ?? "system"
  updateTitlebar(win)
}

export function updateTitlebar(win: BrowserWindow) {
  if (process.platform !== "win32") return
  win.setTitleBarOverlay(overlay(titlebarThemes.get(win), win.webContents.getZoomFactor()))
}

export function setPinchZoomEnabled(enabled: boolean) {
  getStore().set(PINCH_ZOOM_ENABLED_KEY, enabled)
  for (const win of BrowserWindow.getAllWindows()) {
    pinchZoomEnabled.set(win, enabled)
    win.webContents.send("pinch-zoom-enabled-changed", enabled)
    if (!enabled && win.webContents.getZoomFactor() !== 1) win.webContents.setZoomFactor(1)
    updateZoom(win)
  }
}

export function getPinchZoomEnabled() {
  return getStore().get(PINCH_ZOOM_ENABLED_KEY) === true
}

export function getWindowID(win: BrowserWindow) {
  return windowIDs.get(win)
}

export function getLastFocusedWindow() {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused) return focused
  const win = registry.lastFocused()
  if (!win || win.isDestroyed()) return null
  return win
}

export function restoreMainWindows() {
  const ids = registry.persisted()
  return (ids.length ? ids : [randomUUID()]).map((id) => createMainWindow(id))
}

export function setDockIcon() {
  if (process.platform !== "darwin") return
  const icon = nativeImage.createFromPath(join(iconsDir(), "dock.png"))
  if (!icon.isEmpty()) app.dock?.setIcon(icon)
}

export function createMainWindow(id: string = randomUUID()) {
  const state = windowState({
    file: windowStateFile(id),
    defaultWidth: 1280,
    defaultHeight: 800,
  })

  const mode = tone()
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    show: false,
    autoHideMenuBar: true,
    title: "ZYRAXON",
    icon: iconPath(),
    backgroundColor: backgroundColor ?? defaultBackgroundColor(),
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 14, y: 14 },
        }
      : {}),
    ...(process.platform === "win32"
      ? {
          frame: false,
          titleBarStyle: "hidden" as const,
          titleBarOverlay: overlay({ mode }),
        }
      : {}),
    webPreferences: {
      preload: join(root, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  allowRendererPermissions(win)
  wireWindowRecovery(win, id)

  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    const { requestHeaders } = details
    upsertKeyValue(requestHeaders, "Access-Control-Allow-Origin", ["*"])
    callback({ requestHeaders })
  })

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const { responseHeaders = {} } = details
    addRendererHeaders(details.url, responseHeaders)
    // Enable speech recognition features for cross-origin iframes
    // The Cloud Agent iframe (zyraxon-pro.ai.studio) needs these headers
    // to allow Web Speech API to function properly
    addSpeechRecognitionHeaders(details.url, responseHeaders)
    callback({ responseHeaders })
  })

  state.manage(win)
  registerWindow(win, id)
  loadWindow(win, "index.html")
  wireZoom(win)
  injectCloudAgentSpeechBridge(win)

  win.once("ready-to-show", () => {
    win.show()
  })

  return win
}

function registerWindow(win: BrowserWindow, id: string) {
  windowIDs.set(win, id)
  registry.register(id, win)

  win.on("focus", () => registry.focused(id))
  // Windows never emits before-quit on OS shutdown/logoff, but each window
  // gets session-end before it closes; flag the quit so ids stay persisted.
  win.on("session-end", () => registry.setQuitting())
  win.on("closed", () => {
    registry.closed(id)
    try {
      const { getVoiceBridgeModule } = require("./voice-bridge-singleton") as typeof import("./voice-bridge-singleton")
      getVoiceBridgeModule()?.stopVoiceBridge()
    } catch {}
  })
}

function windowStateFile(id: string) {
  return `window-state-${id.replace(/[^a-zA-Z0-9._-]/g, "-")}.json`
}

// Mirrors windowStorage() in packages/app/src/utils/persist.ts, which names
// the per-window renderer store this window persists its tabs into.
function windowDataFile(id: string) {
  return `zyraxon.window.${id.replace(/[^a-zA-Z0-9._-]/g, "-")}.dat`
}

export function registerRendererProtocol() {
  if (protocol.isProtocolHandled(rendererProtocol)) return

  protocol.handle(rendererProtocol, async (request) => {
    const url = new URL(request.url)
    if (url.host !== rendererHost) {
      writeLog("protocol", "rejected host", { url: request.url }, "warn")
      return new Response("Not found", { status: 404 })
    }

    const file = resolve(rendererRoot, `.${decodeURIComponent(url.pathname)}`)
    const rel = relative(rendererRoot, file)
    if (rel.startsWith("..") || isAbsolute(rel)) {
      writeLog("protocol", "rejected path", { url: request.url, file }, "warn")
      return new Response("Not found", { status: 404 })
    }

    try {
      const range = request.headers.get("range")
      const response = await net.fetch(pathToFileURL(file).toString(), {
        headers: range ? { range } : undefined,
      })
      if (response.status >= 400) {
        writeLog(
          "protocol",
          "fetch failed",
          {
            url: request.url,
            file,
            status: response.status,
            statusText: response.statusText,
          },
          "error",
        )
      }
      return addDocumentPolicy(response, file)
    } catch (error) {
      writeLog("protocol", "fetch error", { url: request.url, file, error }, "error")
      return new Response("Not found", { status: 404 })
    }
  })
}

function loadWindow(win: BrowserWindow, html: string) {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    const url = new URL(html, devUrl)
    void win.loadURL(url.toString())
    return
  }

  void win.loadURL(`${rendererProtocol}://${rendererHost}/${html}`)
}

function wireWindowRecovery(win: BrowserWindow, name: string) {
  let showing = false
  const sampler = createUnresponsiveSampler(win, name)

  const handle = async (button: string | undefined, wait: boolean) => {
    if (button === "Export Logs") {
      const sampling = sampler.stopAndFlush()
      await exportDebugLogs().catch((error) => writeLog("main", "failed to export debug logs", { error }, "error"))
      if (wait && sampling) sampler.start()
      return true
    }
    if (button === "Relaunch") {
      sampler.stopAndFlush()
      relaunchHandler()
      return false
    }
    if (button === "Quit") {
      sampler.stopAndFlush()
      app.quit()
    }
    return false
  }

  const show = async (message: string, detail: string, wait: boolean) => {
    if (showing || win.isDestroyed()) return
    showing = true
    try {
      while (!win.isDestroyed()) {
        const buttons = wait ? ["Relaunch", "Export Logs", "Keep Waiting"] : ["Relaunch", "Export Logs", "Quit"]
        const result = await dialog.showMessageBox(win, {
          type: "warning",
          buttons,
          defaultId: 0,
          cancelId: 2,
          message,
          detail,
        })
        if (await handle(buttons[result.response], wait)) continue
        return
      }
    } finally {
      showing = false
    }
  }

  const failed = (
    event: string,
    errorCode: number,
    errorDescription: string,
    validatedURL: string,
    isMainFrame: boolean,
  ) => {
    writeLog(
      "window",
      "renderer load failed",
      {
        window: name,
        event,
        errorCode,
        errorDescription,
        validatedURL,
        currentURL: safeWindowURL(win),
        isMainFrame,
      },
      "error",
    )

    if (!isMainFrame || errorCode === -3) return
    void show(
      "ZYRAXON failed to load",
      [`Window: ${name}`, `URL: ${validatedURL}`, `Error: ${errorCode} ${errorDescription}`].join("\n"),
      false,
    )
  }

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    failed("did-fail-load", errorCode, errorDescription, validatedURL, isMainFrame)
  })
  win.webContents.on("did-fail-provisional-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    failed("did-fail-provisional-load", errorCode, errorDescription, validatedURL, isMainFrame)
  })
  win.webContents.on("render-process-gone", (_event, details) => {
    sampler.stopAndFlush()
    writeLog("window", "renderer process gone", { window: name, currentURL: safeWindowURL(win), details }, "error")
    void show(
      "ZYRAXON window terminated unexpectedly",
      [`Window: ${name}`, `Reason: ${details.reason}`, `Code: ${details.exitCode ?? "<unknown>"}`].join("\n"),
      false,
    )
  })
  win.on("unresponsive", () => {
    writeLog("window", "renderer unresponsive", { window: name, currentURL: safeWindowURL(win) }, "error")
    sampler.start()
    void show("ZYRAXON is not responding", "You can relaunch the app, open the logs, or keep waiting.", true)
  })
  win.on("responsive", () => {
    writeLog("window", "renderer responsive", { window: name, currentURL: safeWindowURL(win) }, "error")
    sampler.stopAndFlush()
  })
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (message.toLowerCase().includes("terminal") || sourceId.toLowerCase().includes("terminal")) {
      writeLog("pty", "console", { window: name, level, message, line, sourceId })
    }
  })
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    writeLog("preload", "preload error", { window: name, preloadPath, error }, "error")
  })
}

function addDocumentPolicy(response: Response, file: string) {
  if (!file.toLowerCase().endsWith(".html")) return response
  const headers = new Headers(response.headers)
  headers.set(documentPolicyHeader, jsCallStacksDocumentPolicy)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function allowRendererPermissions(win: BrowserWindow) {
  const rendererId = win.webContents.id

  function isChildOfRenderer(wc: Electron.WebContents): boolean {
    try {
      const parent = (wc as any).getParentWebContents?.()
      if (parent && parent.id === rendererId) return true
      if (parent) return isChildOfRenderer(parent)
    } catch {}
    return false
  }

  function isIframeOfRenderer(wc: Electron.WebContents): boolean {
    try {
      const parent = (wc as any).getParentWebContents?.()
      if (parent && parent.id === rendererId) return true
    } catch {}
    return false
  }

  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const allowed = rendererPermissions.has(permission) && (
      isTrustedRendererUrl(details.requestingUrl) ||
      webContents.id === rendererId ||
      isChildOfRenderer(webContents)
    )
    callback(allowed)
  })
  win.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (!rendererPermissions.has(permission)) return false
    return isTrustedRendererUrl(details.requestingUrl) || isTrustedRendererUrl(requestingOrigin)
  })

  // Device permission handler — grants microphone/camera access to iframes
  // This is critical for Web Speech API (SpeechRecognition) in cross-origin iframes.
  // Without this, permission is "granted" but the actual microphone device access
  // is silently denied, causing SpeechRecognition to produce no output.
  win.webContents.session.setDevicePermissionHandler((details, callback) => {
    if (details.deviceType === "microphone" || details.deviceType === "camera") {
      const url = details.requestingUrl || details.origin
      if (
        isTrustedRendererUrl(url) ||
        isRendererUrl(url) ||
        url.includes("zyraxon-pro.ai.studio") ||
        url.includes("zyraxon.ai")
      ) {
        callback(true)
        return
      }
    }
    callback(false)
  })
}

function isTrustedRendererUrl(value?: string) {
  return isRendererUrl(value)
}

function addRendererHeaders(value: string, headers: Record<string, any>) {
  upsertKeyValue(headers, "Access-Control-Allow-Origin", ["*"])
  upsertKeyValue(headers, "Access-Control-Allow-Headers", ["*"])
  if (isRendererUrl(value, true)) upsertKeyValue(headers, documentPolicyHeader, [jsCallStacksDocumentPolicy])
}

function addSpeechRecognitionHeaders(value: string, headers: Record<string, any>) {
  // Cloud Agent iframe (zyraxon-pro.ai.studio) needs these headers
  // to enable Web Speech API (SpeechRecognition) in Electron's cross-origin iframe
  if (!value || !URL.canParse(value)) return
  const url = new URL(value)
  const isCloudAgent = url.hostname.includes("zyraxon-pro.ai.studio") ||
    url.hostname.includes("zyraxon.ai")
  if (!isCloudAgent) return

  // Allow microphone access
  upsertKeyValue(headers, "Permissions-Policy", [
    "microphone=*, camera=*, geolocation=*, interest-cohort=()",
  ])
  // Remove CSP restrictions that block speech recognition
  const existingCSP = headers["Content-Security-Policy"]
  if (existingCSP) {
    // Add 'microphone' to CSP media-src directive
    const cspStr = Array.isArray(existingCSP) ? existingCSP.join(";") : String(existingCSP)
    if (!cspStr.includes("microphone")) {
      upsertKeyValue(headers, "Content-Security-Policy", [
        cspStr + "; media-src * 'unsafe-inline'; connect-src *",
      ])
    }
  }
  // Ensure CORS allows cross-origin speech recognition service
  upsertKeyValue(headers, "Access-Control-Allow-Origin", ["*"])
  upsertKeyValue(headers, "Access-Control-Allow-Methods", ["GET, POST, OPTIONS"])
  upsertKeyValue(headers, "Access-Control-Allow-Headers", ["*"])
}

function isRendererUrl(value?: string, html = false) {
  if (!value || !URL.canParse(value)) return false
  const url = new URL(value)
  if (html && !url.pathname.endsWith(".html")) return false
  if (url.protocol === `${rendererProtocol}:` && url.host === rendererHost) return true
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!devUrl || !URL.canParse(devUrl)) return false
  return url.origin === new URL(devUrl).origin
}

function wireZoom(win: BrowserWindow) {
  pinchZoomEnabled.set(win, getPinchZoomEnabled())
  win.webContents.setZoomFactor(1)
  win.webContents.on("zoom-changed", (event, zoomDirection) => {
    event.preventDefault()
    if (pinchZoomEnabled.get(win)) {
      win.webContents.setZoomFactor(clampZoom(win.webContents.getZoomFactor() + (zoomDirection === "in" ? 0.2 : -0.2)))
      updateZoom(win)
      return
    }
    if (win.webContents.getZoomFactor() !== 1) win.webContents.setZoomFactor(1)
    updateZoom(win)
  })
}

function clampZoom(value: number) {
  return Math.min(Math.max(value, minZoomLevel), maxZoomLevel)
}

function updateZoom(win: BrowserWindow) {
  updateTitlebar(win)
  win.webContents.send("zoom-factor-changed", win.webContents.getZoomFactor())
}

function upsertKeyValue(obj: Record<string, any>, keyToChange: string, value: any) {
  const keyToChangeLower = keyToChange.toLowerCase()
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === keyToChangeLower) {
      // Reassign old key
      obj[key] = value
      // Done
      return
    }
  }
  // Insert at end instead
  obj[keyToChange] = value
}

function injectCloudAgentSpeechBridge(win: BrowserWindow) {
  // This function injects a SpeechRecognition polyfill into the Cloud Agent iframe.
  // Root cause: Electron's Chromium disables Web Speech API (SpeechRecognition) in
  // cross-origin iframes. Permission is granted but the speech recognition service
  // silently fails to produce output. The bridge proxies SpeechRecognition calls
  // through the parent frame, which has full Chrome speech support.
  const CLOUD_AGENT_ORIGIN = "https://zyraxon-pro.ai.studio"

  function findIframeWebContents(): Electron.WebContents | null {
    try {
      const all = win.webContents.getAllWebContents()
      for (const wc of all) {
        if (wc.isDestroyed()) continue
        const url = wc.getURL()
        if (url && url.startsWith(CLOUD_AGENT_ORIGIN)) return wc
      }
    } catch {}
    return null
  }

  // Inject polyfill into the iframe's SpeechRecognition
  function injectPolyfill(iframeWC: Electron.WebContents) {
    const polyfillScript = `
(function() {
  if (window.__ZYRAXON_SPEECH_BRIDGE__) return;
  window.__ZYRAXON_SPEECH_BRIDGE__ = true;

  var _OrigSR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!_OrigSR) return;

  var BRIDGE_ID = 'zyraxon-cloud-agent-' + Date.now();
  var pendingCallbacks = {};
  var bridgeActive = false;

  function waitForBridge() {
    return new Promise(function(resolve) {
      if (bridgeActive) { resolve(); return; }
      var check = setInterval(function() {
        if (window.__ZYRAXON_SPEECH_READY__) {
          bridgeActive = true;
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(function() { clearInterval(check); resolve(); }, 5000);
    });
  }

  window.SpeechRecognition = function() {
    var real = new _OrigSR();
    var polyfill = {
      continuous: real.continuous,
      interimResults: real.interimResults,
      lang: real.lang,
      maxAlternatives: real.maxAlternatives || 1,
      grammars: real.grammars,
      onstart: null,
      onresult: null,
      onerror: null,
      onend: null,
      onspeechend: null,
      onsoundstart: null,
      onsoundend: null,
      onnomatch: null,
      _real: real,
      _started: false,
      start: function() {
        var self = this;
        self._started = true;
        try {
          real.continuous = self.continuous;
          real.interimResults = self.interimResults;
          real.lang = self.lang;
          real.maxAlternatives = self.maxAlternatives || 1;
          if (self.grammars) real.grammars = self.grammars;

          real.onstart = function() {
            if (self.onstart) self.onstart();
          };
          real.onresult = function(ev) {
            if (self.onresult) self.onresult(ev);
          };
          real.onerror = function(ev) {
            if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
              // Speech recognition failed in iframe — use bridge fallback
              self._startBridgeFallback();
              return;
            }
            if (self.onerror) self.onerror(ev);
          };
          real.onend = function() {
            if (!self._bridgeFallback && self.onend) self.onend();
          };
          real.onspeechend = function() {
            if (self.onspeechend) self.onspeechend();
          };
          real.onsoundstart = function() {
            if (self.onsoundstart) self.onsoundstart();
          };
          real.onsoundend = function() {
            if (self.onsoundend) self.onsoundend();
          };
          real.onnomatch = function() {
            if (self.onnomatch) self.onnomatch();
          };
          real.start();
        } catch(e) {
          self._startBridgeFallback();
        }
      },
      _startBridgeFallback: function() {
        var self = this;
        self._bridgeFallback = true;

        // Request audio from user's mic
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
          self._stream = stream;
          self._audioContext = new (window.AudioContext || window.webkitAudioContext)();
          self._source = self._audioContext.createMediaStreamSource(stream);
          self._analyser = self._audioContext.createAnalyser();
          self._analyser.fftSize = 2048;
          self._source.connect(self._analyser);

          // Start continuous audio processing
          self._processAudio();

          // Notify parent that speech recognition started
          window.parent.postMessage({
            type: 'zyraxon-speech-start',
            bridgeId: BRIDGE_ID,
            lang: self.lang || 'en-US'
          }, '*');

          if (self.onstart) self.onstart();
        }).catch(function(err) {
          if (self.onerror) self.onerror({ error: 'not-allowed', message: err.message });
        });
      },
      _processAudio: function() {
        var self = this;
        if (!self._bridgeFallback || !self._started) return;

        // Capture audio level for visual feedback
        var dataArray = new Uint8Array(self._analyser.frequencyBinCount);
        self._analyser.getByteFrequencyData(dataArray);
        var sum = 0;
        for (var i = 0; i < dataArray.length; i++) sum += dataArray[i];
        var avg = sum / dataArray.length;

        if (avg > 5 && self.onsoundstart) {
          self.onsoundstart();
        }

        self._audioFrame = requestAnimationFrame(function() {
          self._processAudio();
        });
      },
      stop: function() {
        var self = this;
        self._started = false;
        if (self._bridgeFallback) {
          if (self._stream) {
            self._stream.getTracks().forEach(function(t) { t.stop(); });
            self._stream = null;
          }
          if (self._audioContext) {
            self._audioContext.close();
            self._audioContext = null;
          }
          if (self._audioFrame) {
            cancelAnimationFrame(self._audioFrame);
            self._audioFrame = null;
          }
          window.parent.postMessage({
            type: 'zyraxon-speech-stop',
            bridgeId: BRIDGE_ID
          }, '*');
          if (self.onend) self.onend();
        } else {
          try { real.stop(); } catch(e) {}
        }
      },
      abort: function() {
        this.stop();
      }
    };

    return polyfill;
  };
  window.webkitSpeechRecognition = window.SpeechRecognition;

  // Listen for speech results from parent frame
  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.bridgeId !== BRIDGE_ID) return;
    if (ev.data.type === 'zyraxon-speech-result') {
      // Create a SpeechRecognitionEvent-like object
      var result = ev.data.result;
      if (typeof result === 'string') {
        // Final result as simple string
        var event = {
          results: [{ 0: { transcript: result, confidence: 1 }, isFinal: true, length: 1 }],
          resultIndex: 0
        };
        Object.setPrototypeOf(event, Event.prototype);
        if (window.__lastSpeechRecognition) {
          window.__lastSpeechRecognition.onresult(event);
        }
      }
    }
  });
})();
`;
    try {
      iframeWC.executeJavaScript(polyfillScript).catch(() => {})
    } catch {}
  }

  // Wait for iframe to load, then inject polyfill
  let injected = false
  function tryInject() {
    if (injected) return
    const iframeWC = findIframeWebContents()
    if (!iframeWC) return

    iframeWC.on('did-finish-load', () => {
      injectPolyfill(iframeWC)
      injected = true
    })
    // Also try injecting now if already loaded
    injectPolyfill(iframeWC)
    injected = true
  }

  // Poll for iframe webContents (it may load after the main frame)
  const pollInterval = setInterval(() => {
    tryInject()
    if (injected) clearInterval(pollInterval)
  }, 1000)

  // Clean up when window closes
  win.on('closed', () => clearInterval(pollInterval))

  // Also try on iframe navigation
  win.webContents.on('did-navigate', () => {
    injected = false
    tryInject()
  })
  win.webContents.on('did-navigate-in-page', () => {
    injected = false
    tryInject()
  })
}
