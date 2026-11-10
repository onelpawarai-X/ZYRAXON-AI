// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSignal, onCleanup } from "solid-js"
import { IconButton } from "@zyraxon-ai/ui/icon-button"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"
import { createRealtimeStt, type RealtimeStt, type SttState } from "./stt-client"

export type MicButtonProps = {
  onTranscript: (text: string, lang: string) => void
  onLiveText?: (text: string) => void
  onError?: (error: string) => void
  disabled?: boolean
}

/**
 * The composer mic. It always asks the STT endpoint to detect the language, so
 * Bengali (or any other language) is understood the moment the person speaks and
 * no picker has to be set first. The spoken reply's language is still steerable,
 * and it lives in Settings rather than beside every message.
 */
export function PromptInputV2MicButton(props: MicButtonProps) {
  const [state, setState] = createSignal<SttState>("idle")
  let stt: RealtimeStt | null = null

  const disposeStt = () => {
    stt?.dispose()
    stt = null
  }

  const startListening = async () => {
    disposeStt()
    // Re-opening the mic must never replay what was said in a previous session.
    props.onLiveText?.("")
    const client = createRealtimeStt({
      onLive: (text) => props.onLiveText?.(text),
      onFinal: (text) => props.onTranscript(text, "auto"),
      onError: (message) => props.onError?.(message),
      onState: (next) => setState(next),
    })
    stt = client
    const started = await client.start("auto")
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
    if (state() === "recording") void stopListening()
    else if (state() === "idle") void startListening()
  }

  onCleanup(() => disposeStt())

  return (
    <TooltipV2
      placement="top"
      value={state() === "recording" ? "Recording... Click to stop" : "Mic (auto-detect) — Click to record"}
    >
      <IconButton
        data-action="prompt-mic"
        type="button"
        disabled={props.disabled}
        icon={state() === "recording" ? "mic-off" : "mic"}
        variant={state() === "recording" ? "danger" : "ghost-muted"}
        class={`size-7 rounded-md p-[6px] ${
          state() === "recording" ? "animate-pulse text-red-500" : "text-v2-icon-icon-muted"
        }`}
        aria-label={state() === "recording" ? "Stop recording" : "Start recording"}
        onClick={toggleMic}
      />
    </TooltipV2>
  )
}
