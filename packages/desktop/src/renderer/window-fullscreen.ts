// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSignal } from "solid-js"

const [windowFullscreen, setWindowFullscreen] = createSignal(false)

window.api.onWindowFullscreenChanged(setWindowFullscreen)
void window.api.getWindowFullscreen().then(setWindowFullscreen)

export { windowFullscreen }
