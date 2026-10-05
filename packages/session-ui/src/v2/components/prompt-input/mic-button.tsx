// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createEffect, createSignal, onCleanup, For } from "solid-js"
import { IconButton } from "@zyraxon-ai/ui/icon-button"
import { MenuV2 } from "@zyraxon-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"
import { VOICE_LANGUAGES } from "./reply-language"

type VoiceState = "idle" | "recording" | "processing"

export type MicButtonProps = {
  onTranscript: (text: string, lang: string) => void
  onLiveText?: (text: string) => void
  onError?: (error: string) => void
  disabled?: boolean
  language?: string
  onLanguageChange?: (lang: string) => void
  /** Submit the prompt. Needed because the bridge window cannot press Send itself. */
  onSubmit?: () => void
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
  let lastSelected: string | undefined
  let removeVoiceListener: (() => void) | null = null
  let safetyTimeout: ReturnType<typeof setTimeout> | null = null

  // Create the effect only when the component is created, not on every render.
  createEffect(() => {
    const lang = props.language
    // Adopt an externally-set language (e.g. restored app locale) but keep a
    // user-selected voice locale stable across unrelated re-renders.
    if (lang && lang !== selectedLang() && lang !== lastSelected) {
      setSelectedLang(lang)
    }
    lastSelected = selectedLang()
  })

  const clearSafetyTimeout = () => {
    if (safetyTimeout) { clearTimeout(safetyTimeout); safetyTimeout = null }
  }

  const cleanupListener = () => {
    if (removeVoiceListener) { removeVoiceListener(); removeVoiceListener = null }
  }

  // voice-send and voice-mic-state can both arrive for the same utterance;
  // dropping the second delivery prevents the transcript from being inserted twice.
  let transcriptDelivered = false
  // Only speech we painted ourselves may be wiped when the mic re-opens, so a
  // hand-typed draft in the chat box survives untouched.
  let livePainted = false
  const deliverOnce = (text: string, lang: string) => {
    if (transcriptDelivered) return
    const trimmed = text.trim()
    if (!trimmed) return
    transcriptDelivered = true
    clearSafetyTimeout()
    cleanupListener()
    livePainted = true
    props.onTranscript(trimmed, lang)
    setState("idle")
  }

  const finishWithText = () => {
    if (state() !== "processing" && state() !== "recording") return
    if (transcriptDelivered) return
    clearSafetyTimeout()
    cleanupListener()
    const text = finalText.trim()
    finalText = ""
    if (text) {
      transcriptDelivered = true
      livePainted = true
      props.onTranscript(text, selectedLang())
    }
    setState("idle")
  }

  const registerVoiceListener = () => {
    cleanupListener()
    transcriptDelivered = false
    const api = (window as any).api
    if (!api?.onVoiceEvent) return

    removeVoiceListener = api.onVoiceEvent((event: any) => {
      // While the assistant is speaking, the mic captures its own voice. Those
      // transcripts are echo — never paint them into the chat box.
      if ((window as any).__zyraxonTTSActiveRender && event.type === "voice-transcript") return
      if (event.type === "voice-transcript") {
        const t = (event.fullText || event.text || "").trim()
        if (t) {
          finalText = t
          clearSafetyTimeout()
          // Stream interim text into the chat box as the user speaks — no waiting for stop
          livePainted = true
          props.onLiveText?.(t)
        }
      } else if (event.type === "voice-mic-state") {
        if (event.active) {
          setState("recording")
          clearSafetyTimeout()
        } else {
          finishWithText()
        }
      } else if (event.type === "voice-send") {
        deliverOnce(event.text || "", event.lang || selectedLang())
        // The bridge's own Send button was pressed, so the composer must submit too.
        // Waiting for the next tick left the text on screen with nothing sent.
        if (event.submit) requestAnimationFrame(() => props.onSubmit?.())
      }
    })
  }

  const startListening = async () => {
    finalText = ""
    // Re-opening the mic must never replay what was said in a previous session.
    if (livePainted) {
      livePainted = false
      props.onLiveText?.("")
    }

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

    // Optimistic UI — show recording before any IPC so the click feels instant
    setState("recording")
    registerVoiceListener()

    // Push selected language as-is — keep "auto" so the bridge uses the
    // browser locale; never force en-US for non-English selections.
    const lang = selectedLang()
    await Promise.all([
      Promise.resolve(api.voiceClearAccumulatedTranscript?.()).catch(() => {}),
      Promise.resolve(api.voiceSetLanguage?.(lang || "auto")).catch(() => {}),
    ])

    try {
      const result = await api.voiceStartListening()
      if (result === false) {
        props.onError?.("Voice bridge module not ready. Please restart the app.")
        setState("idle")
        cleanupListener()
        return
      }
    } catch {
      props.onError?.("Failed to start voice bridge.")
      setState("idle")
      cleanupListener()
      return
    }

    // The bridge confirmed the session, so the mic is live. Silence here just
    // means the user has not spoken yet, which is not a failure: this used to
    // throw "Voice bridge timeout" after 8 seconds and throw away a recording
    // that was working exactly as intended. If the bridge really is unreachable
    // it reports that itself, and the user can stop with the same button.
    setState("recording")
  }

  const stopListening = async () => {
    clearSafetyTimeout()

    if (isInsideIframe) {
      setState("processing")
      window.parent.postMessage({ type: "zyraxon-speech-stop" }, "*")
      safetyTimeout = setTimeout(() => {
        finishWithText()
      }, 5000)
      return
    }

    const api = (window as any).api
    if (api) {
      try { await api.voiceStopListening() } catch {}
      // Final text may already be live in the box; settle from bridge buffer as fallback
      if (!finalText) {
        try {
          const accumulated = await api.voiceGetAccumulatedTranscript?.()
          if (accumulated && accumulated.trim()) {
            finalText = accumulated.trim()
          }
        } catch {}
      }
      try { await api.voiceClearAccumulatedTranscript?.() } catch {}
    }
    // Final transcript arrives via voice-transcript (final:true) then mic-state false —
    // finishWithText settles without a long processing state (text already streamed).
    if (state() === "recording") {
      finishWithText()
    } else {
      setState("processing")
      safetyTimeout = setTimeout(() => {
        finishWithText()
      }, 3000)
    }
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
    // Switching language mid-sentence has to take effect on the utterance being
    // recorded right now, not on the next one. Without this the recogniser kept
    // transcribing in the language picked before the mic was opened.
    if (api && (state() === "recording" || state() === "processing")) {
      Promise.resolve(api.voiceSetLanguage?.(code)).catch(() => {})
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
      {/* The composer is anchored to the bottom of the viewport, so an upward menu
          would cover the conversation and a downward one renders past the bottom
          edge. top-end mirrors the menu to the trigger's right edge, which keeps it
          inside the composer while still opening above the row. */}
      <MenuV2 gutter={4} placement="top-end">
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
