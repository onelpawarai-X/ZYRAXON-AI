// Copyright (c) 2026 onelpawarai. All rights reserved.
//
// A live "processing" indicator shown while a large audio/video attachment is
// being prepared for the model. Preparing long recordings (re-encoding, and
// splitting into ordered parts) can take a while, so the UI shows a moving,
// distinct animation instead of looking frozen. Purely presentational: it never
// blocks sending, and it disappears once the turn is no longer working.

import { For } from "solid-js"

export function MediaProcessingIndicator(props: { kind: "audio" | "video"; filename?: string; detail?: string }) {
  const bars = props.kind === "audio" ? 28 : 18
  return (
    <div data-component="media-processing" data-kind={props.kind}>
      <div class="media-processing-orb">
        <span class="media-processing-ring" />
        <span class="media-processing-ring media-processing-ring-2" />
        <span class="media-processing-core" />
      </div>
      <div class="media-processing-meta">
        <div class="media-processing-title">
          {props.kind === "audio" ? "Preparing audio for the model" : "Preparing video for the model"}
        </div>
        <div class="media-processing-sub">
          {props.detail ?? (props.filename ? `${props.filename} — re-encoding and splitting into parts` : "re-encoding and splitting into parts")}
        </div>
        <div class="media-processing-wave" aria-hidden="true">
          <For each={Array.from({ length: bars })}>
            {(_, index) => <span style={{ "animation-delay": `${(index() % 9) * 90}ms` }} />}
          </For>
        </div>
      </div>
    </div>
  )
}
