// Copyright (c) 2026 onelpawarai. All rights reserved.

import "./prompt-drag-overlay-v2.css"
import type { JSX } from "solid-js"

export interface PromptDragOverlayV2Props {
  kind: "image" | "@mention"
  label: string
  class?: string
}

export function PromptDragOverlayV2(props: PromptDragOverlayV2Props): JSX.Element {
  return (
    <div data-component="prompt-drag-overlay-v2" class={props.class} aria-hidden="true">
      <div class="zyraxon-drop-marching" />
      <span class="zyraxon-drop-reticle zyraxon-drop-reticle-tl" />
      <span class="zyraxon-drop-reticle zyraxon-drop-reticle-tr" />
      <span class="zyraxon-drop-reticle zyraxon-drop-reticle-bl" />
      <span class="zyraxon-drop-reticle zyraxon-drop-reticle-br" />
      <span class="zyraxon-drop-orbit" />
      <div class="zyraxon-drop-label">{props.label}</div>
    </div>
  )
}
