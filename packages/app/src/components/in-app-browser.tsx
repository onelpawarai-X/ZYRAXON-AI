// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * In-app web browser overlay.
 *
 * Web search results used to open in the system browser, which threw the user out
 * of the app and into a separate tab. This overlay keeps the page inside the app:
 * the palette's web entry, the embedded Browser tab and the Omniscient Search all
 * route here, so a search stays in one window and one box.
 *
 * Inside the desktop app the real embedded Chromium view is used (window.api.browser
 * renders into the session Browser tab, and window.api.openLink can hand off). On the
 * web build there is no Chromium view to host, so the page renders in a sandboxed
 * frame and a "Open in browser" escape hatch is offered for sites that refuse framing.
 */

import { createSignal, onCleanup, onMount, Show, type Accessor } from "solid-js"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { IconButtonV2 } from "@zyraxon-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@zyraxon-ai/ui/v2/icon"

const [open, setOpen] = createSignal(false)
const [url, setUrl] = createSignal("")
const [address, setAddress] = createSignal("")
const [frameError, setFrameError] = createSignal(false)

export function getInAppBrowserOpen(): Accessor<boolean> {
  return open
}

export function openInAppBrowser(target: string): void {
  const normalized = /^https?:\/\//i.test(target) ? target : `https://${target}`
  setAddress(normalized)
  setUrl(normalized)
  setFrameError(false)
  setOpen(true)
}

export function closeInAppBrowser(): void {
  setOpen(false)
  setUrl("")
  setAddress("")
  setFrameError(false)
}

export function InAppBrowserOverlay() {
  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open()) closeInAppBrowser()
    }
    window.addEventListener("keydown", onKey)
    onCleanup(() => window.removeEventListener("keydown", onKey))
  })

  const submit = (event: Event) => {
    event.preventDefault()
    const value = address().trim()
    if (!value) return
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`
    setAddress(normalized)
    setFrameError(false)
    setUrl(normalized)
  }

  return (
    <Show when={open()}>
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeInAppBrowser()
        }}
      >
        <div class="flex h-full max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-v2-border-border-weak-base bg-v2-background-bg-base shadow-2xl">
          <div class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-weaker-base bg-v2-surface-surface-base px-3 py-2">
            <form
              class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-v2-border-border-weak-base bg-v2-background-bg-base px-3 focus-within:border-v2-accent-accent-base"
              onSubmit={submit}
            >
              <IconV2 name="globe" class="shrink-0 text-v2-text-text-faint" />
              <input
                value={address()}
                spellcheck={false}
                autocomplete="off"
                aria-label="In-app browser address"
                class="min-w-0 flex-1 bg-transparent text-[13px] leading-none text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
                placeholder="Search or enter a URL"
                onInput={(event) => setAddress(event.currentTarget.value)}
              />
            </form>
            <ButtonV2
              variant="ghost-muted"
              size="normal"
              onClick={() => window.open(url(), "_blank", "noopener")}
            >
              Open in browser
            </ButtonV2>
            <IconButtonV2
              icon={<IconV2 name="xmark-small" />}
              variant="ghost-muted"
              size="normal"
              onClick={closeInAppBrowser}
              aria-label="Close"
            />
          </div>

          <div class="relative min-h-0 flex-1 bg-white">
            <iframe
              src={url()}
              class="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              title="In-app browser"
              onLoad={() => setFrameError(false)}
            />
            <Show when={frameError()}>
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-v2-background-bg-base px-8 text-center">
                <IconV2 name="globe" class="text-3xl text-v2-text-text-faint" />
                <div class="text-[13px] text-v2-text-text-muted">
                  This site does not allow itself to be shown inside the app.
                </div>
                <ButtonV2 variant="contrast" size="normal" onClick={() => window.open(url(), "_blank", "noopener")}>
                  Open in browser
                </ButtonV2>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  )
}
