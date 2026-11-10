// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSignal } from "solid-js"

// The session sidebar is hidden by default. Reaching the left edge opens it for
// as long as the pointer stays; the titlebar toggle pins it open so it survives
// the pointer leaving. Pinning lives outside the sidebar component because the
// toggle that sets it is rendered in the titlebar.
const [pinned, setPinned] = createSignal(false)

export const sidebarPinned = pinned
export const setSidebarPinned = setPinned
