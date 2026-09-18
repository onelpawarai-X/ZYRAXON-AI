import { contextBridge, ipcRenderer, webUtils } from "electron"
import type { ElectronAPI, PreviewState, StreamState, WslServersEvent } from "./types"
import type { UpdaterState } from "@zyraxon-ai/app/updater"

const updaterCallbacks = new Set<(state: UpdaterState) => void>()
let updaterState: UpdaterState | undefined
let updaterSubscription: Promise<void> | undefined
const updaterHandler = (_: unknown, state: UpdaterState) => {
  updaterState = state
  updaterCallbacks.forEach((callback) => callback(state))
}

const api: ElectronAPI = {
  killSidecar: () => ipcRenderer.invoke("kill-sidecar"),
  installCli: () => ipcRenderer.invoke("install-cli"),
  awaitInitialization: () => ipcRenderer.invoke("await-initialization"),
  wslServers: {
    getState: () => ipcRenderer.invoke("wsl-servers-get-state"),
    subscribe: (cb) => {
      const handler = (_: unknown, event: WslServersEvent) => cb(event)
      ipcRenderer.on("wsl-servers-event", handler)
      void ipcRenderer.invoke("wsl-servers-subscribe")
      return () => {
        ipcRenderer.removeListener("wsl-servers-event", handler)
        void ipcRenderer.invoke("wsl-servers-unsubscribe")
      }
    },
    probeRuntime: () => ipcRenderer.invoke("wsl-servers-probe-runtime"),
    refreshDistros: () => ipcRenderer.invoke("wsl-servers-refresh-distros"),
    installWsl: () => ipcRenderer.invoke("wsl-servers-install-wsl"),
    installDistro: (name) => ipcRenderer.invoke("wsl-servers-install-distro", name),
    probeAddable: (distros) => ipcRenderer.invoke("wsl-servers-probe-addable", distros),
    installZyraxon: (name) => ipcRenderer.invoke("wsl-servers-install-zyraxon", name),
    openTerminal: (name) => ipcRenderer.invoke("wsl-servers-open-terminal", name),
    addServer: (distro) => ipcRenderer.invoke("wsl-servers-add", distro),
    removeServer: (id) => ipcRenderer.invoke("wsl-servers-remove", id),
    startServer: (id) => ipcRenderer.invoke("wsl-servers-start", id),
  },
  updater: {
    subscribe: async (cb) => {
      updaterCallbacks.add(cb)
      if (updaterState) cb(updaterState)
      if (!updaterSubscription) {
        ipcRenderer.on("updater-state", updaterHandler)
        updaterSubscription = ipcRenderer.invoke("updater-subscribe")
      }
      await updaterSubscription
      return () => {
        updaterCallbacks.delete(cb)
        if (updaterCallbacks.size > 0) return
        ipcRenderer.removeListener("updater-state", updaterHandler)
        updaterSubscription = undefined
        void ipcRenderer.invoke("updater-unsubscribe")
      }
    },
    check: () => ipcRenderer.invoke("updater-check"),
    install: () => ipcRenderer.invoke("updater-install"),
  },
  consumeInitialDeepLinks: () => ipcRenderer.invoke("consume-initial-deep-links"),
  getDefaultServerUrl: () => ipcRenderer.invoke("get-default-server-url"),
  setDefaultServerUrl: (url) => ipcRenderer.invoke("set-default-server-url", url),
  isFirstLaunchOnboardingPending: () => ipcRenderer.invoke("is-first-launch-onboarding-pending"),
  finishFirstLaunchOnboarding: (createDefaultProject) =>
    ipcRenderer.invoke("finish-first-launch-onboarding", createDefaultProject),
  isOldLayoutEligible: () => ipcRenderer.invoke("is-old-layout-eligible"),
  getDisplayBackend: () => ipcRenderer.invoke("get-display-backend"),
  setDisplayBackend: (backend) => ipcRenderer.invoke("set-display-backend", backend),
  parseMarkdownCommand: (markdown) => ipcRenderer.invoke("parse-markdown", markdown),
  checkAppExists: (appName) => ipcRenderer.invoke("check-app-exists", appName),
  resolveAppPath: (appName) => ipcRenderer.invoke("resolve-app-path", appName),
  storeGet: (name, key) => ipcRenderer.invoke("store-get", name, key),
  storeSet: (name, key, value) => ipcRenderer.invoke("store-set", name, key, value),
  storeDelete: (name, key) => ipcRenderer.invoke("store-delete", name, key),
  storeClear: (name) => ipcRenderer.invoke("store-clear", name),
  storeKeys: (name) => ipcRenderer.invoke("store-keys", name),
  storeLength: (name) => ipcRenderer.invoke("store-length", name),
  saveEcosystemAuth: (data) => ipcRenderer.invoke("save-ecosystem-auth", data),
  getGithubToken: () => ipcRenderer.invoke("get-github-token"),

  launchZyraxonCode: (args) => ipcRenderer.invoke("launch-zyraxon-code", args),
  launchZyraxonCodeWithFolder: (folderPath) => ipcRenderer.invoke("launch-zyraxon-code-with-folder", folderPath),
  openFolderInEditor: (folderPath) => ipcRenderer.invoke("open-folder-in-editor", folderPath),
  openFileInEditor: (filePath) => ipcRenderer.invoke("open-file-in-editor", filePath),
  getEditorStatus: () => ipcRenderer.invoke("get-editor-status"),
  getEditorProviders: () => ipcRenderer.invoke("get-editor-providers"),
  executeEditorCommand: (command, args) => ipcRenderer.invoke("execute-editor-command", command, args),
  getEditorPid: () => ipcRenderer.invoke("get-editor-pid"),
  isEditorRunning: () => ipcRenderer.invoke("is-editor-running"),
  killEditor: () => ipcRenderer.invoke("kill-editor"),

  getWindowCount: () => ipcRenderer.invoke("get-window-count"),
  getWindowID: () => ipcRenderer.invoke("get-window-id"),
  onMenuCommand: (cb) => {
    const handler = (_: unknown, id: string) => cb(id)
    ipcRenderer.on("menu-command", handler)
    return () => ipcRenderer.removeListener("menu-command", handler)
  },
  onDeepLink: (cb) => {
    const handler = (_: unknown, urls: string[]) => cb(urls)
    ipcRenderer.on("deep-link", handler)
    return () => ipcRenderer.removeListener("deep-link", handler)
  },

  openDirectoryPicker: (opts) => ipcRenderer.invoke("open-directory-picker", opts),
  openFilePicker: (opts) => ipcRenderer.invoke("open-file-picker", opts),
  readPickedFile: (token, path) => ipcRenderer.invoke("read-picked-file", token, path),
  releasePickedFiles: (token) => ipcRenderer.invoke("release-picked-files", token),
  writeFile: (path: string, content: string) => ipcRenderer.invoke("write-file", path, content),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  saveFilePicker: (opts) => ipcRenderer.invoke("save-file-picker", opts),
  openLink: (url) => ipcRenderer.send("open-link", url),
  openYouTubePlayer: (videoUrl) => ipcRenderer.invoke("open-youtube-player", videoUrl),
  ttsRestart: () => ipcRenderer.invoke("tts-restart"),
  openPath: (path, app) => ipcRenderer.invoke("open-path", path, app),
  revealPath: (path) => ipcRenderer.invoke("reveal-path", path),
  readClipboardImage: () => ipcRenderer.invoke("read-clipboard-image"),
  showNotification: (title, body) => ipcRenderer.send("show-notification", title, body),
  getWindowFocused: () => ipcRenderer.invoke("get-window-focused"),
  setWindowFocus: () => ipcRenderer.invoke("set-window-focus"),
  showWindow: () => ipcRenderer.invoke("show-window"),
  relaunch: () => ipcRenderer.send("relaunch"),
  getZoomFactor: () => ipcRenderer.invoke("get-zoom-factor"),
  setZoomFactor: (factor) => ipcRenderer.invoke("set-zoom-factor", factor),
  getPinchZoomEnabled: () => ipcRenderer.invoke("get-pinch-zoom-enabled"),
  setPinchZoomEnabled: (enabled) => ipcRenderer.invoke("set-pinch-zoom-enabled", enabled),
  onPinchZoomEnabledChanged: (cb) => {
    const handler = (_: unknown, enabled: boolean) => cb(enabled)
    ipcRenderer.on("pinch-zoom-enabled-changed", handler)
    return () => ipcRenderer.removeListener("pinch-zoom-enabled-changed", handler)
  },
  onZoomFactorChanged: (cb) => {
    const handler = (_: unknown, factor: number) => cb(factor)
    ipcRenderer.on("zoom-factor-changed", handler)
    return () => ipcRenderer.removeListener("zoom-factor-changed", handler)
  },
  setTitlebar: (theme) => ipcRenderer.invoke("set-titlebar", theme),
  runDesktopMenuAction: (action) => ipcRenderer.invoke("run-desktop-menu-action", action),
  setBackgroundColor: (color: string) => ipcRenderer.invoke("set-background-color", color),
  exportDebugLogs: () => ipcRenderer.invoke("export-debug-logs"),
  setForceFocus: (enabled) => ipcRenderer.invoke("set-force-focus", enabled),
  recordFatalRendererError: (error) => ipcRenderer.invoke("record-fatal-renderer-error", error),
  transcribeAudio: (audioBase64, mimeType) => ipcRenderer.invoke("transcribe-audio", audioBase64, mimeType),

  youtubeStreamStart: (config) => ipcRenderer.invoke("youtube-stream-start", config),
  youtubeStreamStop: () => ipcRenderer.invoke("youtube-stream-stop"),
  youtubeStreamStatus: () => ipcRenderer.invoke("youtube-stream-status"),
  youtubeStreamProbeDevices: () => ipcRenderer.invoke("youtube-stream-probe-devices"),
  onYouTubeStreamStatus: (cb) => {
    const handler = (_: unknown, state: StreamState) => cb(state)
    ipcRenderer.on("youtube-stream-status", handler)
    return () => ipcRenderer.removeListener("youtube-stream-status", handler)
  },
  onYouTubeStreamViewers: (cb) => {
    const handler = (_: unknown, count: number) => cb(count)
    ipcRenderer.on("youtube-stream-viewers", handler)
    return () => ipcRenderer.removeListener("youtube-stream-viewers", handler)
  },
  onYouTubeStreamDuration: (cb) => {
    const handler = (_: unknown, seconds: number) => cb(seconds)
    ipcRenderer.on("youtube-stream-duration", handler)
    return () => ipcRenderer.removeListener("youtube-stream-duration", handler)
  },

  getPreviewState: () => ipcRenderer.invoke("get-preview-state"),
  setPreviewState: (state) => ipcRenderer.invoke("set-preview-state", state),
  onSitePreviewUpdate: (cb) => {
    const handler = (_: unknown, state: PreviewState) => cb(state)
    ipcRenderer.on("site-preview-update", handler)
    return () => ipcRenderer.removeListener("site-preview-update", handler)
  },

  // Model Download
  downloadModel: (config) => ipcRenderer.invoke("download-model", config),
  onDownloadModelProgress: (cb) => {
    const handler = (_: unknown, progress: any) => cb(progress)
    ipcRenderer.on("download-model-progress", handler)
    return () => ipcRenderer.removeListener("download-model-progress", handler)
  },

  // Backend Manager
  backendStatus: () => ipcRenderer.invoke("backend-status"),
  backendStart: (config) => ipcRenderer.invoke("backend-start", config),
  backendStop: (type) => ipcRenderer.invoke("backend-stop", type),
  generateImage: (config) => ipcRenderer.invoke("generate-image", config),
  generateMusic: (config) => ipcRenderer.invoke("generate-music", config),
  generateTTS: (config) => ipcRenderer.invoke("generate-tts", config),
  generateVideo: (config) => ipcRenderer.invoke("generate-video", config),

  // Voice Bridge - Chrome speech → chat box
  onVoiceEvent: (cb) => {
    const handler = (_: unknown, data: any) => cb(data)
    ipcRenderer.on("voice-event", handler)
    return () => ipcRenderer.removeListener("voice-event", handler)
  },
  voiceStartListening: () => ipcRenderer.invoke("voice-start-listening"),
  voiceStopListening: () => ipcRenderer.invoke("voice-stop-listening"),
  voiceSetLanguage: (lang: string) => ipcRenderer.invoke("voice-set-language", lang),
  voiceSendText: (text: string) => ipcRenderer.invoke("voice-send-text", text),
  voiceTTSSpeak: (text: string) => ipcRenderer.send("voice-tts-speak", text),
  voiceTTSStop: () => ipcRenderer.invoke("voice-tts-stop"),
  voiceTTSEnabled: (enabled: boolean) => ipcRenderer.invoke("voice-tts-enabled", enabled),
  onVoiceTTSAudio: (callback: (buffer: ArrayBuffer) => void) => {
    const wrapper = (_event: any, buffer: ArrayBuffer) => callback(buffer)
    ipcRenderer.on("voice-tts-audio", wrapper)
    return () => { try { ipcRenderer.removeListener("voice-tts-audio", wrapper) } catch {} }
  },
  onVoiceTTSError: (callback: (error: string) => void) => {
    const wrapper = (_event: any, error: string) => callback(error)
    ipcRenderer.on("voice-tts-error", wrapper)
    return () => { try { ipcRenderer.removeListener("voice-tts-error", wrapper) } catch {} }
  },
  removeVoiceTTSAudioListener: () => {
    // Do NOT removeAllListeners — it destroys all components' audio playback
  },
  voiceSetGender: (gender: string) => ipcRenderer.invoke("voice-set-gender", gender),
  voiceGetAccumulatedTranscript: () => ipcRenderer.invoke("voice-get-accumulated-transcript"),
  voiceClearAccumulatedTranscript: () => ipcRenderer.invoke("voice-clear-accumulated-transcript"),
  voiceGetTranscriptBuffer: () => ipcRenderer.invoke("voice-get-transcript-buffer"),

  // Daily Tasks
  dailyTasksGet: () => ipcRenderer.invoke("daily-tasks:get"),
  dailyTasksSave: (tasks: any[]) => ipcRenderer.invoke("daily-tasks:save", tasks),
  dailyTasksRun: (task: any) => ipcRenderer.invoke("daily-tasks:run", task),
  onDailyTaskActivate: (cb: (data: any) => void) => {
    const handler = (_: unknown, data: any) => cb(data)
    ipcRenderer.on("daily-task:activate", handler)
    return () => ipcRenderer.removeListener("daily-task:activate", handler)
  },

  // Cloud Agent — opens in separate BrowserWindow (mic works natively)
  cloudAgentOpen: () => ipcRenderer.invoke("cloud-agent:open"),

  // Subscription sync (renderer → file → core reads)
  setSubscriptionState: (stateJson: string) => ipcRenderer.invoke("set-subscription-state", stateJson),

  // Jarvis Browser - Real Chrome automation
  jarvisBrowser: {
    init: (config?: any) => ipcRenderer.invoke("jarvis-browser:init", config),
    navigate: (url: string) => ipcRenderer.invoke("jarvis-browser:navigate", url),
    screenshot: (fullPage?: boolean) => ipcRenderer.invoke("jarvis-browser:screenshot", fullPage),
    click: (x: number, y: number) => ipcRenderer.invoke("jarvis-browser:click", x, y),
    type: (text: string) => ipcRenderer.invoke("jarvis-browser:type", text),
    evaluate: (expression: string) => ipcRenderer.invoke("jarvis-browser:evaluate", expression),
    detectCaptcha: () => ipcRenderer.invoke("jarvis-browser:detect-captcha"),
    solveCaptcha: () => ipcRenderer.invoke("jarvis-browser:solve-captcha"),
    listTabs: () => ipcRenderer.invoke("jarvis-browser:list-tabs"),
    createTab: (url?: string) => ipcRenderer.invoke("jarvis-browser:create-tab", url),
    closeTab: (tabId: string) => ipcRenderer.invoke("jarvis-browser:close-tab", tabId),
    fillForm: (selector: string, value: string) => ipcRenderer.invoke("jarvis-browser:fill-form", selector, value),
    getElement: (x: number, y: number) => ipcRenderer.invoke("jarvis-browser:get-element", x, y),
    listProfiles: () => ipcRenderer.invoke("jarvis-browser:list-profiles"),
    switchProfile: (profileDir: string) => ipcRenderer.invoke("jarvis-browser:switch-profile", profileDir),
    pinTab: (url: string, title?: string) => ipcRenderer.invoke("jarvis-browser:pin-tab", url, title),
    listOpenTabs: () => ipcRenderer.invoke("jarvis-browser:list-open-tabs"),
    switchTab: (targetId: string) => ipcRenderer.invoke("jarvis-browser:switch-tab", targetId),
    clickCaptcha: () => ipcRenderer.invoke("jarvis-browser:click-captcha"),
    destroy: () => ipcRenderer.invoke("jarvis-browser:destroy"),
  },
}

// Inject token for ecosystem marketplace access
;(async () => {
  try {
    const token = await ipcRenderer.invoke("get-github-token")
    if (token) {
      (window as any).__ZYRAXON_CONFIG__ = { token }
    }
  } catch {}
})()

contextBridge.exposeInMainWorld("api", api)
