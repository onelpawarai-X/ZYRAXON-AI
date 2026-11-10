// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSignal, onCleanup, onMount, Show, For } from "solid-js"
import { IconButtonV2 } from "@zyraxon-ai/ui/v2/icon-button-v2"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@zyraxon-ai/ui/v2/icon"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"
import { usePrompt } from "@/context/prompt"

type BrowserState = {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  secure: boolean
  error?: string
}

type BrowserPermissionRequest = {
  id: string
  permission: string
  requestingUrl?: string
  origin?: string
  isMainFrame?: boolean
}

type BrowserReviewSelection = {
  url: string
  title: string
  selector: string
  text: string
  rect: { x: number; y: number; width: number; height: number }
  html: string
}

const blankState: BrowserState = {
  url: "",
  title: "Loading…",
  loading: true,
  canGoBack: false,
  canGoForward: false,
  secure: true,
}

function readablePermission(permission: string) {
  return permission
    .replace(/-/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
}

export function BrowserPanel() {
  const prompt = usePrompt()
  const [state, setState] = createSignal<BrowserState>(blankState)
  const [address, setAddress] = createSignal("https://www.google.com/")
  const [addressFocused, setAddressFocused] = createSignal(false)
  const [permissions, setPermissions] = createSignal<BrowserPermissionRequest[]>([])
  const [reviewEnabled, setReviewEnabled] = createSignal(false)
  const [selection, setSelection] = createSignal<BrowserReviewSelection | null>(null)
  const [dismissedError, setDismissedError] = createSignal(false)
  let viewportRef: HTMLDivElement | undefined

  const updateBounds = () => {
    const element = viewportRef
    if (!element || !window.api?.browser) return
    const rect = element.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) {
      void window.api.browser.setBounds({ x: 0, y: 0, width: 0, height: 0, visible: false })
      return
    }
    void window.api.browser.setBounds({
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      visible: true,
    })
  }

  const navigate = () => {
    const value = address().trim()
    if (!value) return
    if (window.api?.browser) {
      void window.api.browser.navigate(value)
      viewportRef?.focus()
      return
    }
    // Web fallback: there is no embedded browser outside the desktop app, so open
    // the address in a real browser window instead.
    const url = /^https?:\/\//i.test(value) ? value : `https://${value}`
    setAddress(url)
    window.open(url, "_blank", "noopener")
  }

  const toggleReview = () => {
    const next = !reviewEnabled()
    setReviewEnabled(next)
    void window.api?.browser?.setReviewMode(next)
  }

  const addSelectionToPrompt = () => {
    const value = selection()
    if (!value) return
    prompt.context.add({
      type: "file",
      path: value.url,
      comment: `Selected element in ${value.title}\nSelector: ${value.selector}\n${value.text}`,
      commentOrigin: "review",
      preview: value.html,
    })
    setSelection(null)
  }

  onMount(() => {
    if (!window.api?.browser) return
    void window.api.browser.create("https://www.google.com/")

    const unsubscribeState = window.api.browser.onState((next) => {
      setDismissedError(false)
      setState(next)
      if (!addressFocused()) setAddress(next.url || "https://www.google.com/")
    })
    const unsubscribePermissions = window.api.browser.onPermissionRequest((request) => {
      setPermissions((current) => (current.some((item) => item.id === request.id) ? current : [...current, request]))
      queueMicrotask(updateBounds)
    })
    const unsubscribeSelection = window.api.browser.onReviewSelection((next) => {
      setSelection(next)
      queueMicrotask(updateBounds)
    })
    const unsubscribeReviewMode = window.api.browser.onReviewModeChanged((enabled) => {
      setReviewEnabled(enabled)
      queueMicrotask(updateBounds)
    })

    const observer = new ResizeObserver(() => updateBounds())
    if (viewportRef) observer.observe(viewportRef)
    const onResize = () => updateBounds()
    window.addEventListener("resize", onResize)
    const boundsFrame = requestAnimationFrame(updateBounds)
    const lateBoundsFrame = window.setTimeout(updateBounds, 300)

    onCleanup(() => {
      unsubscribeState()
      unsubscribePermissions()
      unsubscribeSelection()
      unsubscribeReviewMode()
      observer.disconnect()
      window.removeEventListener("resize", onResize)
      window.clearTimeout(lateBoundsFrame)
      cancelAnimationFrame(boundsFrame)
      if (window.api?.browser) void window.api.browser.setBounds({ x: 0, y: 0, width: 0, height: 0, visible: false })
    })
  })

  return (
    <div class="h-full min-h-0 flex flex-col overflow-hidden bg-v2-background-bg-base text-v2-text-text-base">
      <div class="shrink-0 border-b border-v2-border-border-weaker-base bg-v2-surface-surface-base/95 px-3 py-2 backdrop-blur">
        <div class="flex items-center gap-1.5">
          <TooltipV2 value="Back" placement="bottom">
            <IconButtonV2
              icon={<IconV2 name="back" />}
              variant="ghost-muted"
              size="normal"
              disabled={!state().canGoBack}
              onClick={() => void window.api?.browser?.back()}
              aria-label="Back"
            />
          </TooltipV2>
          <TooltipV2 value="Forward" placement="bottom">
            <IconButtonV2
              icon={<IconV2 name="forward" />}
              variant="ghost-muted"
              size="normal"
              disabled={!state().canGoForward}
              onClick={() => void window.api?.browser?.forward()}
              aria-label="Forward"
            />
          </TooltipV2>
          <TooltipV2 value={state().loading ? "Stop loading" : "Reload"} placement="bottom">
            <IconButtonV2
              icon={<IconV2 name={state().loading ? "stop" : "refresh"} />}
              variant="ghost-muted"
              size="normal"
              onClick={() => void (state().loading ? window.api?.browser?.stop() : window.api?.browser?.reload())}
              aria-label={state().loading ? "Stop" : "Reload"}
            />
          </TooltipV2>

          <form
            class="min-w-0 flex-1 h-9 flex items-center gap-2 rounded-full border border-v2-border-border-weak-base bg-v2-background-bg-base px-3 focus-within:border-v2-accent-accent-base focus-within:ring-2 focus-within:ring-v2-accent-accent-base/20"
            onSubmit={(event) => {
              event.preventDefault()
              navigate()
            }}
          >
            <IconV2
              name={state().secure ? "lock" : "unlock"}
              class={state().secure ? "shrink-0 text-v2-icon-icon-success-base" : "shrink-0 text-v2-icon-icon-warning-base"}
            />
            <input
              value={address()}
              spellcheck={false}
              autocomplete="off"
              autocapitalize="off"
              aria-label="Browser address"
              class="min-w-0 flex-1 bg-transparent text-[13px] leading-none text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
              placeholder="Search or enter a URL"
              onFocus={() => setAddressFocused(true)}
              onBlur={() => setAddressFocused(false)}
              onInput={(event) => setAddress(event.currentTarget.value)}
            />
            <Show when={state().loading}>
              <div class="size-3 shrink-0 rounded-full border border-v2-icon-icon-faint border-t-v2-accent-accent-base animate-spin" />
            </Show>
          </form>

          <TooltipV2 value={reviewEnabled() ? "Exit element review (Ctrl+Shift+C)" : "Toggle element review (Ctrl+Shift+C)"} placement="bottom">
            <button
              type="button"
              class="h-9 shrink-0 flex items-center gap-2 rounded-full border px-3 text-[12px] font-medium transition-all"
              classList={{
                "border-v2-accent-accent-base bg-v2-accent-accent-base/15 text-v2-accent-accent-base shadow-[0_0_24px_rgba(0,212,255,0.18)]":
                  reviewEnabled(),
                "border-v2-border-border-weak-base bg-v2-surface-surface-base text-v2-text-text-muted hover:text-v2-text-text-base hover:border-v2-accent-accent-base/50":
                  !reviewEnabled(),
              }}
              onClick={toggleReview}
              aria-pressed={reviewEnabled()}
              aria-label="Toggle review"
            >
              <IconV2 name={reviewEnabled() ? "cursor" : "message-square"} />
              <span>Toggle Review</span>
            </button>
          </TooltipV2>
          <TooltipV2 value="Open in system browser" placement="bottom">
            <IconButtonV2
              icon={<IconV2 name="outline-square-arrow" />}
              variant="ghost-muted"
              size="normal"
              onClick={() => void window.api?.browser?.openExternal()}
              aria-label="Open in system browser"
            />
          </TooltipV2>
        </div>

        <Show when={reviewEnabled()}>
          <div class="mt-2 flex items-center gap-2 rounded-lg border border-v2-accent-accent-base/30 bg-v2-accent-accent-base/10 px-3 py-2 text-[12px] text-v2-accent-accent-base">
            <IconV2 name="cursor" />
            <span class="min-w-0 flex-1">Review is on — click any element on the page. Press Escape or Ctrl+Shift+C to exit.</span>
          </div>
        </Show>
      </div>

      <Show when={permissions().length > 0}>
        <div class="shrink-0 border-b border-v2-border-border-weaker-base bg-v2-surface-surface-raised px-3 py-2">
          <For each={permissions()}>
            {(request) => (
              <div class="flex items-center gap-3 rounded-xl border border-v2-border-border-weak-base bg-v2-background-bg-base px-3 py-2">
                <IconV2 name="outline-sliders" class="shrink-0 text-v2-icon-icon-warning-base" />
                <div class="min-w-0 flex-1">
                  <div class="text-[12px] font-medium text-v2-text-text-base">This site wants {readablePermission(request.permission)} access</div>
                  <div class="truncate text-[11px] text-v2-text-text-faint">{request.requestingUrl || request.origin || "Unknown origin"}</div>
                </div>
                <button
                  type="button"
                  class="h-8 shrink-0 rounded-lg border border-v2-border-border-weak-base px-3 text-[12px] text-v2-text-text-muted hover:text-v2-text-text-base"
                  onClick={() => {
                    setPermissions((current) => current.filter((item) => item.id !== request.id))
                    void window.api?.browser?.respondPermission({ id: request.id, allowed: false })
                    queueMicrotask(updateBounds)
                  }}
                >
                  Deny
                </button>
                <button
                  type="button"
                  class="h-8 shrink-0 rounded-lg bg-v2-accent-accent-base px-3 text-[12px] font-medium text-black hover:brightness-110"
                  onClick={() => {
                    setPermissions((current) => current.filter((item) => item.id !== request.id))
                    void window.api?.browser?.respondPermission({ id: request.id, allowed: true })
                    queueMicrotask(updateBounds)
                  }}
                >
                  Allow
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="min-h-0 flex-1 bg-black">
        <Show
          when={!!window.api?.browser}
          fallback={
            <div class="flex h-full w-full flex-col items-center justify-center gap-4 bg-v2-background-bg-base px-8 text-center">
              <IconV2 name="globe" class="text-3xl text-v2-text-text-faint" />
              <div class="text-[13px] text-v2-text-text-muted">
                The embedded real browser runs inside the ZYRAXON desktop app.
              </div>
              <ButtonV2
                variant="contrast"
                size="normal"
                onClick={() => window.open(address() || "https://www.google.com/", "_blank", "noopener")}
              >
                Open in real browser
              </ButtonV2>
            </div>
          }
        >
          <div ref={viewportRef} class="h-full w-full outline-none" tabIndex={0} aria-label="ZYRAXON browser viewport" />
        </Show>
      </div>

      <Show when={selection()}>
        {(selected) => (
          <div class="shrink-0 border-t border-v2-border-border-weaker-base bg-v2-surface-surface-base px-3 py-2">
            <div class="flex items-start gap-3 rounded-xl border border-v2-accent-accent-base/25 bg-v2-accent-accent-base/5 px-3 py-2">
              <IconV2 name="message-square" class="mt-0.5 shrink-0 text-v2-accent-accent-base" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <div class="text-[12px] font-medium text-v2-text-text-base">Element selected</div>
                  <code class="max-w-[55%] truncate rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-v2-text-text-faint">{selected().selector}</code>
                </div>
                <div class="mt-0.5 line-clamp-2 text-[12px] leading-5 text-v2-text-text-muted">{selected().text || "(No visible text)"}</div>
              </div>
              <button
                type="button"
                class="h-8 shrink-0 rounded-lg border border-v2-border-border-weak-base px-2.5 text-[12px] text-v2-text-text-muted hover:text-v2-text-text-base"
                onClick={() => setSelection(null)}
              >
                Close
              </button>
              <button
                type="button"
                class="h-8 shrink-0 rounded-lg bg-v2-accent-accent-base px-3 text-[12px] font-medium text-black hover:brightness-110"
                onClick={addSelectionToPrompt}
              >
                Add to chat
              </button>
            </div>
          </div>
        )}
      </Show>

      <Show when={state().error && !dismissedError()}>
        <div class="shrink-0 flex items-center gap-2 border-t border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          <IconV2 name="xmark-small" class="shrink-0" />
          <span class="min-w-0 flex-1 truncate">{state().error}</span>
          <button type="button" class="shrink-0 text-red-300 hover:text-red-200" onClick={() => setDismissedError(true)}>
            Dismiss
          </button>
        </div>
      </Show>

      <div class="shrink-0 flex items-center justify-between border-t border-v2-border-border-weaker-base bg-v2-surface-surface-base/70 px-3 py-1.5 text-[11px] text-v2-text-text-faint">
        <div class="flex min-w-0 items-center gap-2">
          <IconV2 name={state().secure ? "lock" : "unlock"} class={state().secure ? "text-v2-icon-icon-success-base" : "text-v2-icon-icon-warning-base"} />
          <span class="truncate">{state().url || "No page loaded"}</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span class="hidden sm:inline">{state().secure ? "Secure connection" : "Not secure"}</span>
          <span class="text-v2-text-text-faint">·</span>
          <span>{reviewEnabled() ? "Review on" : "Review off"}</span>
        </div>
      </div>
    </div>
  )
}
