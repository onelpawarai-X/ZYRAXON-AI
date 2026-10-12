// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Which side-panel surfaces are on screen, and how they share the right column.
 *
 * The terminal is a full-height panel on the far right of the session. It never
 * stacks underneath the review panel: the two are independent surfaces, and the
 * terminal only ever appears where its own toggle (or shortcut) put it. `stacked`
 * therefore stays false so the terminal keeps the whole column height while the
 * review panel keeps its own, narrower column beside it.
 */
export function sessionPanelLayout(input: { review: boolean; terminal: boolean; files: boolean }) {
  return {
    visible: input.review || input.terminal || input.files,
    stacked: false,
  }
}
