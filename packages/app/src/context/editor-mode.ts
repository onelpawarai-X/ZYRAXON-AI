// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSignal } from "solid-js"

export const [editorMode, setEditorModeSignal] = createSignal(true)

export function setEditorMode(active: boolean, directory?: string) {
  setEditorModeSignal(active)
  window.api?.setEditorMode?.(active, directory)
}
