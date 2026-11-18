// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createMemo, Show } from "solid-js"
import { useSync } from "@/context/sync"
import { useParams } from "@solidjs/router"
import { useTheme } from "@zyraxon-ai/ui/theme/context"
import aiEyesVideo from "@/assets/ai-eyes.mp4"

export function AIEyesOverlay() {
  const sync = useSync()
  const params = useParams()
  const theme = useTheme()

  const isActive = createMemo(() => {
    const id = params.id
    if (!id) return false
    const status = sync().data.session_status[id]
    if (!status) return false
    return status.type !== "idle"
  })

  // `colorScheme()` is the user setting and can be "system", which is not a
  // resolvable mode; `mode()` is the resolved light/dark value, so an OS in
  // light mode with the setting left on "system" no longer gets the dark
  // treatment (which turned the overlay invisible in light mode).
  const isDark = createMemo(() => theme.mode() === "dark")

  return (
    <Show when={isActive()}>
      <div
        style={{
          "position": "absolute",
          "inset": "0",
          "z-index": "5",
          "pointer-events": "none",
          "display": "flex",
          "align-items": "center",
          "justify-content": "center",
          "overflow": "hidden",
          // Dark mode lifts the electric-blue streams off a near-black canvas
          // with a screen blend; light mode multiplies the same footage into the
          // white canvas (no invert, which cancelled the video out entirely) so
          // both themes show a matching blue light-stream wash.
          "opacity": isDark() ? "0.16" : "0.20",
          "mix-blend-mode": isDark() ? "screen" : "multiply",
          "transition": "opacity 0.8s ease-in-out",
        }}
      >
        <video
          src={aiEyesVideo}
          autoplay
          loop
          muted
          playsinline
          style={{
            "width": "100%",
            "height": "100%",
            "object-fit": "cover",
            "filter": isDark()
              ? "brightness(1.4) contrast(1.25) saturate(1.3)"
              : "brightness(1.7) contrast(1.2) saturate(1.4)",
          }}
        />
      </div>
    </Show>
  )
}
