import { createSignal, onCleanup, For } from "solid-js"
import { IconButton } from "@zyraxon-ai/ui/icon-button"
import { MenuV2 } from "@zyraxon-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"

type VoiceState = "idle" | "listening" | "processing"

const VOICE_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "auto", label: "Auto-Detect" },
  { code: "bn-BD", label: "Bengali" },
  { code: "hi-IN", label: "Hindi" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "ar-SA", label: "Arabic" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese" },
  { code: "ru-RU", label: "Russian" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese" },
  { code: "vi-VN", label: "Vietnamese" },
  { code: "it-IT", label: "Italian" },
  { code: "th-TH", label: "Thai" },
  { code: "tr-TR", label: "Turkish" },
  { code: "pl-PL", label: "Polish" },
  { code: "nl-NL", label: "Dutch" },
  { code: "uk-UA", label: "Ukrainian" },
  { code: "ms-MY", label: "Malay" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "ur-IN", label: "Urdu" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "fa-IR", label: "Persian" },
  { code: "he-IL", label: "Hebrew" },
  { code: "el-GR", label: "Greek" },
  { code: "cs-CZ", label: "Czech" },
  { code: "sv-SE", label: "Swedish" },
  { code: "da-DK", label: "Danish" },
  { code: "fi-FI", label: "Finnish" },
  { code: "no-NO", label: "Norwegian" },
  { code: "hu-HU", label: "Hungarian" },
  { code: "ro-RO", label: "Romanian" },
  { code: "id-ID", label: "Indonesian" },
]

export type MicButtonProps = {
  onTranscript: (text: string, lang: string) => void
  onError?: (error: string) => void
  disabled?: boolean
}

export function PromptInputV2MicButton(props: MicButtonProps) {
  const [state, setState] = createSignal<VoiceState>("idle")
  const [selectedLang, setSelectedLang] = createSignal("auto")
  const [interim, setInterim] = createSignal("")
  let recognition: any = null
  let shouldListen = false
  let restartTimer: ReturnType<typeof setTimeout> | null = null

  const ensureRecognition = () => {
    if (recognition) return
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      props.onError?.("Speech recognition not supported in this browser")
      return
    }
    recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.onresult = (event: any) => {
      let finalText = ""
      let interimText = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += transcript
        } else {
          interimText += transcript
        }
      }
      if (finalText) {
        const lang = event.results[event.resultIndex]?.[0]?.language || selectedLang()
        props.onTranscript(finalText.trim(), lang)
        setInterim("")
      } else if (interimText) {
        setInterim(interimText)
      }
    }
    recognition.onend = () => {
      if (shouldListen && state() === "listening") {
        if (restartTimer) clearTimeout(restartTimer)
        restartTimer = setTimeout(() => {
          if (shouldListen && state() === "listening") {
            try {
              const lang = selectedLang()
              recognition.lang = lang === "auto" ? "" : lang
              recognition.start()
            } catch {
              setState("idle")
              shouldListen = false
            }
          }
        }, 150)
      } else {
        setState("idle")
      }
    }
    recognition.onerror = (event: any) => {
      if (event.error === "aborted") return
      if (event.error === "no-speech" || event.error === "network") {
        if (shouldListen && state() === "listening") return
      }
      props.onError?.(event.error)
      setState("idle")
      shouldListen = false
    }
  }

  const startListening = () => {
    ensureRecognition()
    if (!recognition) return
    shouldListen = true
    try {
      const lang = selectedLang()
      recognition.lang = lang === "auto" ? "" : lang
      recognition.start()
      setState("listening")
    } catch {
      recognition.stop()
      setTimeout(() => {
        if (shouldListen) {
          try {
            const lang = selectedLang()
            recognition.lang = lang === "auto" ? "" : lang
            recognition.start()
            setState("listening")
          } catch {
            setState("idle")
            shouldListen = false
          }
        }
      }, 200)
    }
  }

  const stopListening = () => {
    shouldListen = false
    if (restartTimer) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
    if (recognition) {
      try { recognition.stop() } catch {}
    }
    setState("idle")
    setInterim("")
  }

  const toggleMic = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (state() === "listening") {
      stopListening()
    } else {
      startListening()
    }
  }

  const selectLang = (code: string) => {
    setSelectedLang(code)
    if (recognition && state() === "listening") {
      recognition.stop()
      setTimeout(() => {
        if (shouldListen) {
          recognition.lang = code === "auto" ? "" : code
          try { recognition.start() } catch {}
        }
      }, 100)
    }
  }

  onCleanup(() => {
    shouldListen = false
    if (restartTimer) clearTimeout(restartTimer)
    if (recognition) {
      try { recognition.stop() } catch {}
    }
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
          state() === "listening"
            ? `Listening${interim() ? ": " + interim() : ""}...`
            : state() === "processing"
              ? "Processing..."
              : `Mic (${langLabel()})`
        }
      >
        <IconButton
          data-action="prompt-mic"
          type="button"
          disabled={props.disabled}
          icon={state() === "processing" ? "loader" : state() === "listening" ? "mic-off" : "mic"}
          variant={state() === "listening" ? "danger" : "ghost-muted"}
          class={`size-7 rounded-md p-[6px] ${
            state() === "listening"
              ? "animate-pulse text-red-500"
              : "text-v2-icon-icon-muted"
          }`}
          aria-label="Voice input"
          onClick={toggleMic}
        />
      </TooltipV2>
    </div>
  )
}
