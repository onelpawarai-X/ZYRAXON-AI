// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Shared browser state for the embedded real Chromium browser.
 * Used by session header (toggle button) and session side panel (browser tab).
 */
import { createSignal, type Accessor } from "solid-js"

const [browserActive, setBrowserActive] = createSignal(false)
const DEFAULT_BROWSER_WIDTH = 900
const [browserWidth, setBrowserWidth] = createSignal(DEFAULT_BROWSER_WIDTH)

export function getBrowserActive(): Accessor<boolean> {
  return browserActive
}

export function setBrowserActiveState(active: boolean): void {
  setBrowserActive(active)
}

export function toggleBrowser(): void {
  setBrowserActive((prev) => !prev)
}

export function getBrowserWidth(): Accessor<number> {
  return browserWidth
}

export function setBrowserWidthState(width: number): void {
  setBrowserWidth(Math.max(360, Math.min(1600, width)))
}
