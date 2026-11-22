// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * In-app web browser overlay.
 *
 * Web search results used to open in the system browser, which threw the user out
 * of the app and into a separate tab. This overlay keeps the page inside the app:
 * the palette's web entry, the embedded Browser tab and the Omniscient Search all
 * route here, so a search stays in one window and one box.
 *
 * The page is rendered by the real Chromium process on the ZYRAXON server and
 * streamed over `/browser-ws`. That keeps logins, cookies and JavaScript-heavy
 * sites working, which a sandboxed <iframe> cannot do.
 */

import { createSignal, onCleanup, onMount, Show, type Accessor } from "solid-js"
import { RemoteBrowser } from "@/components/remote-browser"

const [open, setOpen] = createSignal(false)
const [url, setUrl] = createSignal("")

export function getInAppBrowserOpen(): Accessor<boolean> {
  return open
}

export function openInAppBrowser(target: string): void {
  const normalized = /^https?:\/\//i.test(target) ? target : `https://${target}`
  setUrl(normalized)
  setOpen(true)
}

export function closeInAppBrowser(): void {
  setOpen(false)
  setUrl("")
}

export function InAppBrowserOverlay() {
  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open()) closeInAppBrowser()
    }
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail
      if (detail?.url) openInAppBrowser(detail.url)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("zyraxon-open-in-app-browser", onOpen)
    onCleanup(() => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("zyraxon-open-in-app-browser", onOpen)
    })
  })

  return (
    <Show when={open()}>
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeInAppBrowser()
        }}
      >
        <div class="flex h-full max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-v2-border-border-weak-base bg-v2-background-bg-base shadow-2xl">
          <RemoteBrowser initialUrl={url()} onClose={closeInAppBrowser} path="/search-browser-ws" />
        </div>
      </div>
    </Show>
  )
}
