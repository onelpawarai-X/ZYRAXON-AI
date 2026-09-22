import { createEffect, createSignal, onCleanup, For } from "solid-js"
import { IconButton } from "@zyraxon-ai/ui/icon-button"
import { MenuV2 } from "@zyraxon-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"

type VoiceState = "idle" | "recording" | "processing"

const VOICE_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "auto", label: "Auto-Detect" },
  { code: "bn-BD", label: "Bengali" },
  { code: "hi-IN", label: "Hindi" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-IN", label: "English (India)" },
  { code: "ar-SA", label: "Arabic" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese" },
  { code: "ru-RU", label: "Russian" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
  { code: "vi-VN", label: "Vietnamese" },
  { code: "it-IT", label: "Italian" },
  { code: "th-TH", label: "Thai" },
  { code: "tr-TR", label: "Turkish" },
  { code: "pl-PL", label: "Polish" },
  { code: "nl-NL", label: "Dutch" },
  { code: "uk-UA", label: "Ukrainian" },
  { code: "sv-SE", label: "Swedish" },
  { code: "da-DK", label: "Danish" },
  { code: "fi-FI", label: "Finnish" },
  { code: "nb-NO", label: "Norwegian" },
  { code: "cs-CZ", label: "Czech" },
  { code: "ro-RO", label: "Romanian" },
  { code: "el-GR", label: "Greek" },
  { code: "he-IL", label: "Hebrew" },
  { code: "hu-HU", label: "Hungarian" },
  { code: "id-ID", label: "Indonesian" },
  { code: "ms-MY", label: "Malay" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "ur-PK", label: "Urdu" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "fa-IR", label: "Persian" },
  { code: "sw-KE", label: "Swahili" },
  { code: "af-ZA", label: "Afrikaans" },
]

export type MicButtonProps = {
  onTranscript: (text: string, lang: string) => void
  onError?: (error: string) => void
  disabled?: boolean
  language?: string
  onLanguageChange?: (lang: string) => void
}

const isInsideIframe = (() => {
  try {
    return window !== window.parent && !!window.parent
  } catch {
    return false
  }
})()

export function PromptInputV2MicButton(props: MicButtonProps) {
  const [state, setState] = createSignal<VoiceState>("idle")
  const [selectedLang, setSelectedLang] = createSignal(props.language || "auto")
  let finalText = ""
  let removeVoiceListener: (() => void) | null = null
  let safetyTimeout: ReturnType<typeof setTimeout> | null = null

  createEffect(() => {
    const lang = props.language
    if (lang && lang !== selectedLang()) {
      setSelectedLang(lang)
    }
  })

  const clearSafetyTimeout = () => {
    if (safetyTimeout) { clearTimeout(safetyTimeout); safetyTimeout = null }
  }

  const cleanupListener = () => {
    if (removeVoiceListener) { removeVoiceListener(); removeVoiceListener = null }
  }

  const finishWithText = () => {
    if (state() !== "processing" && state() !== "recording") return
    clearSafetyTimeout()
    cleanupListener()
    const text = finalText.trim()
    finalText = ""
    if (text) {
      props.onTranscript(text, selectedLang())
    }
    setState("idle")
  }

  const registerVoiceListener = () => {
    cleanupListener()
    const api = (window as any).api
    if (!api?.onVoiceEvent) return

    removeVoiceListener = api.onVoiceEvent((event: any) => {
      if (event.type === "voice-transcript") {
        if (event.isFinal) {
          const t = (event.fullText || event.text || "").trim()
          if (t) finalText = t
        }
      } else if (event.type === "voice-mic-state") {
        if (event.active) {
          setState("recording")
          clearSafetyTimeout()
        } else {
          finishWithText()
        }
      } else if (event.type === "voice-send") {
        const t = (event.text || "").trim()
        if (t) {
          clearSafetyTimeout()
          props.onTranscript(t, event.lang || selectedLang())
          setState("idle")
        }
      }
    })
  }

  const startListening = async () => {
    finalText = ""

    if (isInsideIframe) {
      const bridgeId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

      const handleMessage = (ev: MessageEvent) => {
        if (ev.data?.type === "zyraxon-speech-result" && ev.data?.bridgeId === bridgeId) {
          window.removeEventListener("message", handleMessage)
          if (ev.data.result) {
            finalText = ev.data.result
          }
          finishWithText()
        }
      }

      window.addEventListener("message", handleMessage)
      removeVoiceListener = () => window.removeEventListener("message", handleMessage)

      window.parent.postMessage(
        { type: "zyraxon-speech-start", bridgeId, lang: selectedLang() === "auto" ? "" : selectedLang() },
        "*",
      )

      setState("recording")
      safetyTimeout = setTimeout(() => {
        if (state() === "recording" && !finalText) {
          setState("idle")
          cleanupListener()
          props.onError?.("Speech recognition timeout. Please try again.")
        }
      }, 15000)

      return
    }

    const api = (window as any).api
    if (!api) {
      props.onError?.("Voice bridge not available.")
      return
    }

    // Clear any previously accumulated transcript before starting fresh
    try { await api.voiceClearAccumulatedTranscript?.() } catch {}

    setState("recording")
    registerVoiceListener()

    const lang = selectedLang()
    if (lang && lang !== "auto") {
      try { await api.voiceSetLanguage(lang) } catch {}
    }

    try {
      const result = await api.voiceStartListening()
      if (result === false) {
        props.onError?.("Voice bridge module not ready. Please restart the app.")
        setState("idle")
        cleanupListener()
      }
    } catch {
      props.onError?.("Failed to start voice bridge.")
      setState("idle")
      cleanupListener()
    }

    safetyTimeout = setTimeout(() => {
      if (state() === "recording" && !finalText) {
        setState("idle")
        cleanupListener()
        props.onError?.("Voice bridge timeout. Make sure ZYRAXON Voice window is open.")
      }
    }, 8000)
  }

  const stopListening = async () => {
    clearSafetyTimeout()
    setState("processing")

    if (isInsideIframe) {
      window.parent.postMessage({ type: "zyraxon-speech-stop" }, "*")
      safetyTimeout = setTimeout(() => {
        finishWithText()
      }, 5000)
      return
    }

    const api = (window as any).api
    if (api) {
      try { await api.voiceStopListening() } catch {}
      // Get accumulated transcript from buffer as fallback
      if (!finalText) {
        try {
          const accumulated = await api.voiceGetAccumulatedTranscript?.()
          if (accumulated && accumulated.trim()) {
            finalText = accumulated.trim()
          }
        } catch {}
      }
      // Clear buffer after retrieving
      try { await api.voiceClearAccumulatedTranscript?.() } catch {}
    }
    safetyTimeout = setTimeout(() => {
      finishWithText()
    }, 5000)
  }

  const toggleMic = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (state() === "recording") {
      stopListening()
    } else if (state() === "idle") {
      startListening()
    }
  }

  const selectLang = (code: string) => {
    setSelectedLang(code)
    props.onLanguageChange?.(code)
    const api = (window as any).api
    if (api && state() === "recording") {
      api.voiceSetLanguage(code).catch(() => {})
    }
  }

  onCleanup(() => {
    clearSafetyTimeout()
    cleanupListener()
  })

  const langLabel = () =>
    VOICE_LANGUAGES.find((l) => l.code === selectedLang())?.label || "Auto-Detect"

  return (
    <div class="flex items-center gap-1">
      <MenuV2 gutter={4} placement="top-start">
        <MenuV2.Trigger
          as={IconButton}
          type="button"
          icon="globe"
          variant="ghost-muted"
          class="size-7 rounded-md p-[6px]"
          aria-label="Select language"
          onClick={(e: Event) => e.stopPropagation()}
        />
        <MenuV2.Portal>
          <MenuV2.Content style={{ "max-height": "300px", "overflow-y": "auto", "min-width": "160px" }}>
            <For each={VOICE_LANGUAGES}>
              {(lang) => (
                <MenuV2.Item
                  onSelect={() => selectLang(lang.code)}
                  class={selectedLang() === lang.code ? "bg-v2-background-bg-contrast" : ""}
                >
                  {lang.label}
                  {selectedLang() === lang.code && " \u2713"}
                </MenuV2.Item>
              )}
            </For>
          </MenuV2.Content>
        </MenuV2.Portal>
      </MenuV2>

      <TooltipV2
        placement="top"
        value={
          state() === "recording"
            ? "Recording... Click to stop"
            : state() === "processing"
              ? "Processing..."
              : `Mic (${langLabel()}) — Click to record`
        }
      >
        <IconButton
          data-action="prompt-mic"
          type="button"
          disabled={props.disabled || state() === "processing"}
          icon={state() === "processing" ? "loader" : state() === "recording" ? "mic-off" : "mic"}
          variant={state() === "recording" ? "danger" : "ghost-muted"}
          class={`size-7 rounded-md p-[6px] ${
            state() === "recording"
              ? "animate-pulse text-red-500"
              : "text-v2-icon-icon-muted"
          }`}
          aria-label={state() === "recording" ? "Stop recording" : "Start recording"}
          onClick={toggleMic}
        />
      </TooltipV2>
    </div>
  )
}
