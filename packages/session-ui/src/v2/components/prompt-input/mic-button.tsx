// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createEffect, createSignal, onCleanup, For } from "solid-js"
import { IconButton } from "@zyraxon-ai/ui/icon-button"
import { MenuV2 } from "@zyraxon-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"
import { VOICE_LANGUAGES } from "./reply-language"
import { createRealtimeStt, type RealtimeStt, type SttState } from "./stt-client"

export type MicButtonProps = {
  onTranscript: (text: string) => void
  onError?: (error: string) => void
  disabled?: boolean
  language?: string
  onLanguageChange?: (lang: string) => void
}

/**
 * The composer mic with a language picker beside it. One click records, the next
 * click sends the recording: the button turns into a spinner while the server
 * transcribes, and the finished text appears in the box in one piece. The picked
 * language is both the one the recogniser listens for and the one the reply comes
 * back in, so what is spoken lands in the chat box in the language that was
 * chosen. "Auto-Detect" lets the recogniser pick the language from the recording.
 */
export function PromptInputV2MicButton(props: MicButtonProps) {
  const [state, setState] = createSignal<SttState>("idle")
  const [selectedLang, setSelectedLang] = createSignal(props.language || "auto")
  let stt: RealtimeStt | null = null

  // The incoming locale is adopted only until the user picks a language of their
  // own. After that the app locale stops being their voice language, and it
  // becomes it again on remount — which is what a new session does. Comparing
  // the two to decide instead could not tell an external change from the user's
  // own pick, so the menu snapped back to Auto-Detect the moment anything was
  // chosen and read as the setting refusing to save.
  let userChosen = false
  createEffect(() => {
    const lang = props.language
    if (!lang || userChosen) return
    if (lang !== selectedLang()) setSelectedLang(lang)
  })

  const disposeStt = () => {
    stt?.dispose()
    stt = null
  }

  const startListening = async () => {
    disposeStt()
    const client = createRealtimeStt({
      onFinal: (text) => props.onTranscript(text),
      onError: (message) => props.onError?.(message),
      onState: (next) => setState(next),
    })
    stt = client
    const started = await client.start(selectedLang())
    if (!started) {
      disposeStt()
      setState("idle")
    }
  }

  const stopListening = async () => {
    const client = stt
    if (!client) return
    await client.stop()
    if (stt === client) stt = null
  }

  const toggleMic = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // While the recording is being transcribed the second click has already been
    // spent, so the button ignores input until the text arrives.
    if (state() === "recording") void stopListening()
    else if (state() === "idle") void startListening()
  }

  const selectLang = (code: string) => {
    userChosen = true
    setSelectedLang(code)
    props.onLanguageChange?.(code)
    // The client reads the language when the recording is sent, so telling it now
    // is enough for a change made while recording to apply to this utterance.
    stt?.setLanguage(code)
  }

  onCleanup(() => disposeStt())

  const recording = () => state() === "recording"
  const processing = () => state() === "processing"

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
          data-action="prompt-mic-language"
          icon="globe"
          variant="ghost-muted"
          class="size-7 rounded-md p-[6px]"
          aria-label="Select microphone language"
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
          recording()
            ? "Recording… click to send"
            : processing()
              ? "Transcribing…"
              : `Mic (${langLabel()}) — Click to record`
        }
      >
        <IconButton
          data-action="prompt-mic"
          type="button"
          disabled={props.disabled || processing()}
          icon={recording() ? "mic-off" : processing() ? "loader" : "mic"}
          variant={recording() ? "danger" : "ghost-muted"}
          class={`size-7 rounded-md p-[6px] ${
            recording()
              ? "animate-pulse text-red-500"
              : processing()
                ? "animate-spin text-v2-icon-icon-accent"
                : "text-v2-icon-icon-muted"
          }`}
          aria-label={recording() ? "Send recording" : processing() ? "Transcribing" : "Start recording"}
          onClick={toggleMic}
        />
      </TooltipV2>
    </div>
  )
}
