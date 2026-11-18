// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Shared preview state for in-app website preview.
 * Used by session header (toggle button) and session side panel (preview tab).
 */
import { createSignal, type Accessor } from "solid-js"

const [previewActive, setPreviewActive] = createSignal(false)
const DEFAULT_PREVIEW_WIDTH = 800
const [previewWidth, setPreviewWidth] = createSignal(DEFAULT_PREVIEW_WIDTH)

// Which application window the panel is currently mirroring, if any. The panel reads
// this to render, and the agent's tools write to it so a tool call can put an app on
// screen the same way a click does.
const [attachedWindow, setAttachedWindow] = createSignal<{ id: string; name: string } | null>(null)

export function getPreviewActive(): Accessor<boolean> {
  return previewActive
}

export function setPreviewActiveState(active: boolean): void {
  setPreviewActive(active)
}

export function togglePreview(): void {
  setPreviewActive((prev) => !prev)
}

export function getPreviewWidth(): Accessor<number> {
  return previewWidth
}

export function setPreviewWidthState(width: number): void {
  setPreviewWidth(Math.max(360, Math.min(1600, width)))
}

export function getAttachedWindow(): Accessor<{ id: string; name: string } | null> {
  return attachedWindow
}

export function setAttachedWindowState(value: { id: string; name: string } | null): void {
  setAttachedWindow(value)
}
