import { createSignal } from "solid-js"

export const [editorMode, setEditorModeSignal] = createSignal(true)

export function setEditorMode(active: boolean, directory?: string) {
  setEditorModeSignal(active)
  window.api?.setEditorMode?.(active, directory)
}
