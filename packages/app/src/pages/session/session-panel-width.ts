// Copyright (c) 2026 onelpawarai. All rights reserved.

// The review pane has no width of its own: it takes whatever the chat panel
// leaves behind. Instead of capping the chat panel at a fraction of the window
// (which forces the review pane to grow with the monitor), reserve a fixed
// minimum for the review pane and let the chat panel take everything else.
export const SESSION_PANEL_WIDTH_MIN = 450
export const REVIEW_PANE_WIDTH_MIN = 480
export const REVIEW_PANE_WIDTH_MIN_SPLIT = 800

/**
 * How wide the chat panel may grow.
 *
 * A reserved review width only makes sense while the review pane is actually on
 * screen. Reserving it unconditionally left a 480px hole in the middle of the
 * row whenever only the terminal was open — the chat panel stayed clamped to its
 * stored width and the terminal sat against the far edge with nothing between
 * them. With `review` false the chat panel takes the whole row, and the review
 * pane claims its reservation back the moment it opens.
 */
export function sessionPanelWidthMax(input: { available: number; split: boolean; review: boolean }) {
  if (!input.review) return Math.max(SESSION_PANEL_WIDTH_MIN, input.available)
  const pane = input.split ? REVIEW_PANE_WIDTH_MIN_SPLIT : REVIEW_PANE_WIDTH_MIN
  return Math.max(SESSION_PANEL_WIDTH_MIN, input.available - pane)
}

// `available` is undefined until the layout row is first measured; render the
// stored width untouched until then to avoid a first-frame snap.
export function clampSessionPanelWidth(input: {
  width: number
  available: number | undefined
  split: boolean
  review: boolean
}) {
  if (input.available === undefined) return input.width
  return Math.min(
    input.width,
    sessionPanelWidthMax({ available: input.available, split: input.split, review: input.review }),
  )
}
