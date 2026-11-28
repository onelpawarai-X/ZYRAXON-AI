// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Chromium rendered by the ZYRAXON server and streamed into the web app.
 *
 * A normal web page cannot host Electron's <webview>, and most real sites
 * (Google included) refuse to load inside an <iframe>. The server keeps a real
 * Chromium window with a persistent profile and relays frames plus input over
 * `/browser-ws`; logins therefore survive reloads and app restarts.
 */

import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js"
import { IconButtonV2 } from "@zyraxon-ai/ui/v2/icon-button-v2"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@zyraxon-ai/ui/v2/icon"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"
import { tryUsePrompt } from "@/context/prompt"

type RemoteState = {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  secure: boolean
}

type RemoteSelection = {
  url: string
  title: string
  selector: string
  text: string
  rect: { x: number; y: number; width: number; height: number }
  html: string
}

const initial: RemoteState = {
  url: "",
  title: "Connecting…",
  loading: true,
  canGoBack: false,
  canGoForward: false,
  secure: true,
}

const KEYS = new Set(["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "])

export function RemoteBrowser(props: { initialUrl?: string; onClose?: () => void; path?: string }) {
  const prompt = tryUsePrompt()
  const [state, setState] = createSignal<RemoteState>(initial)
  const [address, setAddress] = createSignal(props.initialUrl || "https://www.google.com/")
  const [addressFocused, setAddressFocused] = createSignal(false)
  const [frame, setFrame] = createSignal("")
  const [review, setReview] = createSignal(false)
  const [selection, setSelection] = createSignal<RemoteSelection | null>(null)
  const [error, setError] = createSignal("")
  const [zoom, setZoom] = createSignal(1)
  let socket: WebSocket | undefined
  let retry: number | undefined
  let image: HTMLImageElement | undefined
  let viewport: HTMLDivElement | undefined
  let resizeObserver: ResizeObserver | undefined

  const send = (payload: Record<string, unknown>) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
  }

  const navigate = (value?: string) => {
    const raw = (value ?? address()).trim()
    if (!raw) return
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    setAddress(url)
    setState((current) => ({ ...current, loading: true }))
    send({ type: "navigate", url })
  }

  const applyViewport = () => {
    if (!viewport) return
    const box = viewport.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return
    send({ type: "resize", width: Math.round(box.width / zoom()), height: Math.round(box.height / zoom()) })
  }

  const connect = () => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const next = new WebSocket(`${protocol}//${location.host}${props.path || "/browser-ws"}`)
    socket = next
    next.onopen = () => {
      setError("")
      applyViewport()
      send({ type: "navigate", url: address() })
    }
    next.onclose = () => {
      retry = window.setTimeout(connect, 2000)
    }
    next.onerror = () => setError("Browser connection failed. Reconnecting…")
    next.onmessage = (event) => {
      let message: Record<string, any>
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      if (message.type === "state") {
        setState({
          url: message.url || "",
          title: message.title || "Untitled",
          loading: Boolean(message.loading),
          canGoBack: Boolean(message.canGoBack),
          canGoForward: Boolean(message.canGoForward),
          secure: Boolean(message.secure),
        })
        if (!addressFocused()) setAddress(message.url || address())
      }
      if (message.type === "frame") setFrame(message.data || "")
      if (message.type === "selection") setSelection(message as RemoteSelection)
      if (message.type === "error") setError(String(message.message || "Browser error"))
    }
  }

  onMount(() => {
    connect()
    resizeObserver = new ResizeObserver(applyViewport)
    if (viewport) resizeObserver.observe(viewport)
  })
  onCleanup(() => {
    resizeObserver?.disconnect()
    window.clearTimeout(retry)
    socket?.close()
  })

  createEffect(() => {
    const next = props.initialUrl
    if (!next || next === address()) return
    setAddress(next)
    send({ type: "navigate", url: next })
  })

  createEffect(() => {
    zoom()
    applyViewport()
  })

  const point = (event: MouseEvent) => {
    const element = image
    if (!element) return { x: 0, y: 0 }
    const box = element.getBoundingClientRect()
    const width = element.naturalWidth || 1280
    const height = element.naturalHeight || 800
    const scale = Math.min(box.width / width, box.height / height)
    const drawnWidth = width * scale
    const drawnHeight = height * scale
    const left = box.left + (box.width - drawnWidth) / 2
    const top = box.top + (box.height - drawnHeight) / 2
    return {
      x: Math.round((event.clientX - left) / scale),
      y: Math.round((event.clientY - top) / scale),
    }
  }

  const onMouseDown = (event: MouseEvent) => {
    viewport?.focus()
    const { x, y } = point(event)
    if (review()) {
      send({ type: "review", x, y })
      return
    }
    send({
      type: "mouse",
      event: "pressed",
      x,
      y,
      button: event.button === 2 ? "right" : event.button === 1 ? "middle" : "left",
    })
  }

  const onMouseUp = (event: MouseEvent) => {
    if (review()) return
    const { x, y } = point(event)
    send({
      type: "mouse",
      event: "released",
      x,
      y,
      button: event.button === 2 ? "right" : event.button === 1 ? "middle" : "left",
    })
  }

  const onMouseMove = (event: MouseEvent) => {
    if (review()) return
    const { x, y } = point(event)
    send({ type: "mouse", event: "moved", x, y })
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const { x, y } = point(event)
    send({ type: "wheel", x, y, deltaX: event.deltaX, deltaY: event.deltaY })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const modifiers = (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0)
    send({ type: "key", event: "keydown", key: event.key, code: event.code, modifiers })
    if (KEYS.has(event.key) || (modifiers & (2 | 4))) event.preventDefault()
  }

  const onKeyUp = (event: KeyboardEvent) => {
    const modifiers = (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0)
    send({ type: "key", event: "keyup", key: event.key, code: event.code, modifiers })
  }

  const addSelection = () => {
    const value = selection()
    if (!value) return
    const comment = `Selected element in ${value.title}\nSelector: ${value.selector}\n${value.text}`
    // The overlay mounts above the prompt providers, so a selection picked here
    // has no composer to land in; copy it instead of dropping it.
    if (!prompt) {
      void navigator.clipboard?.writeText(comment)
      setSelection(null)
      return
    }
    prompt.context.add({
      type: "file",
      path: value.url,
      comment,
      commentOrigin: "review",
      preview: value.html,
    })
    setSelection(null)
  }

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
              onClick={() => send({ type: "back" })}
              aria-label="Back"
            />
          </TooltipV2>
          <TooltipV2 value="Forward" placement="bottom">
            <IconButtonV2
              icon={<IconV2 name="forward" />}
              variant="ghost-muted"
              size="normal"
              disabled={!state().canGoForward}
              onClick={() => send({ type: "forward" })}
              aria-label="Forward"
            />
          </TooltipV2>
          <TooltipV2 value={state().loading ? "Stop loading" : "Reload"} placement="bottom">
            <IconButtonV2
              icon={<IconV2 name={state().loading ? "stop" : "refresh"} />}
              variant="ghost-muted"
              size="normal"
              onClick={() => send({ type: state().loading ? "stop" : "reload" })}
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

          <div class="flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-v2-border-border-weak-base bg-v2-surface-surface-base px-1">
            <button
              type="button"
              class="size-7 rounded-full text-[13px] text-v2-text-text-muted hover:bg-v2-surface-surface-raised hover:text-v2-text-text-base"
              onClick={() => setZoom(Math.max(0.5, Math.round((zoom() - 0.1) * 10) / 10))}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              class="min-w-11 text-[11px] font-medium text-v2-text-text-muted hover:text-v2-text-text-base"
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom() * 100)}%
            </button>
            <button
              type="button"
              class="size-7 rounded-full text-[13px] text-v2-text-text-muted hover:bg-v2-surface-surface-raised hover:text-v2-text-text-base"
              onClick={() => setZoom(Math.min(2, Math.round((zoom() + 0.1) * 10) / 10))}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>

          <TooltipV2 value={review() ? "Exit element review" : "Toggle element review"} placement="bottom">
            <button
              type="button"
              class="h-9 shrink-0 flex items-center gap-2 rounded-full border px-3 text-[12px] font-medium transition-all"
              classList={{
                "border-v2-accent-accent-base bg-v2-accent-accent-base/15 text-v2-accent-accent-base shadow-[0_0_24px_rgba(0,212,255,0.18)]":
                  review(),
                "border-v2-border-border-weak-base bg-v2-surface-surface-base text-v2-text-text-muted hover:text-v2-text-text-base hover:border-v2-accent-accent-base/50":
                  !review(),
              }}
              onClick={() => setReview(!review())}
              aria-pressed={review()}
              aria-label="Toggle review"
            >
              <IconV2 name={review() ? "cursor" : "message-square"} />
              <span>Toggle Review</span>
            </button>
          </TooltipV2>
          <TooltipV2 value="Open in system browser" placement="bottom">
            <IconButtonV2
              icon={<IconV2 name="outline-square-arrow" />}
              variant="ghost-muted"
              size="normal"
              onClick={() => window.open(state().url || address(), "_blank", "noopener")}
              aria-label="Open in system browser"
            />
          </TooltipV2>
          <Show when={props.onClose}>
            <IconButtonV2
              icon={<IconV2 name="xmark-small" />}
              variant="ghost-muted"
              size="normal"
              onClick={() => props.onClose?.()}
              aria-label="Close"
            />
          </Show>
        </div>

        <Show when={review()}>
          <div class="mt-2 flex items-center gap-2 rounded-lg border border-v2-accent-accent-base/30 bg-v2-accent-accent-base/10 px-3 py-2 text-[12px] text-v2-accent-accent-base">
            <IconV2 name="cursor" />
            <span class="min-w-0 flex-1">Review is on — click any element on the page.</span>
          </div>
        </Show>
        <Show when={error()}>
          <div class="mt-2 rounded-lg border border-v2-border-border-weak-base bg-v2-surface-surface-raised px-3 py-2 text-[12px] text-v2-text-text-muted">
            {error()}
          </div>
        </Show>
      </div>

      <Show when={selection()}>
        {(value) => (
          <div class="shrink-0 border-b border-v2-border-border-weaker-base bg-v2-surface-surface-raised px-3 py-2">
            <div class="flex items-start gap-3 rounded-xl border border-v2-border-border-weak-base bg-v2-background-bg-base px-3 py-2">
              <IconV2 name="cursor" class="mt-0.5 shrink-0 text-v2-accent-accent-base" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-[12px] font-medium text-v2-text-text-base">{value().selector}</div>
                <div class="line-clamp-2 text-[11px] text-v2-text-text-faint">{value().text}</div>
              </div>
              <ButtonV2 variant="contrast" size="small" onClick={addSelection}>
                Add to prompt
              </ButtonV2>
              <button
                type="button"
                class="h-8 shrink-0 rounded-lg border border-v2-border-border-weak-base px-2 text-[12px] text-v2-text-text-muted hover:text-v2-text-text-base"
                onClick={() => setSelection(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </Show>

      <div
        ref={viewport}
        class="relative min-h-0 flex-1 overflow-hidden bg-black outline-none"
        tabIndex={0}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(event) => event.preventDefault()}
      >
        <Show
          when={frame()}
          fallback={
            <div class="flex h-full w-full flex-col items-center justify-center gap-3 text-v2-text-text-faint">
              <div class="size-6 rounded-full border-2 border-v2-icon-icon-faint border-t-v2-accent-accent-base animate-spin" />
              <div class="text-[12px]">Starting the real browser…</div>
            </div>
          }
        >
          <img
            ref={image}
            src={`data:image/jpeg;base64,${frame()}`}
            class="h-full w-full select-none"
            style={{ "object-fit": "contain" }}
            draggable={false}
            alt=""
          />
        </Show>
      </div>
    </div>
  )
}
