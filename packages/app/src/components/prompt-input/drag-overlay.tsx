// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Component, Show } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import "./drag-overlay.css"

type PromptDragOverlayProps = {
  type: "image" | "@mention" | null
  label: string
}

const kindToIcon = {
  image: "photo",
  "@mention": "link",
} as const

export const PromptDragOverlay: Component<PromptDragOverlayProps> = (props) => {
  return (
    <Show when={props.type !== null}>
      <div class="drag-drop-overlay" aria-hidden="true">
        <div class="drag-drop-frame">
          <svg preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="drag-drop-gradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#22d3ee" />
                <stop offset="0.28" stop-color="#34d399" />
                <stop offset="0.5" stop-color="#e879f9" />
                <stop offset="0.72" stop-color="#a78bfa" />
                <stop offset="1" stop-color="#22d3ee" />
              </linearGradient>
            </defs>
            <rect x="0.6" y="0.6" width="98.8" height="98.8" rx="6.5" ry="6.5" vector-effect="non-scaling-stroke" />
          </svg>
          <span class="drag-drop-corner drag-drop-corner-tl" />
          <span class="drag-drop-corner drag-drop-corner-tr" />
          <span class="drag-drop-corner drag-drop-corner-bl" />
          <span class="drag-drop-corner drag-drop-corner-br" />
        </div>

        <div class="drag-drop-icon-ring">
          <div class="drag-drop-icon-core">
            <Icon name={props.type ? kindToIcon[props.type] : kindToIcon.image} />
          </div>
        </div>
        <span class="drag-drop-label">{props.label}</span>
        <span class="drag-drop-sub">Release to transmit</span>
      </div>
    </Show>
  )
}
