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

import { createSignal, onCleanup, onMount, Show, For } from "solid-js"
import { IconButtonV2 } from "@zyraxon-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@zyraxon-ai/ui/v2/icon"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"

type DeviceMode = "desktop" | "tablet" | "mobile"

type PreviewState = {
  url: string | null
  siteName: string | null
  siteId: string | null
  timestamp: string
}

type CaptureSource = {
  id: string
  name: string
  appIcon: string | null
  thumbnail: string | null
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

  let videoRef: HTMLVideoElement | undefined
  let stream: MediaStream | null = null

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

  const attach = async (source: CaptureSource) => {
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
  }

  onMount(() => {
    // Subscribe before reading the current state so an update published while the read is
    // in flight is still delivered. onCleanup has to run in this synchronous scope: after an
    // await there is no owner left to attach it to, and Solid's onCleanup silently drops it,
    // which leaks one IPC listener every time the panel is mounted.
    const unsubscribe = window.api?.onSitePreviewUpdate?.((state) => setPreview(state))
    if (unsubscribe) onCleanup(unsubscribe)

    void (async () => {
      if (window.api?.getPreviewState) {
        try {
          setPreview(await window.api.getPreviewState())
        } catch {}
      }
      await loadSources()
    })()
  })

  onCleanup(stopStream)

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
            <video
              ref={videoRef}
              class="w-full h-full object-contain"
              autoplay
              muted
              playsinline
            />
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
            {isWindow() ? "Live window" : DEVICE_LABELS[device()]}
          </div>
        </div>
      </Show>
    </div>
  )
}
