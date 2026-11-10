// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * SITE PREVIEW COMPONENT
 *
 * The in-app preview surface. It has two targets and switches between them:
 *
 * - url    a web page rendered live in a webview, fully interactive
 * - window any application already running on the machine, mirrored as a live
 *          video feed and driven through the agent's UI tools
 *
 * Window mirroring uses Electron's desktopCapturer via getUserMedia, which
 * enumerates and captures windows the same way on Windows, macOS and Linux, so
 * there is no per-platform branch here. The user stays in control: attaching a
 * window only mirrors it, and detaching stops immediately.
 */

import { createEffect, createSignal, onCleanup, onMount, Show, For } from "solid-js"
import { IconButtonV2 } from "@zyraxon-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@zyraxon-ai/ui/v2/icon"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"
import { setPreviewActiveState, getAttachedWindow, setAttachedWindowState } from "./preview-state"

type DeviceMode = "desktop" | "tablet" | "mobile"

type PreviewState = {
  url: string | null
  siteName: string | null
  siteId: string | null
  attachedWindow?: { id: string; name: string } | null
  timestamp: string
}

type CaptureSource = {
  id: string
  name: string
  appIcon: string | null
  thumbnail: string | null
}

/** Mirrors the shape the desktop main process accepts for preview input. */
type PreviewInputAction = {
  kind: "click" | "scroll" | "key" | "type" | "move"
  x?: number
  y?: number
  button?: "left" | "right" | "middle"
  double?: boolean
  dy?: number
  dx?: number
  keys?: string[]
  text?: string
}

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
}

const DEVICE_LABELS: Record<DeviceMode, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
}

export function SitePreview() {
  const [preview, setPreview] = createSignal<PreviewState>({
    url: null,
    siteName: null,
    siteId: null,
    timestamp: new Date().toISOString(),
  })
  const [device, setDevice] = createSignal<DeviceMode>("desktop")
  const [mode, setMode] = createSignal<"url" | "window">("url")
  const [sources, setSources] = createSignal<CaptureSource[]>([])
  const [attached, setAttached] = createSignal<CaptureSource | null>(null)
  const [streamError, setStreamError] = createSignal<string | null>(null)
  const [picking, setPicking] = createSignal(false)
  // Control mode: when on, a click or a key inside the mirrored frame is forwarded
  // to the real application instead of being swallowed by the panel. Off by default
  // so merely looking at a window never types into it.
  const [control, setControl] = createSignal(false)
  const [geometry, setGeometry] = createSignal<{ x: number; y: number; width: number; height: number } | null>(null)
  const [lastError, setLastError] = createSignal<string | null>(null)

  let videoRef: HTMLVideoElement | undefined
  let frameRef: HTMLDivElement | undefined
  let stream: MediaStream | null = null
  let lastMove = 0

  const stopStream = () => {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    if (videoRef) videoRef.srcObject = null
  }

  const loadSources = async () => {
    if (!window.api?.listPreviewSources) return
    try {
      setSources(await window.api.listPreviewSources())
    } catch {
      setSources([])
    }
  }

  const attach = async (source: CaptureSource, mirror = true) => {
    stopStream()
    setStreamError(null)
    try {
      const next = (await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: source.id,
          },
        } as unknown as MediaTrackConstraints,
      })) as unknown as MediaStream
      stream = next
      setAttached(source)
      setMode("window")
      setPicking(false)
      // Mirror the choice into the shared signal so the agent and the panel agree on
      // what is attached, whichever side started it.
      if (mirror) setAttachedWindowState({ id: source.id, name: source.name })
      queueMicrotask(() => {
        if (videoRef) {
          videoRef.srcObject = next
          void videoRef.play().catch(() => undefined)
        }
      })
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : String(error))
    }
  }

  const detach = () => {
    stopStream()
    setAttached(null)
    setMode("url")
    // Control belongs to the window that was attached; dropping the window must drop it
    // too, or the next attach would start out typing into whatever is in focus.
    setControl(false)
    setGeometry(null)
    setLastError(null)
    // Clearing the shared signal is what also clears the file on the agent side, so the
    // panel is not left holding a window the agent already let go of.
    setAttachedWindowState(null)
    void window.api?.setPreviewState?.({
      ...preview(),
      attachedWindow: null,
      timestamp: new Date().toISOString(),
    })
  }

  // The agent drives this panel: x_preview_attach_window writes the window it wants
  // mirrored to the shared state and x_preview_detach_window clears it. Reacting to that
  // signal here is what makes a tool call show the app on screen without a manual click.
  // Same signal on Windows, macOS and Linux.
  //
  // The agent only knows the window's OS handle and title, but getUserMedia needs an
  // Electron desktopCapturer source id — a different id space entirely, so passing the
  // handle straight through failed every time. Resolve the request against the live
  // source list by title instead, which is what the two have in common.
  const resolveSource = async (want: { id: string; name: string }): Promise<CaptureSource | null> => {
    if (!window.api?.listPreviewSources) return null
    const wanted = want.name.trim().toLowerCase()
    // A newly launched app takes a moment to appear in the capturer's list, so give
    // it a few tries before reporting nothing.
    for (let attempt = 0; attempt < 6; attempt++) {
      let list: CaptureSource[] = []
      try {
        list = await window.api.listPreviewSources()
      } catch {
        list = []
      }
      if (list.length > 0) {
        setSources(list)
        const exact = list.find((s) => s.name.trim().toLowerCase() === wanted)
        if (exact) return exact
        const contains = list.find(
          (s) => s.name.trim().toLowerCase().includes(wanted) || wanted.includes(s.name.trim().toLowerCase()),
        )
        if (contains) return contains
        // The caller may already have handed us a real source id.
        const byId = list.find((s) => s.id === want.id)
        if (byId) return byId
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return null
  }

  createEffect(() => {
    const want = getAttachedWindow()()
    const current = attached()
    if (!want) return
    if (current?.id === want.id || current?.name === want.name) return
    setPreviewActiveState(true)
    void (async () => {
      const source = await resolveSource(want)
      if (source) {
        await attach(source, false)
        return
      }
      setMode("window")
      setStreamError(
        `Could not find a window titled "${want.name}" to mirror. It may have closed, or the title changed.`,
      )
    })()
  })

  onMount(() => {
    // Subscribe before reading the current state so an update published while the read is
    // in flight is still delivered. onCleanup has to run in this synchronous scope: after an
    // await there is no owner left to attach it to, and Solid's onCleanup silently drops it,
    // which leaks one IPC listener every time the panel is mounted.
    const unsubscribe = window.api?.onSitePreviewUpdate?.((state) => {
      setPreview(state)
      setAttachedWindowState(state.attachedWindow ?? null)
    })
    if (unsubscribe) onCleanup(unsubscribe)

    void (async () => {
      if (window.api?.getPreviewState) {
        try {
          const state = await window.api.getPreviewState()
          setPreview(state)
          setAttachedWindowState(state.attachedWindow ?? null)
        } catch {}
      }
      await loadSources()
    })()
  })

  onCleanup(stopStream)

  // ─── Input forwarding ──────────────────────────────────────────────────────
  // The frame shows the window scaled to fit, so a point inside the frame is not a
  // point on the screen. Refresh the window's screen rectangle, then map the click
  // through the same "contain" fit the video uses, and send absolute coordinates.
  const toScreen = (event: MouseEvent): { x: number; y: number } | null => {
    const rect = frameRef?.getBoundingClientRect()
    const geo = geometry()
    if (!rect || !geo) return null
    // object-contain letterboxes the frame, so the drawn area is smaller than the box.
    const scale = Math.min(rect.width / geo.width, rect.height / geo.height)
    const drawnW = geo.width * scale
    const drawnH = geo.height * scale
    const offsetX = (rect.width - drawnW) / 2
    const offsetY = (rect.height - drawnH) / 2
    const localX = event.clientX - rect.left - offsetX
    const localY = event.clientY - rect.top - offsetY
    if (localX < 0 || localY < 0 || localX > drawnW || localY > drawnH) return null
    return { x: geo.x + localX / scale, y: geo.y + localY / scale }
  }

  const refreshGeometry = async () => {
    const source = attached()
    if (!source || !window.api?.previewWindowGeometry) return
    try {
      const geo = await window.api.previewWindowGeometry(source.name)
      if (geo) setGeometry(geo)
    } catch {
      /* geometry is best effort; a click simply does nothing if it is unknown */
    }
  }

  const send = async (action: PreviewInputAction) => {
    const api = window.api
    if (!api?.previewInput) return
    const result = await api.previewInput(action)
    if (result && !result.ok && result.error) setLastError(result.error)
    else setLastError(null)
  }

  const onFrameMouseDown = (event: MouseEvent) => {
    if (!control()) return
    event.preventDefault()
    const point = toScreen(event)
    if (!point) return
    void send({
      kind: "click",
      x: point.x,
      y: point.y,
      button: event.button === 2 ? "right" : event.button === 1 ? "middle" : "left",
      double: event.detail === 2,
    })
  }

  const onFrameMouseMove = (event: MouseEvent) => {
    if (!control()) return
    // Pointer position is only used to aim the next click; throttle so moving the
    // mouse does not spawn a process per pixel.
    const now = Date.now()
    if (now - lastMove < 60) return
    lastMove = now
    const point = toScreen(event)
    if (point) void send({ kind: "move", x: point.x, y: point.y })
  }

  const onFrameWheel = (event: WheelEvent) => {
    if (!control()) return
    event.preventDefault()
    const point = toScreen(event)
    if (!point) return
    void send({ kind: "scroll", x: point.x, y: point.y, dy: event.deltaY, dx: event.deltaX })
  }

  const onFrameKeyDown = (event: KeyboardEvent) => {
    if (!control()) return
    // Let the shortcuts that leave or toggle the panel through; everything else
    // belongs to the mirrored application.
    if (event.key === "Escape" && event.ctrlKey) return
    event.preventDefault()
    const named = [
      "Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown",
      "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
    ]
    if (named.includes(event.key)) {
      void send({ kind: "key", keys: [event.key.toLowerCase()] })
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      void send({ kind: "type", text: event.key })
      return
    }
    const combo: string[] = []
    if (event.ctrlKey) combo.push("ctrl")
    if (event.altKey) combo.push("alt")
    if (event.shiftKey) combo.push("shift")
    if (event.metaKey) combo.push("cmd")
    if (event.key.length === 1 || /^F\d{1,2}$/.test(event.key)) combo.push(event.key.toLowerCase())
    else combo.push(event.key.toLowerCase())
    void send({ kind: "key", keys: combo })
  }

  // Keep the window rectangle fresh while control is on: the user can move or
  // resize the mirrored window, and a stale rectangle sends clicks to the wrong place.
  createEffect(() => {
    if (!control() || !attached()) return
    void refreshGeometry()
    const timer = setInterval(() => void refreshGeometry(), 2000)
    onCleanup(() => clearInterval(timer))
  })

  const hasUrl = () => !!preview().url
  const isWindow = () => mode() === "window" && !!attached()

  const cycleDevice = () => {
    const modes: DeviceMode[] = ["desktop", "tablet", "mobile"]
    const idx = modes.indexOf(device())
    setDevice(modes[(idx + 1) % modes.length])
  }

  const openExternal = () => {
    const url = preview().url
    if (!url) return
    if (window.api?.openPreviewTarget) void window.api.openPreviewTarget(url)
    else if (window.api?.openLink) window.api.openLink(url)
    else window.open(url, "_blank")
  }

  return (
    <div class="h-full flex flex-col overflow-hidden p-3 gap-3">
      <div class="flex-1 min-h-0 flex flex-col overflow-hidden rounded-xl border-2 border-border-default-base bg-surface-raised shadow-[0_4px_24px_rgba(0,0,0,0.25)] ring-1 ring-black/5">
        <div class="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border-weaker-base">
          <div class="flex items-center gap-2 min-w-0">
            <Show when={isWindow()}>
              <div class="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span class="text-12-regular text-text truncate max-w-[220px]">{attached()!.name}</span>
            </Show>
            <Show when={!isWindow() && hasUrl()}>
              <div class="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span class="text-12-regular text-text truncate max-w-[180px]">
                {preview().siteName || "Live Preview"}
              </span>
            </Show>
            <Show when={!isWindow() && !hasUrl()}>
              <span class="text-12-regular text-text-weak">No preview</span>
            </Show>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <Show when={!isWindow() && hasUrl()}>
              <TooltipV2 value={`Device: ${DEVICE_LABELS[device()]}`} placement="bottom">
                <IconButtonV2 icon={<IconV2 name="monitor" />} variant="ghost-muted" size="normal" onClick={cycleDevice} />
              </TooltipV2>
            </Show>
            <Show when={!isWindow()}>
              <TooltipV2 value="Attach a running app to this panel" placement="bottom">
                <IconButtonV2
                  icon={<IconV2 name="window-attach" />}
                  variant="ghost-muted"
                  size="normal"
                  state={picking() ? "pressed" : undefined}
                  onClick={() => {
                    setPicking((v) => !v)
                    if (!picking()) void loadSources()
                  }}
                />
              </TooltipV2>
            </Show>
            <Show when={!isWindow() && hasUrl()}>
              <TooltipV2 value="Open in browser" placement="bottom">
                <IconButtonV2
                  icon={<IconV2 name="outline-square-arrow" />}
                  variant="ghost-muted"
                  size="normal"
                  onClick={openExternal}
                />
              </TooltipV2>
            </Show>
            <Show when={isWindow()}>
              <TooltipV2
                value={control() ? "Control is on — clicks and keys go to the app" : "Take control — click and type into the app"}
                placement="bottom"
              >
                <IconButtonV2
                  icon={<IconV2 name="cursor" />}
                  variant="ghost-muted"
                  size="normal"
                  state={control() ? "pressed" : undefined}
                  onClick={() => setControl((v) => !v)}
                />
              </TooltipV2>
              <TooltipV2 value="Stop mirroring" placement="bottom">
                <IconButtonV2
                  icon={<IconV2 name="close" />}
                  variant="ghost-muted"
                  size="normal"
                  onClick={detach}
                />
              </TooltipV2>
            </Show>
          </div>
        </div>

        <Show when={picking() && !isWindow()}>
          <div class="shrink-0 max-h-56 overflow-y-auto border-b border-border-weaker-base bg-surface-base">
            <Show
              when={sources().length > 0}
              fallback={
                <div class="px-3 py-4 text-12-regular text-text-weak">
                  No capturable windows found. Open an application and try again.
                </div>
              }
            >
              <For each={sources()}>
                {(source) => (
                  <button
                    class="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-hover transition-colors text-left"
                    onClick={() => void attach(source)}
                  >
                    <Show when={source.thumbnail} fallback={<div class="w-6 h-6 rounded bg-surface-hover shrink-0" />}>
                      {(thumb) => <img src={thumb()} class="w-10 h-6 object-cover rounded shrink-0" alt="" />}
                    </Show>
                    <span class="text-12-regular text-text truncate">{source.name}</span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Show>

        <div class="flex-1 min-h-0 overflow-hidden flex items-start justify-center bg-black">
          <Show when={streamError()}>
            {(err) => (
              <div class="h-full w-full flex items-center justify-center px-6 text-center">
                <div class="text-12-regular text-text-weak">{err()}</div>
              </div>
            )}
          </Show>

          <Show when={!streamError() && isWindow()}>
            <div
              ref={frameRef}
              class="w-full h-full flex items-center justify-center relative outline-none"
              tabIndex={control() ? 0 : -1}
              onMouseDown={onFrameMouseDown}
              onMouseMove={onFrameMouseMove}
              onWheel={onFrameWheel}
              onKeyDown={onFrameKeyDown}
              onContextMenu={(event) => {
                if (control()) event.preventDefault()
              }}
              style={{ cursor: control() ? "crosshair" : "default" }}
            >
              <video
                ref={videoRef}
                class="w-full h-full object-contain pointer-events-none"
                autoplay
                muted
                playsinline
              />
            </div>
          </Show>

          <Show when={!streamError() && !isWindow() && hasUrl()}>
            <div
              class="h-full overflow-hidden transition-all duration-300"
              style={{
                width: DEVICE_WIDTHS[device()],
                "max-width": "100%",
                background: device() !== "desktop" ? "var(--v2-background-bg-base, #0a0a0a)" : "transparent",
              }}
            >
              <iframe
                src={preview().url!}
                class="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                title={`Preview: ${preview().siteName || "Site"}`}
              />
            </div>
          </Show>

          <Show when={!streamError() && !isWindow() && !hasUrl()}>
            <div class="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center">
              <div class="w-16 h-16 rounded-2xl bg-background-base flex items-center justify-center">
                <IconV2 name="globe" size="large" class="text-text-weak" />
              </div>
              <div class="flex flex-col gap-1">
                <div class="text-14-medium text-text">Nothing to preview</div>
                <div class="text-12-regular text-text-weak max-w-[260px]">
                  Build a site and it appears here automatically, or attach an app you already have open.
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>

      <Show when={hasUrl() || isWindow()}>
        <div class="shrink-0 flex items-center justify-between px-3 py-1.5 rounded-lg border border-border-weaker-base bg-surface-base">
          <div class="text-11-regular text-text-faint truncate max-w-[260px]">
            {isWindow() ? attached()!.name : preview().url}
          </div>
          <div class="text-11-regular text-text-faint shrink-0">
            {isWindow() ? (control() ? "Control on" : "Live window") : DEVICE_LABELS[device()]}
          </div>
        </div>
      </Show>

      <Show when={lastError()}>
        {(err) => (
          <div class="shrink-0 px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 text-11-regular text-red-400">
            {err()}
          </div>
        )}
      </Show>
    </div>
  )
}
