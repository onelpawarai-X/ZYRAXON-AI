// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSignal } from "solid-js"

// The session sidebar is hidden by default. Reaching the left edge opens it for
// as long as the pointer stays; the titlebar toggle pins it open so it survives
// the pointer leaving.
//
// Two independent signals, because they answer two different questions:
//   - `locked`: the user shut the reveal off. While locked the sidebar never
//     opens on hover and the titlebar toggle will not pin it either.
//   - `pinned`: the user forced the sidebar to stay open past the pointer.
// Keeping them apart means unlocking can restore whatever the user had before,
// which a single inverse signal could not express.
const [pinned, setPinned] = createSignal(false)
const [locked, setLocked] = createSignal(false)

export const sidebarPinned = pinned
export const setSidebarPinned = setPinned

export const sidebarLocked = locked
export const setSidebarLocked = setLocked

// Flip the lock. Used by right-click and double-click on the titlebar toggle,
// and by the lock button inside the sidebar header. Returns the new value so a
// caller can close the sidebar when it locks.
export function toggleSidebarLock(): boolean {
  const next = !locked()
  setLocked(next)
  if (next) setPinned(false)
  return next
}
