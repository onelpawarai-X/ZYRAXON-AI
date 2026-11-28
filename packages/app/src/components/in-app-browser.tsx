// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Full-window browser surface.
 *
 * Web search used to land in a small centred modal, so the page sat in a box the
 * user could not scroll and never filled the window. It now takes over the whole
 * window: the desktop app embeds its real Chromium view, the web build uses the
 * streamed browser (or hands the URL to the real browser).
 */

import { createSignal, onCleanup, onMount, Show, type Accessor } from "solid-js"
import { RemoteBrowser } from "@/components/remote-browser"
import { BrowserSurface } from "@/pages/session/browser-panel"

const [open, setOpen] = createSignal(false)
const [url, setUrl] = createSignal("")

const hasEmbeddedBrowser = () => Boolean(window.api?.browser)

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
  // The desktop browser view is shared with the session panel, which needs its
  // bounds recalculated once this surface is gone.
  window.dispatchEvent(new Event("resize"))
}

/**
 * Google blocks datacenter IPs with a CAPTCHA, so the streamed server-side
 * browser falls back to Bing; the embedded Chromium runs from the user's own
 * machine and can use Google.
 */
export function webSearchUrl(query: string): string {
  const engine = hasEmbeddedBrowser() ? "https://www.google.com/search?q=" : "https://www.bing.com/search?q="
  return `${engine}${encodeURIComponent(query)}`
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
        class="fixed inset-0 z-[9999] flex min-h-0 flex-col bg-v2-background-bg-base"
        role="dialog"
        aria-modal="true"
        aria-label="Browser"
      >
        <Show
          when={hasEmbeddedBrowser()}
          fallback={<RemoteBrowser initialUrl={url()} onClose={closeInAppBrowser} path="/search-browser-ws" />}
        >
          <BrowserSurface variant="overlay" initialUrl={url()} onClose={closeInAppBrowser} />
        </Show>
      </div>
    </Show>
  )
}
