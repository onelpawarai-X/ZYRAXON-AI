// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSignal } from "solid-js"

// The session sidebar is hidden by default. Reaching the left edge opens it for
// as long as the pointer stays; the titlebar toggle pins it open so it survives
// the pointer leaving. Pinning lives outside the sidebar component because the
// toggle that sets it is rendered in the titlebar.
const [pinned, setPinned] = createSignal(false)

export const sidebarPinned = pinned
export const setSidebarPinned = setPinned

// Locked is the inverse of pinned: locked keeps the sidebar shut even when the
// pointer reaches the left edge, while pinned keeps it open after the pointer
// leaves. Both are stored as the same signal so they can never drift apart.
export const sidebarLocked = () => !pinned()
export const setSidebarLocked = (value: boolean) => setPinned(!value)
