import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js"
import type * as Monaco from "monaco-editor"
import { useTheme } from "@zyraxon-ai/ui/theme/context"
import { useSettings } from "@/context/settings"
import { CodeGuardianScanner, CodeGuardianAIFeedback, type CodeIssue } from "./code-guardian"
import {
  MonacoAIAssistant,
  ScanningAnimator,
  injectAIAssistantStyles,
  type GenerateOptions,
} from "./monaco-ai-assistant"

let monacoCssLoaded = false
function loadMonacoCss() {
  if (monacoCssLoaded) return
  monacoCssLoaded = true
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = new URL("monaco-editor/min/vs/editor/editor.main.css", import.meta.url).href
  document.head.appendChild(link)
}

let workersConfigured = false
function configureMonacoWorkers() {
  if (workersConfigured) return
  workersConfigured = true
  ;(window as any).MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      const getWorkerModule = (moduleUrl: string) => {
        return new Worker(new URL(moduleUrl, import.meta.url), { type: "module" })
      }
      switch (label) {
        case "json":
          return getWorkerModule("monaco-editor/esm/vs/language/json/json.worker?worker")
        case "css":
        case "scss":
        case "less":
          return getWorkerModule("monaco-editor/esm/vs/language/css/css.worker?worker")
        case "html":
        case "handlebars":
        case "razor":
          return getWorkerModule("monaco-editor/esm/vs/language/html/html.worker?worker")
        case "typescript":
        case "javascript":
          return getWorkerModule("monaco-editor/esm/vs/language/typescript/ts.worker?worker")
        default:
          return getWorkerModule("monaco-editor/esm/vs/editor/editor.worker?worker")
      }
    },
  }
}

export interface MonacoEditorProps {
  value: string
  language?: string
  theme?: string
  readOnly?: boolean
  onChange?: (value: string) => void
  onSave?: (value: string) => void
  path?: string
  height?: string
  class?: string
}

export function MonacoEditor(props: MonacoEditorProps) {
  const theme = useTheme()
  const settings = useSettings()
  let containerRef: HTMLDivElement | undefined
  let editor: Monaco.editor.IStandaloneCodeEditor | undefined
  let monaco: typeof import("monaco-editor") | undefined
  let isSyncing = false
  let lastSyncedValue: string | undefined
  let userHasEdited = false
  let scanDebounce: ReturnType<typeof setTimeout> | null = null
  let userEditDebounce: ReturnType<typeof setTimeout> | null = null

  const [aiGenerating, setAiGenerating] = createSignal(false)
  const [activePrompt, setActivePrompt] = createSignal<string | null>(null)

  const aiAssistant = new MonacoAIAssistant()
  const scanningAnimator = new ScanningAnimator()
  const guardian = new CodeGuardianScanner()
  const feedback = new CodeGuardianAIFeedback()
  let tokenBuffer = ""
  let streamingDebounce: ReturnType<typeof setTimeout> | null = null
  let widgetDisposable: Monaco.editor.IEditorDecorationsCollection | null = null
  let inlineChatWidget: Monaco.editor.IContentWidget | null = null
  let inlineChatLine: number | null = null
  let mouseDownDisposable: Monaco.IDisposable | null = null


  const getTheme = () => {
    if (props.theme) return props.theme
    if (typeof document !== "undefined") {
      return document.documentElement.dataset.colorScheme === "dark" ? "zyraxon-dark" : "zyraxon-light"
    }
    return "zyraxon-dark"
  }

  // ═══════════════════════════════════════════════════════════════
  // INLINE AI CHAT BOX — click line number → type → AI generates
  // ═══════════════════════════════════════════════════════════════
  const showInlineChat = (lineNumber: number) => {
    if (!editor || !monaco) return
    if (aiGenerating()) return
    removeInlineChat()

    inlineChatLine = lineNumber
    const isDark = document.documentElement.dataset.colorScheme === "dark"
    const bg = isDark ? "#0d0d1a" : "#ffffff"
    const border = isDark ? "rgba(0,255,136,0.25)" : "rgba(0,180,100,0.3)"
    const text = isDark ? "#e4e4ed" : "#1a1a2e"
    const text2 = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"
    const inputBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"
    const accent = "#00ff88"
    const accent2 = "#00ccff"
    const currentVoiceLang = settings.general.voiceLanguage() || "en-US"

    const domNode = document.createElement("div")
    domNode.style.cssText = `
      width: 460px; padding: 10px 12px;
      background: ${bg}; border: 1px solid ${border};
      border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      z-index: 20; display: flex; flex-direction: column; gap: 8px;
      animation: slideDown 0.2s ease-out;
    `
    domNode.innerHTML = `
      <style>
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .aic-row { display: flex; align-items: center; gap: 6px; }
        .aic-icon { width: 16px; height: 16px; flex-shrink: 0; }
        .aic-label { color: ${accent}; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
        .aic-select { padding: 4px 8px; border-radius: 6px; border: 1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"};
          background: ${inputBg}; color: ${text}; font-size: 11px; outline: none; cursor: pointer;
          font-family: inherit; appearance: none; -webkit-appearance: none; min-width: 110px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6' fill='none' stroke='${encodeURIComponent(text2)}' stroke-width='1.5'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 6px center; padding-right: 22px; }
        .aic-btn { padding: 5px 8px; border-radius: 6px; border: 1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"};
          background: transparent; color: ${text2}; cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; }
        .aic-btn:hover { border-color: ${accent}; color: ${accent}; background: rgba(0,255,136,0.05); }
        .aic-btn svg { width: 14px; height: 14px; fill: currentColor; }
        .aic-input { flex: 1; padding: 7px 10px; border-radius: 8px; border: 1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"};
          background: ${inputBg}; color: ${text}; font-size: 12px; outline: none; font-family: inherit; }
        .aic-input:focus { border-color: ${accent}; box-shadow: 0 0 0 2px rgba(0,255,136,0.1); }
        .aic-send { padding: 6px 16px; border-radius: 8px; border: none;
          background: linear-gradient(135deg,${accent},${accent2}); color: #000; font-size: 11px;
          font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .aic-send:hover { transform: scale(1.03); box-shadow: 0 2px 12px rgba(0,255,136,0.3); }
        .aic-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .aic-cancel { padding: 6px 12px; border-radius: 8px; border: 1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"};
          background: transparent; color: ${text2}; font-size: 11px; cursor: pointer; }
        .aic-cancel:hover { border-color: #ef4444; color: #ef4444; }
        .aic-err { font-size: 11px; color: #ff6b6b; padding: 4px 0; }
      </style>
      <div class="aic-row">
        <svg class="aic-icon" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
        <span class="aic-label">AI GENERATE</span>
        <div style="flex:1"></div>
        <select class="aic-select" id="aic-model"><option value="auto">Loading models...</option></select>
        <select class="aic-select" id="aic-lang">
          <option value="auto" ${currentVoiceLang === "auto" ? "selected" : ""}>Auto Detect</option>
          <option value="en-US" ${currentVoiceLang === "en-US" ? "selected" : ""}>English</option>
          <option value="bn-BD" ${currentVoiceLang === "bn-BD" ? "selected" : ""}>Bengali</option>
          <option value="hi-IN" ${currentVoiceLang === "hi-IN" ? "selected" : ""}>Hindi</option>
          <option value="ar-SA" ${currentVoiceLang === "ar-SA" ? "selected" : ""}>Arabic</option>
          <option value="fr-FR" ${currentVoiceLang === "fr-FR" ? "selected" : ""}>French</option>
          <option value="de-DE" ${currentVoiceLang === "de-DE" ? "selected" : ""}>German</option>
          <option value="es-ES" ${currentVoiceLang === "es-ES" ? "selected" : ""}>Spanish</option>
          <option value="ru-RU" ${currentVoiceLang === "ru-RU" ? "selected" : ""}>Russian</option>
          <option value="ja-JP" ${currentVoiceLang === "ja-JP" ? "selected" : ""}>Japanese</option>
          <option value="ko-KR" ${currentVoiceLang === "ko-KR" ? "selected" : ""}>Korean</option>
          <option value="zh-CN" ${currentVoiceLang === "zh-CN" ? "selected" : ""}>Chinese</option>
          <option value="pt-BR" ${currentVoiceLang === "pt-BR" ? "selected" : ""}>Portuguese</option>
          <option value="it-IT" ${currentVoiceLang === "it-IT" ? "selected" : ""}>Italian</option>
          <option value="tr-TR" ${currentVoiceLang === "tr-TR" ? "selected" : ""}>Turkish</option>
          <option value="th-TH" ${currentVoiceLang === "th-TH" ? "selected" : ""}>Thai</option>
          <option value="pl-PL" ${currentVoiceLang === "pl-PL" ? "selected" : ""}>Polish</option>
          <option value="nl-NL" ${currentVoiceLang === "nl-NL" ? "selected" : ""}>Dutch</option>
          <option value="vi-VN" ${currentVoiceLang === "vi-VN" ? "selected" : ""}>Vietnamese</option>
          <option value="uk-UA" ${currentVoiceLang === "uk-UA" ? "selected" : ""}>Ukrainian</option>
          <option value="sv-SE" ${currentVoiceLang === "sv-SE" ? "selected" : ""}>Swedish</option>
          <option value="da-DK" ${currentVoiceLang === "da-DK" ? "selected" : ""}>Danish</option>
          <option value="fi-FI" ${currentVoiceLang === "fi-FI" ? "selected" : ""}>Finnish</option>
          <option value="nb-NO" ${currentVoiceLang === "nb-NO" ? "selected" : ""}>Norwegian</option>
          <option value="cs-CZ" ${currentVoiceLang === "cs-CZ" ? "selected" : ""}>Czech</option>
          <option value="ro-RO" ${currentVoiceLang === "ro-RO" ? "selected" : ""}>Romanian</option>
          <option value="el-GR" ${currentVoiceLang === "el-GR" ? "selected" : ""}>Greek</option>
          <option value="he-IL" ${currentVoiceLang === "he-IL" ? "selected" : ""}>Hebrew</option>
          <option value="hu-HU" ${currentVoiceLang === "hu-HU" ? "selected" : ""}>Hungarian</option>
          <option value="id-ID" ${currentVoiceLang === "id-ID" ? "selected" : ""}>Indonesian</option>
          <option value="ms-MY" ${currentVoiceLang === "ms-MY" ? "selected" : ""}>Malay</option>
          <option value="ta-IN" ${currentVoiceLang === "ta-IN" ? "selected" : ""}>Tamil</option>
          <option value="te-IN" ${currentVoiceLang === "te-IN" ? "selected" : ""}>Telugu</option>
          <option value="mr-IN" ${currentVoiceLang === "mr-IN" ? "selected" : ""}>Marathi</option>
          <option value="gu-IN" ${currentVoiceLang === "gu-IN" ? "selected" : ""}>Gujarati</option>
          <option value="kn-IN" ${currentVoiceLang === "kn-IN" ? "selected" : ""}>Kannada</option>
          <option value="ml-IN" ${currentVoiceLang === "ml-IN" ? "selected" : ""}>Malayalam</option>
          <option value="ur-PK" ${currentVoiceLang === "ur-PK" ? "selected" : ""}>Urdu</option>
          <option value="fa-IR" ${currentVoiceLang === "fa-IR" ? "selected" : ""}>Persian</option>
          <option value="sw-KE" ${currentVoiceLang === "sw-KE" ? "selected" : ""}>Swahili</option>
          <option value="af-ZA" ${currentVoiceLang === "af-ZA" ? "selected" : ""}>Afrikaans</option>
        </select>
      </div>
      <div class="aic-row">
        <input type="text" class="aic-input" id="aic-input" placeholder="Type what AI should do..." />
        <button class="aic-btn" id="aic-mic" title="Voice input">
          <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
        </button>
      </div>
      <div class="aic-row" style="justify-content:flex-end;gap:6px;">
        <button class="aic-cancel" id="aic-cancel">Esc</button>
        <button class="aic-send" id="aic-send">Generate</button>
      </div>
    `

    const input = domNode.querySelector("#aic-input") as HTMLInputElement
    const cancelBtn = domNode.querySelector("#aic-cancel") as HTMLButtonElement
    const sendBtn = domNode.querySelector("#aic-send") as HTMLButtonElement
    const micBtn = domNode.querySelector("#aic-mic") as HTMLButtonElement
    const modelSelect = domNode.querySelector("#aic-model") as HTMLSelectElement
    const langSelect = domNode.querySelector("#aic-lang") as HTMLSelectElement

    // ── Dynamic model loading: fetch free models from opencode provider directly ──
    aiAssistant.listAvailableModels().then((models) => {
      modelSelect.innerHTML = ""
      const autoOpt = document.createElement("option")
      autoOpt.value = "auto"
      autoOpt.textContent = `Auto (Free — ${models.length} models)`
      modelSelect.appendChild(autoOpt)
      for (const m of models) {
        const opt = document.createElement("option")
        opt.value = m.id
        // Show short name: "opencode/big-pickle" → "Big Pickle"
        const shortName = m.id.includes("/") ? m.id.split("/").pop()! : m.id
        opt.textContent = shortName
        opt.title = m.id
        modelSelect.appendChild(opt)
      }
      console.log("[Monaco] Loaded", models.length, "free models from opencode provider")
    }).catch((err) => {
      console.error("[Monaco] Failed to load models from provider:", err)
      modelSelect.innerHTML = '<option value="auto">Auto (Free)</option>'
      const errDiv = document.createElement("div")
      errDiv.className = "aic-err"
      errDiv.textContent = `Models unavailable: ${err.message || err}`
      domNode.appendChild(errDiv)
      setTimeout(() => errDiv.remove(), 5000)
    })

    // Stop ALL events from propagating to Monaco editor (bubble phase — allows buttons/selects to work)
    const stopAll = (e: Event) => { e.stopPropagation() }
    domNode.addEventListener("mousedown", stopAll)
    domNode.addEventListener("mouseup", stopAll)
    domNode.addEventListener("click", stopAll)
    domNode.addEventListener("dblclick", stopAll)
    domNode.addEventListener("keydown", stopAll)
    domNode.addEventListener("keyup", stopAll)
    domNode.addEventListener("keypress", stopAll)
    domNode.addEventListener("contextmenu", stopAll)

    let mediaRecorder: MediaRecorder | null = null
    let audioChunks: Blob[] = []
    let audioStream: MediaStream | null = null
    let micRecordingActive = false
    let micRecordingTimer: ReturnType<typeof setInterval> | null = null
    let micRecordingSeconds = 0
    const cleanupMediaRecorder = () => {
      if (micRecordingTimer) { clearInterval(micRecordingTimer); micRecordingTimer = null }
      if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); audioStream = null }
      mediaRecorder = null; audioChunks = []; micRecordingActive = false; micRecordingSeconds = 0
    }
    const stopAllMic = () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try { mediaRecorder.stop() } catch {}
      }
      cleanupMediaRecorder()
      micBtn.style.color = ""
      micBtn.title = "Voice input"
    }
    const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve((reader.result as string).split(",")[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    micBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      if (micRecordingActive) {
        stopAllMic()
        return
      }
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } }).then(stream => {
        audioStream = stream
        audioChunks = []
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/wav"
        mediaRecorder = new MediaRecorder(stream, { mimeType })
        mediaRecorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunks.push(ev.data) }
        mediaRecorder.onstop = async () => {
          try {
            const blob = new Blob(audioChunks, { type: mimeType })
            const base64 = await blobToBase64(blob)
            const api = (window as any).api
            if (api?.transcribeAudio) {
              const text = await api.transcribeAudio(base64, mimeType)
              if (text && text.trim()) input.value = text.trim()
            }
          } catch (err: any) {
            console.error("[Monaco Mic] Transcription error:", err)
            const warn = document.createElement("div")
            warn.className = "aic-err"
            warn.textContent = `Mic error: ${err.message || "transcription failed"}`
            domNode.appendChild(warn)
            setTimeout(() => warn.remove(), 3000)
          } finally {
            cleanupMediaRecorder()
            micBtn.style.color = ""
            micBtn.title = "Voice input"
          }
        }
        mediaRecorder.onerror = () => { cleanupMediaRecorder(); micBtn.style.color = ""; micBtn.title = "Voice input" }
        mediaRecorder.start(250)
        micRecordingActive = true
        micBtn.style.color = accent
        micBtn.title = "Click to stop recording"
        micRecordingSeconds = 0
        micRecordingTimer = setInterval(() => { micRecordingSeconds++; micBtn.title = `Recording ${micRecordingSeconds}s — Click to stop` }, 1000)
      }).catch((err: any) => {
        const warn = document.createElement("div")
        warn.className = "aic-err"
        warn.textContent = err.name === "NotAllowedError" ? "Mic access denied" : `Mic failed: ${err.message || err}`
        domNode.appendChild(warn)
        setTimeout(() => warn.remove(), 3000)
      })
    })

    input.addEventListener("keydown", (e) => {
      e.stopPropagation()
      if (e.key === "Enter" && !e.shiftKey && input.value.trim()) {
        stopAllMic()
        executeInlineChat(lineNumber, input.value.trim(), modelSelect.value)
      }
      if (e.key === "Escape") {
        stopAllMic()
        removeInlineChat()
        editor!.focus()
      }
    })
    input.addEventListener("mousedown", (e) => e.stopPropagation())
    input.addEventListener("focus", (e) => e.stopPropagation())
    cancelBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      stopAllMic()
      removeInlineChat(); editor!.focus()
    })
    sendBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      stopAllMic()
      if (input.value.trim()) executeInlineChat(lineNumber, input.value.trim(), modelSelect.value)
    })

    inlineChatWidget = {
      getId: () => `ai-inline-chat-${lineNumber}`,
      getDomNode: () => domNode,
      getPosition: () => ({
        position: { lineNumber: lineNumber + 1, column: 1 },
        preference: [monaco!.editor.ContentWidgetPositionPreference.BELOW],
      }),
    }
    editor.addContentWidget(inlineChatWidget)
    setTimeout(() => input.focus(), 50)
  }

  const removeInlineChat = () => {
    if (editor && inlineChatWidget) {
      editor.removeContentWidget(inlineChatWidget)
      inlineChatWidget = null
      inlineChatLine = null
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // EXECUTE INLINE CHAT — Stream code rewrite
  // ═══════════════════════════════════════════════════════════════
  const executeInlineChat = async (lineNumber: number, prompt: string, modelOverride?: string) => {
    removeInlineChat()
    if (aiGenerating()) return

    const currentCode = editor?.getValue() || ""
    const language = props.language || "typescript"
    const selectedModel = modelOverride && modelOverride !== "auto" ? modelOverride : undefined

    console.log("[Monaco] Generate: prompt=", prompt, " model=", selectedModel || "auto", " line=", lineNumber)

    setAiGenerating(true)
    setActivePrompt(prompt)

    // Start scanning animation on all lines
    try {
      const totalLines = editor?.getModel()?.getLineCount() || 1
      scanningAnimator.start(editor!, 1, totalLines)
    } catch {}

    const options: GenerateOptions = {
      prompt,
      language,
      existingCode: currentCode,
      fileName: props.path,
      instruction: "generate",
      modelId: selectedModel,
    }

    tokenBuffer = ""
    isSyncing = true

    // Safety timeout — if generation hangs, force-reset after 90 seconds
    const safetyTimeout = setTimeout(() => {
      if (aiGenerating()) {
        console.warn("[Monaco] AI generation timed out after 90s, forcing reset")
        aiAssistant.cancel()
        scanningAnimator.stop()
        setAiGenerating(false)
        setActivePrompt(null)
        isSyncing = true
        editor?.setValue(currentCode)
        isSyncing = false
      }
    }, 90000)

    await aiAssistant.generateCode(options, {
      onStart: () => {
        console.log("[Monaco] Generation started")
      },
      onToken: (_token, fullCode) => {
        if (!editor) return
        tokenBuffer = fullCode
        if (streamingDebounce) clearTimeout(streamingDebounce)
        streamingDebounce = setTimeout(() => {
          if (!editor) return
          isSyncing = true
          editor.setValue(tokenBuffer)
          isSyncing = false
          props.onChange?.(tokenBuffer)
          const lineCount = editor.getModel()?.getLineCount() || 0
          editor.revealLine(lineCount)
        }, 16)
      },
      onComplete: (fullCode) => {
        clearTimeout(safetyTimeout)
        scanningAnimator.stop()
        if (streamingDebounce) clearTimeout(streamingDebounce)
        if (!editor) return
        const finalCode = fullCode?.trim() ? fullCode : currentCode
        console.log("[Monaco] Generation complete, code length:", finalCode.length)
        // Animate: apply final code with typewriter-like reveal
        isSyncing = true
        editor.setValue(finalCode)
        isSyncing = false
        props.onChange?.(finalCode)
        setAiGenerating(false)
        setActivePrompt(null)
        if (fullCode?.trim()) {
          runGuardianScan(finalCode)
          props.onSave?.(finalCode)
        }
      },
      onError: (error) => {
        console.error("[Monaco] AI generation error:", error)
        clearTimeout(safetyTimeout)
        scanningAnimator.stop()
        if (streamingDebounce) clearTimeout(streamingDebounce)
        setAiGenerating(false)
        setActivePrompt(null)
        isSyncing = false
        // Show prominent error — toast + inline widget
        try {
          // Flash the error in editor
          if (editor && monaco) {
            const errorWidget = {
              getId: () => `ai-error-${Date.now()}`,
              getDomNode: () => {
                const node = document.createElement("div")
                node.style.cssText = "width:420px;padding:12px 16px;background:#2d1b1b;border:1px solid #ff4444;border-radius:10px;color:#ff6b6b;font-size:12px;font-family:inherit;box-shadow:0 4px 20px rgba(255,0,0,0.3);line-height:1.5;"
                node.innerHTML = `<b>AI Generation Failed</b><br/>${error.message || "Unknown error"}<br/><span style="font-size:10px;opacity:0.6">Check that opencode provider is configured and the model is available.</span>`
                setTimeout(() => { try { editor.removeContentWidget(errorWidget) } catch {} }, 8000)
                return node
              },
              getPosition: () => ({
                position: { lineNumber: Math.min((editor.getModel()?.getLineCount() || 1) + 1, 999), column: 1 },
                preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
              }),
            }
            editor.addContentWidget(errorWidget)
          }
        } catch {}
      },
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // CODE GUARDIAN
  // ═══════════════════════════════════════════════════════════════
  const runGuardianScan = (code: string) => {
    const model = editor?.getModel()
    if (!model) return
    const filePath = model.uri.path || "untitled"
    const result = guardian.scan(filePath, code)
    const markers: Monaco.editor.IMarkerData[] = result.issues.map((issue: CodeIssue) => ({
      severity: issue.severity === "error" ? monaco!.MarkerSeverity.Error :
                issue.severity === "warning" ? monaco!.MarkerSeverity.Warning :
                monaco!.MarkerSeverity.Info,
      message: issue.message,
      startLineNumber: issue.line,
      startColumn: issue.column,
      endLineNumber: issue.endLine,
      endColumn: issue.endColumn,
      source: `Code Guardian [${issue.ruleId}]`,
      tags: issue.severity === "error" ? [monaco!.MarkerTag.Unnecessary] : undefined,
    }))
    monaco!.editor.setModelMarkers(model, "code-guardian", markers)
    for (const issue of result.issues) {
      if (issue.severity === "error") {
        feedback.signalError(issue, filePath, code)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MONACO MOUNT
  // ═══════════════════════════════════════════════════════════════
  onMount(async () => {
    if (!containerRef) return

    loadMonacoCss()
    configureMonacoWorkers()
    injectAIAssistantStyles()
    const monacoModule = await import("monaco-editor")
    monaco = monacoModule

    monaco.editor.defineTheme("zyraxon-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6A9955", fontStyle: "italic" },
        { token: "keyword", foreground: "569CD6" },
        { token: "string", foreground: "CE9178" },
        { token: "number", foreground: "B5CEA8" },
        { token: "type", foreground: "4EC9B0" },
        { token: "function", foreground: "DCDCAA" },
        { token: "variable", foreground: "9CDCFE" },
        { token: "operator", foreground: "D4D4D4" },
      ],
      colors: {
        "editor.background": "#0d1117",
        "editor.foreground": "#c9d1d9",
        "editor.lineHighlightBackground": "#161b2280",
        "editor.selectionBackground": "#264f7860",
        "editorCursor.foreground": "#58a6ff",
        "editorLineNumber.foreground": "#484f58",
        "editorLineNumber.activeForeground": "#c9d1d9",
        "editor.selectionHighlightBackground": "#264f7840",
        "editorIndentGuide.background": "#21262d",
        "editorIndentGuide.activeBackground": "#30363d",
        "editorGutter.background": "#0d1117",
        "minimap.background": "#0d1117",
        "scrollbarSlider.background": "#484f5833",
        "scrollbarSlider.hoverBackground": "#484f5844",
        "scrollbarSlider.activeBackground": "#484f5888",
      },
    })

    monaco.editor.defineTheme("zyraxon-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "008000", fontStyle: "italic" },
        { token: "keyword", foreground: "0000FF" },
        { token: "string", foreground: "A31515" },
        { token: "number", foreground: "098658" },
        { token: "type", foreground: "267F99" },
        { token: "function", foreground: "795E26" },
        { token: "variable", foreground: "001080" },
        { token: "operator", foreground: "000000" },
      ],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#000000",
        "editor.lineHighlightBackground": "#f5f5f5",
        "editor.selectionBackground": "#add6ff",
        "editorCursor.foreground": "#000000",
        "editorLineNumber.foreground": "#237893",
        "editorLineNumber.activeForeground": "#000000",
        "editor.selectionHighlightBackground": "#add6ff40",
        "editorIndentGuide.background": "#d3d3d3",
        "editorIndentGuide.activeBackground": "#939393",
        "editorGutter.background": "#ffffff",
        "minimap.background": "#ffffff",
        "scrollbarSlider.background": "#00000022",
        "scrollbarSlider.hoverBackground": "#00000033",
        "scrollbarSlider.activeBackground": "#00000044",
      },
    })

    containerRef.addEventListener("keydown", (e) => {
      const isEditorShortcut = (e.ctrlKey || e.metaKey) && ["z", "y", "x", "v", "c", "a"].includes(e.key.toLowerCase())
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s"
      const isEditorKey = ["Delete", "Backspace", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key)
      const isRedoAlt = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z"
      if (isEditorShortcut || isSave || isEditorKey || isRedoAlt || e.key.length > 1) return
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) return
      e.stopPropagation()
    }, true)

    editor = monaco.editor.create(containerRef, {
      value: props.value,
      language: props.language || "plaintext",
      theme: getTheme(),
      readOnly: props.readOnly ?? false,
      minimap: { enabled: true },
      fontSize: 14,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: "on",
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      renderLineHighlight: "all",
      bracketPairColorization: { enabled: true },
      padding: { top: 12, bottom: 12 },
      folding: true,
      formatOnPaste: true,
      formatOnType: true,
      copyWithSyntaxHighlighting: true,
      multiCursorModifier: "ctrlCmd",
      wordBasedSuggestions: "allDocuments",
      suggest: {
        showMethods: true,
        showFunctions: true,
        showConstructors: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showKeywords: true,
        showWords: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true,
        showTypeParameters: true,
        showSnippets: true,
      },
    })

    editor.onDidChangeModelContent(() => {
      if (isSyncing) return
      userHasEdited = true
      const value = editor?.getValue() || ""
      props.onChange?.(value)
      if (userEditDebounce) clearTimeout(userEditDebounce)
      userEditDebounce = setTimeout(() => { userHasEdited = false }, 1000)
    })

    // Double-click handler via Monaco's own event system (DOM bubbling is blocked by Monaco internals)
    mouseDownDisposable = editor.onMouseDown((e) => {
      if (aiGenerating()) return
      if (e.event.detail !== 2) return
      let lineNumber = e.target.position?.lineNumber
      if (!lineNumber) {
        try {
          const editorRect = containerRef!.getBoundingClientRect()
          const mouseY = e.event.clientY - editorRect.top
          const scrollTop = editor.getScrollTop()
          const layoutInfo = editor.getLayoutInfo()
          const lineHeight = editor.getOption(monaco!.editor.EditorOption.lineHeight) || 20
          lineNumber = Math.floor((mouseY + scrollTop - layoutInfo.paddingTop) / lineHeight) + 1
        } catch {}
      }
      if (lineNumber && lineNumber > 0) {
        showInlineChat(lineNumber)
      }
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const value = editor?.getValue() || ""
      props.onSave?.(value)
      runGuardianScan(value)
    })

    editor.focus()

    // Hover provider
    monaco.languages.registerHoverProvider(props.language || "typescript", {
      provideHover: (model: any, position: any) => {
        const line = model.getLineContent(position.lineNumber)
        const result = guardian.scan(model.uri.path || "", line)
        const issue = result.issues.find(
          (i: CodeIssue) => i.line === position.lineNumber && i.column <= position.column && i.endColumn >= position.column
        )
        if (!issue) return null
        return {
          range: new monaco!.Range(issue.line, issue.column, issue.endLine, issue.endColumn),
          contents: [
            { value: `**Code Guardian** — \`${issue.ruleId}\`` },
            { value: issue.message },
            { value: `**Category:** ${issue.category}\n\n**Suggestion:** ${issue.suggestion}` },
          ],
        }
      },
    })

    // Code actions
    monaco.languages.registerCodeActionProvider(props.language || "typescript", {
      provideCodeActions: (model: any, range: any) => {
        const code = model.getValue()
        const result = guardian.scan(model.uri.path || "", code)
        const actions: any[] = []
        for (const issue of result.issues) {
          if (issue.line >= range.startLineNumber && issue.line <= range.endLineNumber) {
            actions.push({
              title: `Fix: ${issue.ruleId}`,
              kind: "quickfix",
              diagnostics: [{
                severity: issue.severity === "error" ? monaco!.MarkerSeverity.Error : monaco!.MarkerSeverity.Warning,
                message: issue.message,
                range: new monaco!.Range(issue.line, issue.column, issue.endLine, issue.endColumn),
              }],
              edit: {
                edits: [{
                  resource: model.uri,
                  edit: {
                    range: new monaco!.Range(issue.line, issue.column, issue.endLine, issue.endColumn),
                    text: issue.suggestion,
                  },
                }],
              },
            })
          }
        }
        return { actions, dispose: () => {} }
      },
    })
  })

  createEffect(() => {
    if (!editor || !monaco) return
    const mode = theme.mode()
    const newTheme = mode === "dark" ? "zyraxon-dark" : "zyraxon-light"
    monaco.editor.setTheme(newTheme)
    editor.updateOptions({
      theme: newTheme,
    })
  })

  const handleClick = () => {
    editor?.focus()
  }

  createEffect(() => {
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (model && props.language) {
      monaco.editor.setModelLanguage(model, props.language)
    }
  })

  createEffect(() => {
    if (!editor) return
    const newValue = props.value
    if (userHasEdited) return
    const currentValue = editor.getValue()
    if (newValue !== currentValue) {
      isSyncing = true
      lastSyncedValue = newValue
      editor.setValue(newValue)
      isSyncing = false
    }
  })

  onCleanup(() => {
    if (scanDebounce) clearTimeout(scanDebounce)
    if (userEditDebounce) clearTimeout(userEditDebounce)
    if (streamingDebounce) clearTimeout(streamingDebounce)
    widgetDisposable?.clear()
    mouseDownDisposable?.dispose()
    editor?.dispose()
  })

  return (
    <div class="relative flex flex-col w-full h-full" style={{ "min-height": "300px" }}>
      {/* EDITOR — double-click ANYWHERE to open AI chat (handled via editor.onMouseDown) */}
      <div
        ref={containerRef}
        class="flex-1 min-h-0"
        style={{ width: "100%" }}
        onClick={() => handleClick()}
      />

      {/* AI GENERATING STATUS */}
      <Show when={aiGenerating()}>
        <div
          class="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 px-4 py-2"
          style={{
            "background": "linear-gradient(135deg, rgba(0,255,136,0.15) 0%, rgba(0,204,255,0.15) 100%)",
            "backdrop-filter": "blur(10px)",
            "border-top": "1px solid rgba(0,255,136,0.3)",
          }}
        >
          <div class="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <span class="text-xs font-medium text-[#00ff88]">AI is generating...</span>
          <Show when={activePrompt()}>
            <span class="text-xs text-[#aaa]">"{activePrompt()!.slice(0, 50)}"</span>
          </Show>
          <button
            class="px-2 py-0.5 text-[10px] font-medium rounded bg-[rgba(255,255,255,0.1)] text-[#ff6b6b] hover:bg-[rgba(255,255,255,0.2)] transition-colors"
            onClick={() => {
              aiAssistant.cancel()
              setAiGenerating(false)
              setActivePrompt(null)
            }}
          >
            Stop
          </button>
        </div>
      </Show>
    </div>
  )
}

export function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || ""
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    md: "markdown",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    ps1: "powershell",
    bat: "batch",
    dockerfile: "dockerfile",
    toml: "ini",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    txt: "plaintext",
    csv: "plaintext",
  }
  return langMap[ext] || "plaintext"
}
