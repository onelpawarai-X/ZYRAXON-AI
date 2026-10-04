// Copyright (c) 2026 onelpawarai. All rights reserved.

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  on,
  onCleanup,
  onMount,
  Show,
  type Accessor,
  type JSX,
} from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { useNavigate } from "@solidjs/router"
import { useMutation } from "@tanstack/solid-query"
import { createVirtualizer, defaultRangeExtractor, elementScroll, type VirtualItem } from "@tanstack/solid-virtual"
import { Accordion } from "@zyraxon-ai/ui/accordion"
import { Button } from "@zyraxon-ai/ui/button"
import { Card } from "@zyraxon-ai/ui/card"
import {
  ContextToolGroup,
  Message,
  MessageDivider,
  Part as MessagePart,
  partDefaultOpen,
  type UserActions,
} from "@zyraxon-ai/session-ui/message-part"
import { DiffChanges } from "@zyraxon-ai/ui/diff-changes"
import { FileIcon } from "@zyraxon-ai/ui/file-icon"
import { Icon } from "@zyraxon-ai/ui/icon"
import { IconButton } from "@zyraxon-ai/ui/icon-button"
import { Icon as IconV2 } from "@zyraxon-ai/ui/v2/icon"
import { IconButtonV2 } from "@zyraxon-ai/ui/v2/icon-button-v2"
import { DropdownMenu } from "@zyraxon-ai/ui/dropdown-menu"
import { MenuV2 } from "@zyraxon-ai/ui/v2/menu-v2"
import { Dialog } from "@zyraxon-ai/ui/dialog"
import { DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@zyraxon-ai/ui/v2/dialog-v2"
import { InlineInput } from "@zyraxon-ai/ui/inline-input"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { SessionRetry } from "@zyraxon-ai/session-ui/session-retry"
import { isScrollKeyTarget, scrollKey, scrollKeyOwner, ScrollView } from "@zyraxon-ai/ui/scroll-view"
import { StickyAccordionHeader } from "@zyraxon-ai/ui/sticky-accordion-header"
import { TextField } from "@zyraxon-ai/ui/text-field"
import { TextReveal } from "@zyraxon-ai/ui/text-reveal"
import { TextShimmer } from "@zyraxon-ai/ui/text-shimmer"
import type {
  AssistantMessage,
  Message as MessageType,
  Part as PartType,
  ToolPart,
  UserMessage,
} from "@zyraxon-ai/sdk/v2"
import { showToast } from "@/utils/toast"
import { getDirectory, getFilename } from "@zyraxon-ai/core/util/path"
import { Popover as KobaltePopover } from "@kobalte/core/popover"
import { normalize } from "@zyraxon-ai/session-ui/session-diff"
import { useFileComponent } from "@zyraxon-ai/ui/context/file"
import { shouldMarkBoundaryGesture, normalizeWheelDelta } from "@/pages/session/message-gesture"
import { SessionContextUsage } from "@/components/session-context-usage"
import { useDialog } from "@zyraxon-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { useSessionKey } from "@/pages/session/session-layout"
import { useServerSDK } from "@/context/server-sdk"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { useTabs } from "@/context/tabs"
import { legacySessionHref, requireServerKey, sessionHref } from "@/utils/session-route"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import { sessionTitle } from "@/utils/session-title"
import { scheduleConnectedMeasure } from "./measure"
import { observeElementOffsetReconnectAware } from "./observe-element-offset"
import { createTimelineProjection } from "./projection"
import { MessageComment, SummaryDiff, TimelineRow, TimelineRowMap } from "./rows"
import { filterVirtualIndexes } from "./virtual-items"

const emptyMessages: MessageType[] = []
const emptyParts: PartType[] = []
const emptyTools: ToolPart[] = []
const emptyAssistantMessages: AssistantMessage[] = []
const idle = { type: "idle" as const }

type FramedTimelineRow = Exclude<TimelineRow.TimelineRow, { _tag: "TurnGap" }>
type TimelineRowByTag<T extends TimelineRow.TimelineRow["_tag"]> = Extract<TimelineRow.TimelineRow, { _tag: T }>

const timelineFallbackItemSize = 60
const timelineCache = new Map<string, { measurements: VirtualItem[]; toolOpen: Record<string, boolean | undefined> }>()

const taskDescription = (part: PartType, sessionID: string) => {
  if (part.type !== "tool" || part.tool !== "task") return
  const metadata = "metadata" in part.state ? part.state.metadata : undefined
  if (metadata?.sessionId !== sessionID) return
  const value = part.state.input?.description
  if (typeof value === "string" && value) return value
}

const boundaryTarget = (root: HTMLElement, target: EventTarget | null) => {
  const current = target instanceof Element ? target : undefined
  const nested = current?.closest("[data-scrollable]")
  if (!nested || nested === root) return root
  if (!(nested instanceof HTMLElement)) return root
  return nested
}

const markBoundaryGesture = (input: {
  root: HTMLDivElement
  target: EventTarget | null
  delta: number
  onMarkScrollGesture: (target?: EventTarget | null) => void
}) => {
  const target = boundaryTarget(input.root, input.target)
  if (target === input.root) {
    input.onMarkScrollGesture(input.root)
    return
  }
  if (
    shouldMarkBoundaryGesture({
      delta: input.delta,
      scrollTop: target.scrollTop,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
    })
  ) {
    input.onMarkScrollGesture(input.root)
  }
}

function TimelineThinkingRow(props: { reasoningHeading?: string; showReasoningSummaries: boolean }) {
  const language = useLanguage()

  return (
    <div data-slot="session-turn-thinking" class="thinking-container">
      <span class="thinking-pulse-ring" />
      <TextShimmer text={language.t("ui.sessionTurn.status.thinking")} />
      <Show when={!props.showReasoningSummaries}>
        <TextReveal text={props.reasoningHeading} class="session-turn-thinking-heading" travel={25} duration={700} />
      </Show>
    </div>
  )
}

function TimelineDiffSummaryRow(props: { diffs: SummaryDiff[] }) {
  const language = useLanguage()
  const maxFiles = 10
  const [state, setState] = createStore({
    showAll: false,
    expanded: [] as string[],
  })
  const showAll = () => state.showAll
  const expanded = () => state.expanded
  const overflow = createMemo(() => Math.max(0, props.diffs.length - maxFiles))
  const visible = createMemo(() => (showAll() ? props.diffs : props.diffs.slice(0, maxFiles)))

  return (
    <div
      data-slot="session-turn-diffs"
      data-component="session-turn-diffs-group"
      data-show-all={showAll() || undefined}
    >
      <div data-slot="session-turn-diffs-header">
        <span data-slot="session-turn-diffs-label">
          {language.t(
            props.diffs.length === 1 ? "ui.sessionTurn.diffs.changed.one" : "ui.sessionTurn.diffs.changed.other",
            { count: String(props.diffs.length) },
          )}
        </span>
        <DiffChanges changes={props.diffs} />
        <Show when={overflow() > 0}>
          <span data-slot="session-turn-diffs-toggle" onClick={() => setState("showAll", !showAll())}>
            {showAll() ? language.t("ui.sessionTurn.diffs.showLess") : language.t("ui.sessionTurn.diffs.showAll")}
          </span>
        </Show>
      </div>
      <div data-component="session-turn-diffs-content">
        <Accordion
          multiple
          style={{ "--sticky-accordion-offset": "44px" }}
          value={expanded()}
          onChange={(value) => setState("expanded", Array.isArray(value) ? value : value ? [value] : [])}
        >
          <For each={visible()}>
            {(diff) => {
              const opened = createMemo(() => expanded().includes(diff.file))

              return (
                <Accordion.Item value={diff.file}>
                  <StickyAccordionHeader>
                    <Accordion.Trigger>
                      <div data-slot="session-turn-diff-trigger">
                        <span data-slot="session-turn-diff-path">
                          <Show when={diff.file.includes("/")}>
                            <span data-slot="session-turn-diff-directory">{`\u202A${getDirectory(diff.file)}\u202C`}</span>
                          </Show>
                          <span data-slot="session-turn-diff-filename">{getFilename(diff.file)}</span>
                        </span>
                        <div data-slot="session-turn-diff-meta">
                          <span data-slot="session-turn-diff-changes">
                            <DiffChanges changes={diff} />
                          </span>
                          <span data-slot="session-turn-diff-chevron">
                            <Icon name="chevron-down" size="small" />
                          </span>
                        </div>
                      </div>
                    </Accordion.Trigger>
                  </StickyAccordionHeader>
                  <Accordion.Content>
                    <Show when={opened()}>
                      <TimelineDiffView diff={diff} />
                    </Show>
                  </Accordion.Content>
                </Accordion.Item>
              )
            }}
          </For>
        </Accordion>
        <Show when={!showAll() && overflow() > 0}>
          <div data-slot="session-turn-diffs-more" onClick={() => setState("showAll", true)}>
            {language.t("ui.sessionTurn.diffs.more", { count: String(overflow()) })}
          </div>
        </Show>
      </div>
    </div>
  )
}

function TimelineDiffView(props: { diff: SummaryDiff }) {
  const fileComponent = useFileComponent()
  const view = normalize(props.diff)

  return (
    <div data-slot="session-turn-diff-view" data-scrollable>
      <Dynamic component={fileComponent} mode="diff" virtualize={false} fileDiff={view.fileDiff} />
    </div>
  )
}

export function MessageTimeline(props: {
  actions?: UserActions
  scroll: { overflow: boolean; bottom: boolean; jump: boolean }
  onResumeScroll: () => void
  setScrollRef: (el: HTMLDivElement | undefined) => void
  onScheduleScrollState: (el: HTMLDivElement) => void
  onAutoScrollHandleScroll: () => void
  onMarkScrollGesture: (target?: EventTarget | null) => void
  hasScrollGesture: () => boolean
  onUserScroll: () => void
  onHistoryScroll: () => void
  onAutoScrollInteraction: (event: MouseEvent) => void
  shouldAnchorBottom: () => boolean
  centered: boolean
  setContentRef: (el: HTMLDivElement) => void
  userMessages: UserMessage[]
  anchor: (id: string) => string
  setRevealMessage?: (fn: (id: string) => void) => void
  setScrollToEnd?: (fn: () => void) => void
  setHistoryAnchor?: (handlers: { capture: () => void; restore: (done: boolean) => void }) => void
}) {
  let touchGesture: number | undefined

  const navigate = useNavigate()
  const serverSDK = useServerSDK()
  const sdk = useSDK()
  const sync = useSync()
  const settings = useSettings()
  const tabs = useTabs()
  const dialog = useDialog()
  const language = useLanguage()
  const { params, sessionKey } = useSessionKey()
  const ownerSessionKey = sessionKey()
  const cached = timelineCache.get(ownerSessionKey)
  const initialMeasurements = cached?.measurements
  const coldBottomMount = !initialMeasurements?.length && props.shouldAnchorBottom()
  const platform = usePlatform()

  const [listRoot, setListRoot] = createSignal<HTMLDivElement>()
  const sessionID = createMemo(() => params.id)
  const sessionStatus = createMemo(() => {
    const id = sessionID()
    if (!id) return idle
    return sync().data.session_status[id] ?? idle
  })
  const sessionMessages = createMemo(() => (sessionID() ? (sync().data.message[sessionID()!] ?? []) : []))
  const info = createMemo(() => {
    const id = sessionID()
    if (!id) return
    return sync().session.get(id)
  })
  const titleValue = createMemo(() => info()?.title)
  const titleLabel = createMemo(() => sessionTitle(titleValue()))
  const shareUrl = createMemo(() => info()?.share?.url)
  const shareEnabled = createMemo(() => sync().data.config.share !== "disabled")
  const parentID = createMemo(() => info()?.parentID)
  const parent = createMemo(() => {
    const id = parentID()
    if (!id) return
    return sync().session.get(id)
  })
  const parentMessages = createMemo(() => {
    const id = parentID()
    if (!id) return emptyMessages
    return sync().data.message[id] ?? emptyMessages
  })
  const parentTitle = createMemo(() => sessionTitle(parent()?.title) ?? language.t("command.session.new"))
  const getMsgParts = (msgId: string) => sync().data.part[msgId] ?? emptyParts
  const getMsgPart = (messageID: string, partID: string) => getMsgParts(messageID).find((part) => part.id === partID)
  const childTaskDescription = createMemo(() => {
    const id = sessionID()
    if (!id) return
    return parentMessages()
      .flatMap((message) => getMsgParts(message.id))
      .map((part) => taskDescription(part, id))
      .findLast((value): value is string => !!value)
  })
  const childTitle = createMemo(() => {
    if (!parentID()) return titleLabel() ?? ""
    if (childTaskDescription()) return childTaskDescription()
    const value = titleLabel()?.replace(/\s+\(@[^)]+ subagent\)$/, "")
    if (value) return value
    return language.t("command.session.new")
  })
  const showHeader = createMemo(() => !!(titleValue() || parentID()))
  const projection = createTimelineProjection({
    messages: sessionMessages,
    userMessages: () => props.userMessages,
    parts: getMsgParts,
    status: sessionStatus,
    showReasoningSummaries: settings.general.showReasoningSummaries,
    inlineComments: settings.general.newLayoutDesigns,
  })
  const activeMessageID = projection.activeMessageID
  const assistantMessagesByParent = projection.assistantMessagesByParent
  const lastAssistantGroupKey = projection.lastAssistantGroupKey
  const messageByID = projection.messageByID
  const messageLastRowIndex = projection.messageLastRowIndex
  const messageRowIndex = projection.messageRowIndex
  const timelineRowByKey = projection.rowByKey
  const timelineRows = projection.rows

  const spokenStorageKey = () => `tts-spoken-${sessionKey()}`
  const ttsSpokenContentHashes = new Set<string>(loadPersistedContentHashes())
  const ttsSpokenIds = new Set<string>(loadPersistedSpokenIds())
  const ttsSentText = new Map<string, string>()
  const TTS_SERVER = "http://127.0.0.1:19810"

  // TTS SERIAL queue — ONE audio at a time, never parallel
  const ttsAudioQueue: ArrayBuffer[] = []
  let ttsFetching = false
  let ttsAbortController: AbortController | null = null
  // Text waiting to be sent to TTS — FIFO queue, never dropped
  const ttsPendingText: string[] = []
  // Safety: reset ttsFetching if stuck for more than 60 seconds
  let ttsLastFetchTime = 0

  // Echo guard — mirrors main-process TTS state so the renderer never paints
  // its own voice into the chat box or re-speaks itself while playing
  function setRenderTTSActive(active: boolean) {
    ;(window as any).__zyraxonTTSActiveRender = active
    const api = (window as any).api
    if (api?.setVoiceTTSActive) api.setVoiceTTSActive(active)
  }

  function stopAllTTS() {
    ttsGeneration++
    setRenderTTSActive(false)
    if (ttsAbortController) {
      ttsAbortController.abort()
      ttsAbortController = null
    }
    // Tear the live stream down explicitly: aborting the fetch only unwinds the
    // reader, it does not silence an <audio> element that is already playing.
    ttsStreamPlayer?.dispose()
    ttsStreamPlayer = null
    ttsDeferredBuffers.length = 0
    if (ttsActiveSource) {
      try { ttsActiveSource.onended = null; ttsActiveSource.stop() } catch {}
      ttsActiveSource = null
    }
    ttsNextStartAt = 0
    ttsAudioQueue.length = 0
    ttsFetching = false
    ttsPendingText.length = 0
  }

  // Gapless WebAudio scheduler — every chunk is scheduled at the exact end of the
  // previous one, so speech is continuous and two voices can never overlap.
  let ttsAudioContext: AudioContext | null = null
  let ttsScheduling = false
  let ttsGeneration = 0
  let ttsNextStartAt = 0
  let ttsActiveSource: AudioBufferSourceNode | null = null

  function getTTSContext(): AudioContext {
    if (!ttsAudioContext) ttsAudioContext = new AudioContext()
    return ttsAudioContext
  }

  // Constructing an AudioContext and getting it out of the suspended state both cost
  // real time, and a suspended context reports a frozen currentTime, so scheduling
  // against it before it runs pushes chunk boundaries into the past and drops audio.
  // Warm it at mount so the first utterance schedules against a running clock.
  async function warmTTSContext() {
    const ctx = getTTSContext()
    try {
      if (ctx.state !== "running") await ctx.resume()
    } catch {}
  }

  function finishTTSPlayback(generation: number) {
    if (ttsGeneration !== generation) return
    ttsActiveSource = null
    setRenderTTSActive(false)
  }

  async function scheduleFromQueue() {
    if (ttsScheduling) return
    ttsScheduling = true
    const generation = ttsGeneration
    try {
      while (ttsAudioQueue.length > 0) {
        const buffer = ttsAudioQueue.shift()!
        const ctx = getTTSContext()
        // Never schedule against a suspended clock — resume first, then re-check so a
        // stop() that landed during the await still wins.
        if (ctx.state !== "running") {
          try { await ctx.resume() } catch {}
          if (ttsGeneration !== generation) return
        }
        let audio: AudioBuffer
        try {
          audio = await ctx.decodeAudioData(buffer.slice(0))
        } catch {
          continue
        }
        if (ttsGeneration !== generation) return
        // Small epsilon only — the gapless queue already guarantees the next chunk
        // starts exactly where this one ends, so no real pre-roll is needed.
        const startAt = Math.max(ctx.currentTime + 0.005, ttsNextStartAt)
        ttsNextStartAt = startAt + audio.duration
        const source = ctx.createBufferSource()
        source.buffer = audio
        source.connect(ctx.destination)
        source.start(startAt)
        ttsActiveSource = source
        source.onended = () => {
          if (ttsGeneration !== generation) return
          if (ttsAudioQueue.length > 0 || ttsScheduling) {
            if (ttsAudioQueue.length > 0 && !ttsScheduling) void scheduleFromQueue()
            return
          }
          finishTTSPlayback(generation)
        }
      }
    } finally {
      if (ttsGeneration === generation) ttsScheduling = false
    }
    if (ttsGeneration !== generation) return
    if (ttsAudioQueue.length > 0) {
      void scheduleFromQueue()
      return
    }
    // Queue drained — playback continues until the last scheduled chunk ends
    if (!ttsActiveSource) finishTTSPlayback(generation)
  }

  function playTTSBuffer(buffer: ArrayBuffer) {
    // A streamed utterance owns the audio graph until it ends. Anything handed
    // over in the meantime waits rather than talking over it.
    if (ttsStreamPlayer) {
      ttsDeferredBuffers.push(buffer)
      return
    }
    ttsAudioQueue.push(buffer)
    setRenderTTSActive(true)
    void scheduleFromQueue()
  }

  // Expose stopAllTTS globally
  ;(window as any).__stopTTS = stopAllTTS

  // ---------------------------------------------------------------------------
  // Streaming TTS playback
  //
  // /speak is a chunked audio/mpeg response: Edge pushes MP3 frames as it makes
  // them, the main-process shim pipes them straight through, and this layer
  // appends each frame to a MediaSource SourceBuffer the moment it arrives.
  // Playback therefore begins when the FIRST frame lands instead of after the
  // whole reply has been synthesised.
  //
  // MediaSource is the only browser primitive that can play a *growing* MP3 —
  // decodeAudioData needs a whole file — so it is gated on
  // MediaSource.isTypeSupported. Where it is unavailable the body is buffered and
  // handed to the gapless queue above, which stays correct but has to wait for
  // the last byte.
  // ---------------------------------------------------------------------------
  const TTS_MIME = "audio/mpeg"
  let ttsStreamPlayer: { dispose: () => void } | null = null
  const ttsDeferredBuffers: ArrayBuffer[] = []

  function ttsCanStream() {
    return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(TTS_MIME)
  }

  // Already-played audio is evicted from the SourceBuffer past this size. Only a
  // pathologically long single utterance reaches it, but it is what stops a runaway
  // response from growing the buffer without bound.
  const TTS_EVICT_ABOVE_BYTES = 8 * 1024 * 1024

  // The stream must not start on top of a queue buffer that is already playing, or
  // the two would overlap. Polling is fine here: the only caller is serialised
  // behind ttsFetching, so nothing piles up waiting.
  async function waitForTTSQueueIdle(generation: number) {
    while (ttsGeneration === generation && (ttsAudioQueue.length > 0 || ttsActiveSource)) {
      await new Promise((r) => setTimeout(r, 30))
    }
  }

  // Plays a /speak response body as it arrives. Returns false only when the stream
  // failed before a single frame was played, so the caller may safely fall back to
  // buffering; once any audio has been played the stream owns the utterance.
  async function playTTSStream(
    resp: Response,
    controller: AbortController,
    generation: number
  ): Promise<boolean> {
    const body = resp.body
    if (!body) return false
    let played = false
    let consumed = false

    const reader = body.getReader()
    const ctx = getTTSContext()
    if (ctx.state !== "running") {
      try { await ctx.resume() } catch {}
      if (ttsGeneration !== generation) {
        void reader.cancel()
        return true
      }
    }

    const mediaSource = new MediaSource()
    const objectUrl = URL.createObjectURL(mediaSource)
    const audio = new Audio()
    audio.src = objectUrl
    audio.autoplay = true
    // Routed through the same AudioContext as everything else so the graph, the
    // resume path and the teardown all stay in one place. If the context is
    // already closed the element still plays straight to the output on its own,
    // which beats dropping the utterance.
    let sourceNode: MediaElementAudioSourceNode | null = null
    try {
      sourceNode = ctx.createMediaElementSource(audio)
      sourceNode.connect(ctx.destination)
    } catch {
      sourceNode = null
    }

    let disposed = false
    const dispose = () => {
      if (disposed) return
      disposed = true
      try { void reader.cancel() } catch {}
      try { audio.pause() } catch {}
      try { audio.removeAttribute("src") } catch {}
      try { audio.load() } catch {}
      try { sourceNode?.disconnect() } catch {}
      URL.revokeObjectURL(objectUrl)
      if (ttsStreamPlayer?.dispose === dispose) ttsStreamPlayer = null
      if (ttsGeneration !== generation) return
      setRenderTTSActive(false)
      // Buffers that arrived over IPC while this stream was speaking now have the
      // audio graph to themselves.
      const deferred = ttsDeferredBuffers.splice(0)
      for (const buf of deferred) playTTSBuffer(buf)
    }

    ttsStreamPlayer = { dispose }
    setRenderTTSActive(true)
    const onNaturalEnd = () => dispose()
    audio.addEventListener("ended", onNaturalEnd)
    audio.addEventListener("error", onNaturalEnd)

    try {
      await new Promise<void>((resolve, reject) => {
        mediaSource.addEventListener("sourceopen", () => resolve(), { once: true })
        mediaSource.addEventListener(
          "error",
          () => reject(new Error("MediaSource failed to open")),
          { once: true }
        )
      })
      if (ttsGeneration !== generation || controller.signal.aborted) {
        dispose()
        return true
      }

      const sourceBuffer = mediaSource.addSourceBuffer(TTS_MIME)
      // MP3 has no clusters, so every appended byte is played exactly once and in
      // order — this is what keeps a streamed reply free of repeats and overlaps.
      sourceBuffer.mode = "sequence"

      const pending: Uint8Array<ArrayBuffer>[] = []
      const appendWaiters: Array<() => void> = []
      let appendError: unknown = null
      let appendedBytes = 0
      let evicted = false
      const settleAppends = () => {
        const waiters = appendWaiters.splice(0)
        for (const w of waiters) w()
      }
      // Resolves when the append that is currently in flight completes. Only ever
      // awaited while an append really is in flight.
      const nextAppendDone = () => new Promise<void>((r) => appendWaiters.push(r))
      // Defensive bound on the SourceBuffer. Upstream every utterance is capped at
      // 60–300 characters, so this only fires for a pathological single response;
      // it runs at most once per stream so the removal can never move the time
      // origin underneath the playhead and cause a repeat or a gap.
      const evictPlayed = () => {
        if (evicted || appendedBytes <= TTS_EVICT_ABOVE_BYTES || sourceBuffer.updating) return
        const playhead = audio.currentTime
        if (!Number.isFinite(playhead) || playhead <= 0) return
        const buffered = sourceBuffer.buffered
        if (!buffered.length) return
        // Leave a second of audio behind the playhead so eviction can never catch
        // up with playback.
        const upto = Math.min(playhead - 1, buffered.end(buffered.length - 1) - 1)
        if (upto <= buffered.start(0)) return
        try {
          sourceBuffer.remove(buffered.start(0), upto)
          evicted = true
        } catch {}
      }
      sourceBuffer.addEventListener("updateend", () => {
        settleAppends()
        while (!sourceBuffer.updating && pending.length > 0 && !appendError) {
          try {
            sourceBuffer.appendBuffer(pending.shift()!)
          } catch (e) {
            appendError = e
            break
          }
        }
        evictPlayed()
      })
      sourceBuffer.addEventListener("error", () => {
        appendError = new Error("SourceBuffer append failed")
        settleAppends()
      })

      for (;;) {
        const { done, value } = await reader.read()
        consumed = true
        if (done) break
        if (controller.signal.aborted || ttsGeneration !== generation) break
        if (!value || value.byteLength === 0 || appendError) continue
        appendedBytes += value.byteLength
        // The DOM lib types a reader chunk as Uint8Array<ArrayBufferLike> while
        // appendBuffer only accepts a non-shared ArrayBuffer. Fetch never hands
        // back a SharedArrayBuffer, so this is the one place that difference has to
        // be papered over.
        const chunk = value as Uint8Array<ArrayBuffer>
        if (sourceBuffer.updating || pending.length > 0) pending.push(chunk)
        else {
          try {
            sourceBuffer.appendBuffer(chunk)
          } catch (e) {
            appendError = e
            break
          }
        }
        // Start on the first frame that actually made it into the buffer. From
        // here on playback is continuous, so nothing waits for the synthesis that
        // is still in flight.
        if (!played) {
          await nextAppendDone()
          if (appendError) break
          played = true
          void audio.play().catch(() => {})
        }
      }

      if (played && !appendError && !controller.signal.aborted && ttsGeneration === generation) {
        while (sourceBuffer.updating || pending.length > 0) {
          await nextAppendDone()
          if (appendError) break
        }
        if (!appendError) {
          try { mediaSource.endOfStream() } catch {}
          void audio.play().catch(() => {})
          return true
        }
      }
      dispose()
      // Once a single byte has been pulled off the body the caller must NOT retry
      // with arrayBuffer(): that would replay the frames already spoken. Falling
      // back is only safe while the body is untouched.
      return consumed || played
    } catch (e) {
      console.warn("[TTS] Stream playback failed:", e)
      dispose()
      return consumed || played
    }
  }

  // Play TTS audio delivered over IPC (e.g. the Settings "Test Voice" button)
  // through the same serial queue so it can NEVER overlap the response TTS
  const removeVoiceTTSAudio = (window as any).api?.onVoiceTTSAudio?.((buffer: ArrayBuffer) => {
    playTTSBuffer(buffer)
  }) as (() => void) | undefined

  function loadPersistedSpokenIds(): string[] {
    try {
      const raw = localStorage.getItem(spokenStorageKey())
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  function loadPersistedContentHashes(): string[] {
    try {
      const raw = localStorage.getItem(`${spokenStorageKey()}:hashes`)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  function persistSpokenIds() {
    try {
      localStorage.setItem(spokenStorageKey(), JSON.stringify([...ttsSpokenIds]))
      localStorage.setItem(`${spokenStorageKey()}:hashes`, JSON.stringify([...ttsSpokenContentHashes]))
    } catch {}
  }

  // Simple content hash for TTS dedup — prevents double-speaking across message retries
  function contentHash(text: string): string {
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
    }
    return hash.toString(36)
  }

  const nonLatinRe = /[\u0980-\u09FF\u0900-\u097F\u0600-\u06FF\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F]/

  function stripThinkingBlocks(text: string): string {
    text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    text = text.replace(/<\/?thinking[^>]*>/gi, "")
    text = text.replace(/```[\s\S]*?```/g, "")
    text = text.replace(/<tool_use>[\s\S]*?<\/tool_use>/gi, "")
    text = text.replace(/<tool_result>[\s\S]*?<\/tool_result>/gi, "")
    text = text.replace(/<\/?antml:thinking[^>]*>/gi, "")
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "")
    text = text.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    text = text.replace(/\[INST\][\s\S]*?\[\/INST\]/gi, "")
    text = text.replace(/<<SYS>>[\s\S]*?<\/<SYS>>/gi, "")
    return text
  }

  function stripEnglishReasoning(text: string): string {
    const lines = text.split("\n")
    const hasNonLatin = lines.some((l) => nonLatinRe.test(l))
    if (!hasNonLatin) return text
    return lines
      .filter((line) => {
        const t = line.trim()
        if (!t) return true
        return nonLatinRe.test(t)
      })
      .join("\n")
      .trim()
  }

  function extractCleanText(msgId: string): string {
    const syncData = sync().data
    const parts = syncData.part[msgId] ?? []
    let text = ""
    for (const part of parts) {
      if (part.type === "text" && "text" in part) text += (part as any).text
    }
    text = stripThinkingBlocks(text)
    text = stripEnglishReasoning(text)
    text = text.replace(/\n{3,}/g, "\n\n").trim()
    return text
  }

  // TTS text: strip thinking blocks only, keep ALL languages (Bengali + English)
  function extractTTSText(msgId: string): string {
    const syncData = sync().data
    const parts = syncData.part[msgId] ?? []
    let text = ""
    for (const part of parts) {
      if (part.type === "text" && "text" in part) text += (part as any).text
    }
    text = stripThinkingBlocks(text)
    // Strip reasoning/review blocks that aren't meant to be spoken
    text = text.replace(/\[REVIEW\][\s\S]*?\[\/REVIEW\]/gi, "")
    text = text.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, "")
    text = text.replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/gi, "")
    text = text.replace(/\[INTERNAL\][\s\S]*?\[\/INTERNAL\]/gi, "")
    // Strip markdown code fences
    text = text.replace(/```[\s\S]*?```/g, "")
    text = text.replace(/`[^`\n]+`/g, "")
    // Strip tool use/result tags (already in stripThinkingBlocks but double-safe)
    text = text.replace(/<tool_use>[\s\S]*?<\/tool_use>/gi, "")
    text = text.replace(/<tool_result>[\s\S]*?<\/tool_result>/gi, "")
    text = text.replace(/\{[^{}]*"tool"[\s\S]*?\}/g, "")
    text = text.replace(/\n{3,}/g, "\n\n").trim()
    return text
  }

  // TTS health check — non-blocking, auto-restart
  let ttsServerHealthy = true
  let ttsLastHealthCheck = 0
  async function checkTTSServer(): Promise<boolean> {
    const now = Date.now()
    if (now - ttsLastHealthCheck < 10000) return ttsServerHealthy
    ttsLastHealthCheck = now
    try {
      const resp = await fetch(`${TTS_SERVER}/health`, { signal: AbortSignal.timeout(2000) })
      ttsServerHealthy = resp.ok
    } catch {
      ttsServerHealthy = false
      try {
        const electron = (window as any).electron
        if (electron?.ipcRenderer) {
          await electron.ipcRenderer.invoke("tts-restart")
          ttsServerHealthy = true
        }
      } catch {}
    }
    return ttsServerHealthy
  }

  // Send TTS to server — queue-based, NEVER drops text
  async function sendTTSText(text: string) {
    if (!text || text.trim().length === 0) return
    ttsPendingText.push(text)
    if (ttsFetching) return
    flushTTSPending()
  }

  async function flushTTSPending() {
    // Safety: if ttsFetching stuck for >60s, force reset
    if (ttsFetching && Date.now() - ttsLastFetchTime > 60000) {
      console.warn("[TTS] Safety: ttsFetching stuck, force resetting")
      ttsFetching = false
    }
    if (ttsPendingText.length === 0) { ttsFetching = false; return }
    ttsFetching = true
    ttsLastFetchTime = Date.now()

    while (ttsPendingText.length > 0) {
      const chunk = ttsPendingText.shift()!
      if (!chunk || chunk.trim().length === 0) continue

      // Deliberately NOT waiting for the previous chunk to finish playing.
      // Synthesis is a cloud round trip, so waiting here meant every chunk cost a
      // dead gap plus a full fetch that only began once the previous audio had
      // finished. Fetching ahead into the gapless audio queue keeps the speech
      // buffer primed and removes the silence between chunks entirely.

      const gender = settings.general.voiceGender?.() === "male" ? "m" : "f"
      const voiceLang = settings.general.voiceLanguage?.() || "en-US"
      const lang = voiceLang.split("-")[0] || "en"
      const url = `${TTS_SERVER}/speak?text=${encodeURIComponent(chunk)}&gender=${gender}&lang=${lang}`

      const controller = new AbortController()
      ttsAbortController = controller
      // The deadline only guards getting a response head. A long reply streams for
      // longer than that, so it is dropped the moment the headers are in and the
      // body is left to finish on its own rather than being cut off mid-sentence.
      const deadline = setTimeout(() => controller.abort(), 30000)

      try {
        const resp = await fetch(url, { signal: controller.signal })
        clearTimeout(deadline)
        if (!resp.ok || controller.signal.aborted) continue
        ttsLastFetchTime = Date.now()

        // Play as the frames arrive, so the first word is audible while Edge is
        // still synthesising the rest of it.
        if (ttsCanStream() && resp.body) {
          const generation = ttsGeneration
          await waitForTTSQueueIdle(generation)
          if (ttsGeneration !== generation || controller.signal.aborted) continue
          if (await playTTSStream(resp, controller, generation)) continue
        }

        const buf = await resp.arrayBuffer()
        if (buf && buf.byteLength > 100 && !controller.signal.aborted) {
          playTTSBuffer(buf)
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") ttsServerHealthy = false
      } finally {
        clearTimeout(deadline)
        ttsLastFetchTime = Date.now()
      }
    }
    ttsFetching = false
    ttsLastFetchTime = Date.now()
  }

  const mountedMessageIDs = new Set<string>()
  let mountedSnapshotDone = false
  let ttsProcessingGuard = false
  // Track last TTS chunk per message to prevent duplicate sends across retries
  const ttsLastChunkHash = new Map<string, string>()
  // Real-time pacing: while the AI is still writing, flush short chunks as soon as
  // there is a whole word to speak, so audio starts on the first opportunity rather
  // than after a fixed cadence. The gapless audio queue absorbs bursts, and
  // ttsSentText advancing past what was already spoken is what prevents re-sends.
  const TTS_FLUSH_MIN_CHARS = 3
  const TTS_FLUSH_MAX_CHARS = 60

  function processTTSForMessages() {
    if (ttsProcessingGuard) return
    ttsProcessingGuard = true
    try { processTTSForMessagesInner() } finally { ttsProcessingGuard = false }
  }

  function processTTSForMessagesInner() {
    const enabled = settings.general.voiceAutoSpeak()
    if (!enabled) return

    const byParent = assistantMessagesByParent()
    if (!byParent) return

    if (!mountedSnapshotDone) {
      mountedSnapshotDone = true
      for (const [, messages] of byParent) {
        for (const msg of messages) {
          if (msg.role === "assistant") mountedMessageIDs.add(msg.id)
        }
      }
      for (const id of ttsSpokenIds) { mountedMessageIDs.add(id) }
    }

    for (const [, messages] of byParent) {
      for (const msg of messages) {
        if (msg.role !== "assistant") continue
        if (mountedMessageIDs.has(msg.id)) continue
        if (ttsSpokenIds.has(msg.id)) continue

        const isActive = typeof msg.time?.completed !== "number"
        const fullText = extractTTSText(msg.id)
        if (!fullText) continue

        // Content hash dedup: skip if same text was already spoken (prevents double-speaking across retries)
        const textHash = contentHash(fullText)
        if (ttsSpokenContentHashes.has(textHash)) continue

        // Chunk-level dedup: skip if the last chunk sent for this message matches
        const lastChunk = ttsLastChunkHash.get(msg.id) || ""
        if (lastChunk && lastChunk === textHash) continue

        const alreadySent = ttsSentText.get(msg.id) || ""

        if (isActive) {
          // ACTIVE message: speak while the AI is still writing — flush whole words
          // as soon as one is available, never waiting for a sentence end.
          // ttsSentText already records everything spoken, so when nothing new has
          // arrived this is empty and nothing is re-sent. No per-message lockout is
          // needed, and adding one here is what used to space out a reply into
          // widely separated bursts.
          const unsentText = fullText.slice(alreadySent.length)
          if (unsentText.length < 1) continue

          const endsAtWordBoundary = /\s/.test(unsentText[unsentText.length - 1] ?? "")
          if (unsentText.length < TTS_FLUSH_MIN_CHARS || !endsAtWordBoundary) {
            // waiting for more words
          } else {
            let cut = unsentText.length
            if (unsentText.length > TTS_FLUSH_MAX_CHARS) {
              // never cut mid-word — back off to the last space inside the budget
              const space = unsentText.lastIndexOf(" ", TTS_FLUSH_MAX_CHARS)
              if (space > TTS_FLUSH_MIN_CHARS) cut = space
            }
            const chunk = unsentText.slice(0, cut).trim()
            if (chunk.length >= 3) {
              ttsSentText.set(msg.id, alreadySent + chunk)
              ttsLastChunkHash.set(msg.id, textHash)
              sendTTSText(chunk)
            }
          }
        } else {
          // COMPLETED message: send remaining in large sentence-level chunks
          ttsSpokenIds.add(msg.id)
          ttsSpokenContentHashes.add(textHash)
          persistSpokenIds()
          const unsentText = fullText.slice(alreadySent.length).trim()
          const textToSend = unsentText.length > 0 ? unsentText : ""
          if (textToSend.length > 0) {
            // Split into sentence-level chunks of ~300 chars
            const sents = textToSend.split(/(?<=[।!?\.\n])\s*/)
            let buf = ""
            for (const s of sents) {
              if (buf.length + s.length > 300 && buf.length > 0) {
                sendTTSText(buf.trim())
                buf = ""
              }
              buf += (buf ? " " : "") + s
            }
            if (buf.trim().length > 0) sendTTSText(buf.trim())
          }
        }
      }
    }
  }

  // EFFECT 1: Reactive — fires when messages or parts change
  createEffect(on(
    () => {
      const byParent = assistantMessagesByParent()
      const partIds: string[] = []
      if (byParent) {
        for (const [, messages] of byParent) {
          for (const msg of messages) {
            if (msg.role === "assistant") {
              partIds.push(msg.id)
              const parts = sync().data.part[msg.id]
              if (parts) {
                for (const p of parts) {
                  if (p.type === "text" && "text" in p) {
                    partIds.push(`${msg.id}:${(p as any).text?.length || 0}`)
                  }
                }
              }
            }
          }
        }
      }
      return { byParent, partKey: partIds.join(",") }
    },
    () => {
      processTTSForMessages()
    }
  ))

  // EFFECT 2: Polling — 80ms so newly streamed words are picked up almost instantly
  const ttsPollInterval = setInterval(() => {
    processTTSForMessages()
  }, 80)

  // Get the AudioContext running now rather than on the first reply
  void warmTTSContext()

  // Listen for TTS stop events (when user sends a new message)
  const handleTTSStop = () => stopAllTTS()
  window.addEventListener("tts-stop", handleTTSStop)

  onCleanup(() => {
    clearInterval(ttsPollInterval)
    window.removeEventListener("tts-stop", handleTTSStop)
    if (removeVoiceTTSAudio) removeVoiceTTSAudio()
    delete (window as any).__stopTTS
    stopAllTTS()
    // The context is created eagerly for latency, so it must be released here or
    // every session this view mounts would strand an audio thread.
    if (ttsAudioContext) {
      try { void ttsAudioContext.close() } catch {}
      ttsAudioContext = null
    }
  })

  let prependAnchor: { key: string; offset: number } | undefined
  let prependAnchorFrame: number | undefined
  let prependLoading = false
  const clearPrependAnchor = () => {
    prependLoading = false
    prependAnchor = undefined
    if (prependAnchorFrame === undefined) return
    cancelAnimationFrame(prependAnchorFrame)
    prependAnchorFrame = undefined
  }
  const capturePrependAnchor = () => {
    prependLoading = true
    updatePrependAnchor()
  }
  const updatePrependAnchor = () => {
    const root = listRoot()
    if (!root) return
    const view = root.getBoundingClientRect()
    const anchor = [...root.querySelectorAll<HTMLElement>("[data-timeline-key]")]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter((item) => item.rect.bottom > view.top && item.rect.top < view.bottom)
      .sort((a, b) => a.rect.top - b.rect.top)[0]
    if (!anchor) return
    if (!anchor.element.dataset.timelineKey) return
    prependAnchor = { key: anchor.element.dataset.timelineKey, offset: anchor.rect.top - view.top }
  }
  const restorePrependAnchor = (done: boolean) => {
    if (done) prependLoading = false
    applyPrependAnchor()
  }
  const applyPrependAnchor = () => {
    const root = listRoot()
    if (!root || !prependAnchor) return
    if (prependAnchorFrame !== undefined) cancelAnimationFrame(prependAnchorFrame)
    let frames = 0
    let stable = 0
    const apply = () => {
      prependAnchorFrame = undefined
      const anchor = prependAnchor
      if (!anchor) return
      const element = root.querySelector<HTMLElement>(`[data-timeline-key="${CSS.escape(anchor.key)}"]`)
      const delta = element
        ? element.getBoundingClientRect().top - root.getBoundingClientRect().top - anchor.offset
        : undefined
      if (delta !== undefined && Math.abs(delta) > 0.5) {
        root.scrollTop += delta
        stable = 0
      } else {
        stable += 1
      }
      frames += 1
      if (stable >= 30 || frames >= 180) {
        if (!prependLoading) prependAnchor = undefined
        return
      }
      prependAnchorFrame = requestAnimationFrame(apply)
    }
    prependAnchorFrame = requestAnimationFrame(apply)
  }

  const [toolOpen, setToolOpen] = createStore<Record<string, boolean | undefined>>(cached?.toolOpen ?? {})
  const [renderOverscan, setRenderOverscan] = createSignal(initialMeasurements?.length || coldBottomMount ? 6 : 20)
  let resizePinnedIndexes: number[] = []
  let resizePinFrame: number | undefined
  let virtualContent: HTMLDivElement | undefined
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return timelineRows().length
    },
    getScrollElement: () => listRoot() ?? null,
    observeElementOffset: observeElementOffsetReconnectAware,
    initialOffset: () => (props.shouldAnchorBottom() ? Number.MAX_SAFE_INTEGER : 0),
    initialMeasurementsCache: initialMeasurements,
    estimateSize: () => timelineFallbackItemSize,
    scrollToFn: (offset, options, instance) => {
      // Expose the computed range before core writes an anchor correction so the browser does not clamp it to the old height.
      if (virtualContent) virtualContent.style.height = `${instance.getTotalSize()}px`
      elementScroll(offset, options, instance)
    },
    get getItemKey() {
      const rows = timelineRows()
      return (index: number) => {
        const row = rows[index]
        // ResizeObserver can report a removed element after its row has left the projection.
        if (!row) return `removed:${index}`
        return TimelineRow.key(row)
      }
    },
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: 80,
    get scrollMargin() {
      return showHeader() ? 64 : 0
    },
    overscan: 50,
    paddingStart: 0,
    paddingEnd: 64,
    rangeExtractor: (range) => {
      const id = activeMessageID()
      const active = id ? (messageLastRowIndex().get(id) ?? -1) : -1
      const indexes = defaultRangeExtractor({ ...range, overscan: renderOverscan() })
      return filterVirtualIndexes(
        [...new Set([...resizePinnedIndexes, ...indexes, ...(active < 0 ? [] : [active])])].sort((a, b) => a - b),
        range.count,
      )
    },
  })
  const resizeItem = virtualizer.resizeItem
  let resizeAnchorScheduled = false
  const anchorResizedBottom = () => {
    if (resizeAnchorScheduled || props.hasScrollGesture()) return
    resizeAnchorScheduled = true
    queueMicrotask(() => {
      resizeAnchorScheduled = false
      if (!props.shouldAnchorBottom() || props.hasScrollGesture()) return
      virtualizer.scrollToEnd()
    })
  }
  virtualizer.resizeItem = (index, size) => {
    const item = virtualizer.measurementsCache[index]
    const previous = item ? (virtualizer.itemSizeCache.get(item.key) ?? item.size) : undefined
    const root = listRoot()
    if (root && previous !== undefined && Math.abs(size - previous) > root.clientHeight) {
      const view = root.getBoundingClientRect()
      resizePinnedIndexes = [...root.querySelectorAll<HTMLElement>("[data-index]")]
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.bottom > view.top && rect.top < view.bottom
        })
        .map((element) => Number(element.dataset.index))
      if (resizePinFrame !== undefined) cancelAnimationFrame(resizePinFrame)
      resizePinFrame = requestAnimationFrame(() => {
        resizePinFrame = requestAnimationFrame(() => {
          resizePinFrame = undefined
          resizePinnedIndexes = []
        })
      })
    }
    resizeItem(index, size)
    if (root && props.shouldAnchorBottom()) anchorResizedBottom()
  }
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) => {
    if (props.shouldAnchorBottom()) return false
    const first = virtualizer.range?.startIndex
    return first !== undefined && item.index < first
  }
  const virtualItemByKey = createMemo(
    () => new Map(virtualizer.getVirtualItems().map((item) => [item.key, item] as const)),
  )
  const virtualRowKeys = createMemo(() => virtualizer.getVirtualItems().map((item) => item.key as string))
  createEffect(() => {
    props.setRevealMessage?.((id) => {
      const index = messageRowIndex().get(id)
      if (index === undefined) return
      virtualizer.scrollToIndex(index, { align: "center" })
    })
    props.setScrollToEnd?.(() => virtualizer.scrollToEnd())
    props.setHistoryAnchor?.({ capture: capturePrependAnchor, restore: restorePrependAnchor })
  })

  let overscanFrame: number | undefined
  onMount(() => {
    overscanFrame = requestAnimationFrame(() => {
      if (props.shouldAnchorBottom()) virtualizer.scrollToEnd()
      overscanFrame = requestAnimationFrame(() => {
        overscanFrame = undefined
        if (renderOverscan() < 20) setRenderOverscan(20)
        if (props.shouldAnchorBottom()) virtualizer.scrollToEnd()
      })
    })
  })

  const maybeAnchorBottom = () => {
    if (timelineRows().length === 0) return
    if (!props.shouldAnchorBottom() || props.hasScrollGesture()) return
    if (resizePinFrame !== undefined) cancelAnimationFrame(resizePinFrame)
    clearPrependAnchor()
    if (prependAnchorFrame !== undefined) cancelAnimationFrame(prependAnchorFrame)
    virtualizer.scrollToEnd()
  }

  let measuredSessionKey = sessionKey()
  createEffect(() => {
    const key = sessionKey()
    timelineRows().length
    if (measuredSessionKey !== key) {
      measuredSessionKey = key
      virtualizer.measure()
    }
    maybeAnchorBottom()
  })

  onCleanup(() => {
    clearPrependAnchor()
    timelineCache.delete(ownerSessionKey)
    timelineCache.set(ownerSessionKey, { measurements: virtualizer.takeSnapshot(), toolOpen: { ...toolOpen } })
    while (timelineCache.size > 16) timelineCache.delete(timelineCache.keys().next().value!)
    if (resizePinFrame !== undefined) cancelAnimationFrame(resizePinFrame)
    if (overscanFrame !== undefined) cancelAnimationFrame(overscanFrame)
    props.setRevealMessage?.(() => {})
    props.setScrollToEnd?.(() => {})
    props.setHistoryAnchor?.({ capture: () => {}, restore: () => {} })
  })

  const [title, setTitle] = createStore({
    draft: "",
    editing: false,
    menuOpen: false,
    pendingRename: false,
    pendingShare: false,
  })
  let titleRef: HTMLInputElement | undefined

  const [share, setShare] = createStore({
    open: false,
    dismiss: null as "escape" | "outside" | null,
  })
  let more: HTMLButtonElement | undefined

  const bindListRoot = (root: HTMLDivElement) => {
    if (root === listRoot()) return
    setListRoot(root)
    props.setScrollRef(root)
  }

  const handleListWheel = (event: WheelEvent & { currentTarget: HTMLDivElement }) => {
    if (!prependLoading) clearPrependAnchor()
    const root = event.currentTarget
    const delta = normalizeWheelDelta({
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      rootHeight: root.clientHeight,
    })
    if (!delta) return
    markBoundaryGesture({ root, target: event.target, delta, onMarkScrollGesture: props.onMarkScrollGesture })
  }

  const handleListTouchStart = (event: TouchEvent) => {
    if (!prependLoading) clearPrependAnchor()
    touchGesture = event.touches[0]?.clientY
  }

  const handleListTouchMove = (event: TouchEvent & { currentTarget: HTMLDivElement }) => {
    const next = event.touches[0]?.clientY
    const prev = touchGesture
    touchGesture = next
    if (next === undefined || prev === undefined) return

    const delta = prev - next
    if (!delta) return

    markBoundaryGesture({
      root: event.currentTarget,
      target: event.target,
      delta,
      onMarkScrollGesture: props.onMarkScrollGesture,
    })
  }

  const handleListTouchEnd = () => {
    touchGesture = undefined
  }

  const handleListPointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (!prependLoading) clearPrependAnchor()
    props.onMarkScrollGesture(event.target)
  }

  const handleListPointerMove = (event: PointerEvent) => {
    if (event.buttons !== 1) return
    props.onMarkScrollGesture(event.target)
  }

  const handleListKeyDown = (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
    const key = scrollKey(event)
    if (!key) return
    if (!isScrollKeyTarget(event.target, key)) return
    if (scrollKeyOwner(event.currentTarget, event.target, key) !== event.currentTarget) return
    if (!prependLoading) clearPrependAnchor()
    props.onMarkScrollGesture(event.currentTarget)
  }

  const handleListScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    if (prependLoading) updatePrependAnchor()
    props.onScheduleScrollState(event.currentTarget)
    props.onHistoryScroll()
    if (!props.hasScrollGesture()) return
    props.onUserScroll()
    props.onAutoScrollHandleScroll()
    props.onMarkScrollGesture(event.currentTarget)
  }

  onCleanup(() => {
    props.setScrollRef(undefined)
  })

  const viewShare = () => {
    const url = shareUrl()
    if (!url) return
    platform.openLink(url)
  }

  const errorMessage = (err: unknown) => {
    if (err && typeof err === "object" && "data" in err) {
      const data = (err as { data?: { message?: string } }).data
      if (data?.message) return data.message
    }
    if (err instanceof Error) return err.message
    return language.t("common.requestFailed")
  }

  const shareMutation = useMutation(() => ({
    mutationFn: (id: string) => serverSDK().client.session.share({ sessionID: id }),
    onError: (err) => {
      console.error("Failed to share session", err)
    },
  }))

  const unshareMutation = useMutation(() => ({
    mutationFn: (id: string) => serverSDK().client.session.unshare({ sessionID: id }),
    onError: (err) => {
      console.error("Failed to unshare session", err)
    },
  }))

  const titleMutation = useMutation(() => ({
    mutationFn: (input: { id: string; title: string }) =>
      sdk().client.session.update({ sessionID: input.id, title: input.title }),
    onSuccess: (_, input) => {
      sync().set(
        produce((draft) => {
          const index = draft.session.findIndex((s) => s.id === input.id)
          if (index !== -1) draft.session[index].title = input.title
        }),
      )
      setTitle("editing", false)
    },
    onError: (err) => {
      showToast({
        title: language.t("common.requestFailed"),
        description: errorMessage(err),
      })
    },
  }))

  const shareSession = () => {
    const id = sessionID()
    if (!id || shareMutation.isPending) return
    if (!shareEnabled()) return
    shareMutation.mutate(id)
  }

  const unshareSession = () => {
    const id = sessionID()
    if (!id || unshareMutation.isPending) return
    if (!shareEnabled()) return
    unshareMutation.mutate(id)
  }
  const copyShareUrl = () => {
    const url = shareUrl()
    if (!url) return
    void navigator.clipboard
      .writeText(url)
      .then(() =>
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("session.share.copy.copied"),
          description: url,
        }),
      )
      .catch((err: unknown) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(err),
        }),
      )
  }
  const selectShareUrlText: JSX.EventHandler<HTMLDivElement, MouseEvent> = (event) => {
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(event.currentTarget)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  createEffect(
    on(
      sessionKey,
      () =>
        setTitle({
          draft: "",
          editing: false,
          menuOpen: false,
          pendingRename: false,
          pendingShare: false,
        }),
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => [parentID(), childTaskDescription()] as const,
      ([id, description]) => {
        if (!id || description) return
        if (sync().data.message[id] !== undefined) return
        void sync().session.sync(id)
      },
      { defer: true },
    ),
  )

  const openTitleEditor = () => {
    if (!sessionID() || parentID()) return
    setTitle({ editing: true, draft: titleLabel() ?? "" })
    requestAnimationFrame(() => {
      if (!titleRef) return
      titleRef.focus()
      titleRef.select()
    })
  }

  const closeTitleEditor = () => {
    if (titleMutation.isPending) return
    setTitle("editing", false)
  }

  const saveTitleEditor = () => {
    const id = sessionID()
    if (!id) return
    if (titleMutation.isPending) return

    const next = title.draft.trim()
    if (!next || next === (titleLabel() ?? "")) {
      setTitle("editing", false)
      return
    }

    titleMutation.mutate({ id, title: next })
  }

  const navigateAfterSessionRemoval = (sessionID: string, parentID?: string, nextSessionID?: string) => {
    if (params.id !== sessionID) return
    const href = (id: string) =>
      params.serverKey ? sessionHref(requireServerKey(params.serverKey), id) : legacySessionHref(sdk().directory, id)
    if (parentID) {
      navigate(href(parentID))
      return
    }
    if (nextSessionID) {
      navigate(href(nextSessionID))
      return
    }
    if (params.serverKey) {
      tabs.newDraft({ server: requireServerKey(params.serverKey), directory: sdk().directory })
      return
    }
    navigate(`/${params.dir}/session`)
  }

  const archiveSession = async (sessionID: string) => {
    const session = sync().session.get(sessionID)
    if (!session) return

    const sessions = sync().data.session ?? []
    const index = sessions.findIndex((s) => s.id === sessionID)
    const nextSession = index === -1 ? undefined : (sessions[index + 1] ?? sessions[index - 1])

    await sdk()
      .client.session.update({ sessionID, time: { archived: Date.now() } })
      .then(() => {
        sync().set(
          produce((draft) => {
            const index = draft.session.findIndex((s) => s.id === sessionID)
            if (index !== -1) draft.session.splice(index, 1)
          }),
        )
        sync().session.evict(sessionID)
        navigateAfterSessionRemoval(sessionID, session.parentID, nextSession?.id)
        notifySessionTabsRemoved({ directory: sdk().directory, sessionIDs: [sessionID] })
      })
      .catch((err) => {
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(err),
        })
      })
  }

  const deleteSession = async (sessionID: string) => {
    const session = sync().session.get(sessionID)
    if (!session) return false

    const sessions = (sync().data.session ?? []).filter((s) => !s.parentID && !s.time?.archived)
    const index = sessions.findIndex((s) => s.id === sessionID)
    const nextSession = index === -1 ? undefined : (sessions[index + 1] ?? sessions[index - 1])

    const result = await sdk()
      .client.session.delete({ sessionID })
      .then((x) => x.data)
      .catch((err) => {
        showToast({
          title: language.t("session.delete.failed.title"),
          description: errorMessage(err),
        })
        return false
      })

    if (!result) return false

    const removed = new Set<string>([sessionID])
    const byParent = new Map<string, string[]>()
    for (const item of sync().data.session) {
      const parentID = item.parentID
      if (!parentID) continue
      const existing = byParent.get(parentID)
      if (existing) {
        existing.push(item.id)
        continue
      }
      byParent.set(parentID, [item.id])
    }

    const stack = [sessionID]
    while (stack.length) {
      const parentID = stack.pop()
      if (!parentID) continue

      const children = byParent.get(parentID)
      if (!children) continue

      for (const child of children) {
        if (removed.has(child)) continue
        removed.add(child)
        stack.push(child)
      }
    }

    navigateAfterSessionRemoval(sessionID, session.parentID, nextSession?.id)

    sync().set(
      produce((draft) => {
        draft.session = draft.session.filter((s) => !removed.has(s.id))
      }),
    )

    for (const id of removed) {
      sync().session.evict(id)
    }
    notifySessionTabsRemoved({ directory: sdk().directory, sessionIDs: [...removed] })
    return true
  }

  const navigateParent = () => {
    const id = parentID()
    if (!id) return
    navigate(
      params.serverKey ? sessionHref(requireServerKey(params.serverKey), id) : legacySessionHref(sdk().directory, id),
    )
  }

  function DialogDeleteSession(props: { sessionID: string }) {
    const name = createMemo(
      () => sessionTitle(sync().session.get(props.sessionID)?.title) ?? language.t("command.session.new"),
    )
    const handleDelete = async () => {
      await deleteSession(props.sessionID)
      dialog.close()
    }

    if (settings.general.newLayoutDesigns())
      return (
        <DialogV2 fit>
          <DialogHeader hideClose>
            <DialogTitleGroup
              title={language.t("session.delete.title")}
              description={language.t("session.delete.confirm", { name: name() })}
            />
          </DialogHeader>
          <DialogFooter>
            <ButtonV2 variant="ghost" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </ButtonV2>
            <ButtonV2 variant="danger" onClick={handleDelete}>
              {language.t("session.delete.button")}
            </ButtonV2>
          </DialogFooter>
        </DialogV2>
      )

    return (
      <Dialog title={language.t("session.delete.title")} fit>
        <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <div class="flex flex-col gap-1">
            <span class="text-14-regular text-text-strong">
              {language.t("session.delete.confirm", { name: name() })}
            </span>
          </div>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button variant="primary" size="large" onClick={handleDelete}>
              {language.t("session.delete.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }

  const workingTurn = (userMessageID: string) => sessionStatus().type !== "idle" && activeMessageID() === userMessageID

  const turnDurationMs = (userMessageID: string) => {
    const message = messageByID().get(userMessageID)
    if (!message || message.role !== "user") return
    const end = (assistantMessagesByParent().get(userMessageID) ?? emptyAssistantMessages).reduce<number | undefined>(
      (max, item) => {
        const completed = item.time.completed
        if (typeof completed !== "number") return max
        if (max === undefined) return completed
        return Math.max(max, completed)
      },
      undefined,
    )
    if (typeof end !== "number") return
    if (end < message.time.created) return
    return end - message.time.created
  }

  const assistantCopyPartID = (userMessageID: string) => {
    if (workingTurn(userMessageID)) return null
    const messages = assistantMessagesByParent().get(userMessageID) ?? emptyAssistantMessages

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (!message) continue

      const parts = getMsgParts(message.id)
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j]
        if (!part || part.type !== "text" || !part.text?.trim()) continue
        return part.id
      }
    }
  }

  const renderAssistantPartGroup = (row: Accessor<TimelineRowMap["AssistantPart"]>, onSizeChange?: () => void) => {
    if (row().group.type === "context") {
      const parts = createMemo(() => {
        const group = row().group
        if (group.type !== "context") return emptyTools
        return group.refs
          .map((ref) => getMsgPart(ref.messageID, ref.partID))
          .filter((part): part is ToolPart => part?.type === "tool")
      })
      const contextOpenKey = () => `context:${row().group.key}`
      const open = createMemo(() => {
        return toolOpen[contextOpenKey()] === true
      })

      return (
        <ContextToolGroup
          parts={parts()}
          open={open()}
          onOpenChange={(value) => setToolOpen(contextOpenKey(), value)}
          busy={
            workingTurn(row().userMessageID) && lastAssistantGroupKey().get(row().userMessageID) === row().group.key
          }
          onSizeChange={onSizeChange}
        />
      )
    }

    const message = createMemo(() => {
      const group = row().group
      if (group.type !== "part") return
      return messageByID().get(group.ref.messageID)
    })
    const part = createMemo(() => {
      const group = row().group
      if (group.type !== "part") return
      return getMsgPart(group.ref.messageID, group.ref.partID)
    })
    const defaultOpen = createMemo(() => {
      const item = part()
      if (!item) return
      return partDefaultOpen(item, settings.general.shellToolPartsExpanded(), settings.general.editToolPartsExpanded())
    })

    return (
      <Show when={message()}>
        {(message) => (
          <Show when={part()}>
            {(part) => {
              const filteredPart = createMemo(() => {
                const p = part()
                if (p.type === "text" && "text" in p) {
                  const originalText = (p as any).text || ""
                  let cleaned = stripThinkingBlocks(originalText)
                  cleaned = stripEnglishReasoning(cleaned)
                  if (cleaned !== originalText) {
                    return { ...p, text: cleaned } as typeof p
                  }
                }
                return p
              })
              return (
                <MessagePart
                  part={filteredPart()}
                  message={message()}
                  showAssistantCopyPartID={assistantCopyPartID(row().userMessageID)}
                  turnDurationMs={turnDurationMs(row().userMessageID)}
                  useV2Actions={settings.general.newLayoutDesigns()}
                  defaultOpen={defaultOpen()}
                  toolOpen={toolOpen[part().id] ?? defaultOpen()}
                  onToolOpenChange={(open) => setToolOpen(part().id, open)}
                  deferToolContent
                  virtualizeDiff={false}
                  onContentRendered={onSizeChange}
                />
              )
            }}
          </Show>
        )}
      </Show>
    )
  }

  function TimelineRowFrame(input: { row: Accessor<FramedTimelineRow>; children: JSX.Element }) {
    const anchor = () => {
      const row = input.row()
      return row._tag === "CommentStrip" || (row._tag === "UserMessage" && row.anchor)
    }
    const previousAssistantPart = () => {
      const row = input.row()
      return row._tag === "AssistantPart" && row.previousAssistantPart
    }

    return (
      <div
        id={anchor() ? props.anchor(input.row().userMessageID) : undefined}
        data-message-id={input.row().userMessageID}
        data-timeline-row={input.row()._tag}
        classList={{
          "min-w-0 w-full max-w-full": true,
          "md:max-w-200 2xl:max-w-[1000px]": props.centered,
          "md:mx-auto": props.centered,
          "pt-3": previousAssistantPart(),
        }}
      >
        <div data-component="session-turn" class="min-w-0 w-full relative" style={{ height: "auto" }}>
          {input.children}
        </div>
      </div>
    )
  }

  const renderTimelineRow = (row: Accessor<TimelineRow.TimelineRow>, onSizeChange?: () => void) => {
    switch (row()._tag) {
      case "TurnGap":
        return <div data-timeline-row="TurnGap" aria-hidden="true" class="h-6" />
      case "CommentStrip": {
        const commentStripRow = row as Accessor<TimelineRowByTag<"CommentStrip">>
        const comments = createMemo(() =>
          getMsgParts(commentStripRow().userMessageID).flatMap((part) => MessageComment.fromPart(part) ?? []),
        )
        return (
          <TimelineRowFrame row={commentStripRow}>
            <div class="w-full px-4 md:px-5 pb-2">
              <div class="ml-auto max-w-[82%] overflow-x-auto no-scrollbar">
                <div class="flex w-max min-w-full justify-end gap-2">
                  <Index each={comments()}>
                    {(comment) => (
                      <div
                        classList={{
                          "shrink-0 max-w-[260px] rounded-[6px] border-border-weak-base bg-background-stronger px-2.5 py-2": true,
                          "border-[0.5px]": settings.general.newLayoutDesigns(),
                          border: !settings.general.newLayoutDesigns(),
                        }}
                      >
                        <div class="flex items-center gap-1.5 min-w-0 text-11-medium text-text-strong">
                          <FileIcon node={{ path: comment().path, type: "file" }} class="size-3.5 shrink-0" />
                          <span class="truncate">{getFilename(comment().path)}</span>
                          <Show when={comment().selection}>
                            {(selection) => (
                              <span class="shrink-0 text-text-weak">
                                {selection().startLine === selection().endLine
                                  ? `:${selection().startLine}`
                                  : `:${selection().startLine}-${selection().endLine}`}
                              </span>
                            )}
                          </Show>
                        </div>
                        <div class="pt-1 text-12-regular text-text-strong whitespace-pre-wrap break-words">
                          {comment().comment}
                        </div>
                      </div>
                    )}
                  </Index>
                </div>
              </div>
            </div>
          </TimelineRowFrame>
        )
      }
      case "UserMessage": {
        const userMessageRow = row as Accessor<TimelineRowByTag<"UserMessage">>
        const message = createMemo(() => {
          const m = messageByID().get(userMessageRow().userMessageID)
          if (m?.role === "user") return m
        })
        const messageComments = createMemo(() => {
          if (!settings.general.newLayoutDesigns()) return []
          return getMsgParts(userMessageRow().userMessageID).flatMap((part) => MessageComment.fromPart(part) ?? [])
        })
        return (
          <TimelineRowFrame row={userMessageRow}>
            <Show when={message()}>
              {(message) => (
                <div data-slot="session-turn-message-container" class="w-full px-4 md:px-5">
                  <div data-slot="session-turn-message-content" aria-live="off">
                    <Message
                      message={message()}
                      parts={getMsgParts(userMessageRow().userMessageID)}
                      actions={props.actions}
                      useV2Actions={settings.general.newLayoutDesigns()}
                      comments={messageComments()}
                    />
                  </div>
                </div>
              )}
            </Show>
          </TimelineRowFrame>
        )
      }
      case "TurnDivider": {
        const turnDividerRow = row as Accessor<TimelineRowByTag<"TurnDivider">>
        return (
          <TimelineRowFrame row={turnDividerRow}>
            <div data-slot="session-turn-message-container" class="w-full px-4 md:px-5">
              <div data-slot="session-turn-compaction">
                <MessageDivider
                  label={language.t(
                    turnDividerRow().label === "compaction" ? "ui.messagePart.compaction" : "ui.message.interrupted",
                  )}
                />
              </div>
            </div>
          </TimelineRowFrame>
        )
      }
      case "AssistantPart": {
        const assistantPartRow = row as Accessor<TimelineRowByTag<"AssistantPart">>
        return (
          <TimelineRowFrame row={assistantPartRow}>
            <div data-slot="session-turn-message-container" class="w-full px-4 md:px-5">
              <div
                data-slot="session-turn-assistant-content"
                aria-hidden={workingTurn(assistantPartRow().userMessageID)}
              >
                {renderAssistantPartGroup(assistantPartRow, onSizeChange)}
              </div>
            </div>
          </TimelineRowFrame>
        )
      }
      case "Thinking": {
        const thinkingRow = row as Accessor<TimelineRowByTag<"Thinking">>
        return (
          <TimelineRowFrame row={thinkingRow}>
            <div data-slot="session-turn-message-container" class="w-full px-4 md:px-5">
              <TimelineThinkingRow
                reasoningHeading={thinkingRow().reasoningHeading}
                showReasoningSummaries={settings.general.showReasoningSummaries()}
              />
            </div>
          </TimelineRowFrame>
        )
      }
      case "Retry": {
        const retryRow = row as Accessor<TimelineRowByTag<"Retry">>
        return (
          <TimelineRowFrame row={retryRow}>
            <div data-slot="session-turn-message-container" class="w-full px-4 md:px-5">
              <SessionRetry status={sessionStatus()} show={activeMessageID() === retryRow().userMessageID} />
            </div>
          </TimelineRowFrame>
        )
      }
      case "DiffSummary": {
        const diffSummaryRow = row as Accessor<TimelineRowByTag<"DiffSummary">>
        return (
          <TimelineRowFrame row={diffSummaryRow}>
            <div data-slot="session-turn-message-container" class="w-full px-4 md:px-5">
              <TimelineDiffSummaryRow diffs={diffSummaryRow().diffs} />
            </div>
          </TimelineRowFrame>
        )
      }
      case "Error": {
        const errorRow = row as Accessor<TimelineRowByTag<"Error">>
        return (
          <TimelineRowFrame row={errorRow}>
            <div data-slot="session-turn-message-container" class="w-full px-4 md:px-5">
              <Card variant="error" class="error-card">
                {errorRow().text}
              </Card>
            </div>
          </TimelineRowFrame>
        )
      }
    }
  }

  function TimelineRowView(props: { row: TimelineRow.TimelineRow; onSizeChange?: () => void }) {
    return renderTimelineRow(() => props.row, props.onSizeChange)
  }

  function VirtualTimelineRow(props: { rowKey: string }) {
    let element: HTMLDivElement
    const initialItem = virtualItemByKey().get(props.rowKey)!
    const initialRow = timelineRowByKey().get(props.rowKey)!
    const item = createMemo(() => virtualItemByKey().get(props.rowKey) ?? initialItem)
    const row = createMemo(() => timelineRowByKey().get(props.rowKey) ?? initialRow)
    const tool = () => {
      const value = row()
      if (value._tag !== "AssistantPart" || value.group.type !== "part") return
      const part = getMsgPart(value.group.ref.messageID, value.group.ref.partID)
      if (part?.type === "tool") return part
    }
    const asyncFile = () => ["edit", "write", "apply_patch"].includes(tool()?.tool ?? "")
    const [ready, setReady] = createSignal(initialItem.size <= timelineFallbackItemSize || !asyncFile())
    let contentMeasureFrame: number | undefined

    onMount(() => virtualizer.measureElement(element))

    createEffect(
      on(
        () => item().index,
        () => {
          virtualizer.measureElement(element)
        },
        { defer: true },
      ),
    )

    onCleanup(() => {
      if (contentMeasureFrame !== undefined) cancelAnimationFrame(contentMeasureFrame)
    })

    return (
      <div
        data-timeline-key={props.rowKey}
        style={{
          position: "absolute",
          top: `${item().start - (showHeader() ? 64 : 0)}px`,
          left: "0",
          width: "100%",
          height: `${item().size}px`,
          overflow: "clip",
          // Rounded virtual measurements can otherwise clip a framed row's outer paint.
          "overflow-clip-margin": row()._tag === "TurnGap" ? undefined : "0.5px",
        }}
      >
        <div
          ref={(value) => {
            element = value
          }}
          data-index={item().index}
          style={{ "min-height": ready() ? undefined : `${initialItem.size}px` }}
        >
          <TimelineRowView
            row={row()}
            onSizeChange={() => {
              setReady(true)
              if (contentMeasureFrame !== undefined) cancelAnimationFrame(contentMeasureFrame)
              contentMeasureFrame = scheduleConnectedMeasure(element, virtualizer.measureElement)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div class="relative w-full h-full min-w-0">
      <div
        class="absolute left-1/2 -translate-x-1/2 z-[60] pointer-events-none transition-all duration-200 ease-out"
        classList={{
          "bottom-8": settings.general.newLayoutDesigns(),
          "bottom-6": !settings.general.newLayoutDesigns(),
          "opacity-100 translate-y-0 scale-100": props.scroll.overflow && props.scroll.jump,
          "opacity-0 translate-y-2 pointer-events-none": !props.scroll.overflow || !props.scroll.jump,
          "scale-[0.8]": (!props.scroll.overflow || !props.scroll.jump) && settings.general.newLayoutDesigns(),
          "scale-95": (!props.scroll.overflow || !props.scroll.jump) && !settings.general.newLayoutDesigns(),
        }}
      >
        <Show
          when={settings.general.newLayoutDesigns()}
          fallback={
            <button
              type="button"
              aria-label={language.t("session.messages.jumpToLatest")}
              class="pointer-events-auto flex items-center justify-center w-10 h-8 bg-transparent border-none cursor-pointer p-0 group"
              onClick={props.onResumeScroll}
            >
              <div
                class="flex items-center justify-center w-8 h-6 rounded-[6px] border border-border-weaker-base bg-[color-mix(in_srgb,var(--surface-raised-stronger-non-alpha)_80%,transparent)] backdrop-blur-[0.75px] transition-colors group-hover:border-[var(--border-weak-base)] group-hover:[--icon-base:var(--icon-hover)]"
                style={{
                  "box-shadow":
                    "0 51px 60px 0 rgba(0,0,0,0.10), 0 15px 18px 0 rgba(0,0,0,0.12), 0 6.386px 7.513px 0 rgba(0,0,0,0.12), 0 2.31px 2.717px 0 rgba(0,0,0,0.20)",
                }}
              >
                <Icon name="arrow-down-to-line" size="small" />
              </div>
            </button>
          }
        >
          <button
            type="button"
            aria-label={language.t("session.messages.jumpToLatest")}
            class="pointer-events-auto flex items-center justify-center w-8 h-7 px-2 py-1.5 rounded-lg border-none cursor-pointer text-v2-text-text-base backdrop-blur-[2px]"
            style={{
              background: "color-mix(in srgb, var(--v2-background-bg-base) 92%, transparent)",
              "box-shadow": "var(--v2-elevation-raised), 0px 2px 8px var(--v2-background-bg-base)",
            }}
            onClick={props.onResumeScroll}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M12.3333 8.66665L8 13L3.66667 8.66665M8 12.6667V2.83332"
                stroke="currentColor"
                stroke-linecap="square"
              />
            </svg>
          </button>
        </Show>
      </div>
      <ScrollView
        viewportRef={bindListRoot}
        onWheel={handleListWheel}
        onTouchStart={handleListTouchStart}
        onTouchMove={handleListTouchMove}
        onTouchEnd={handleListTouchEnd}
        onTouchCancel={handleListTouchEnd}
        onPointerDown={handleListPointerDown}
        onPointerMove={handleListPointerMove}
        onKeyDown={handleListKeyDown}
        onScroll={handleListScroll}
        onClick={props.onAutoScrollInteraction}
        class="relative min-w-0 w-full h-full"
        style={{
          "--sticky-accordion-top": showHeader() ? "48px" : "0px",
        }}
      >
        <Show when={showHeader()}>
          <div
            data-session-title
            classList={{
              "sticky top-0 z-30": true,
              "bg-[linear-gradient(to_bottom,var(--v2-background-bg-base)_48px,transparent)]":
                settings.general.newLayoutDesigns(),
              "bg-[linear-gradient(to_bottom,var(--background-stronger)_48px,transparent)]":
                !settings.general.newLayoutDesigns(),
              "w-full": true,
              "pb-4": true,
              "pr-3": true,
              "pl-2.5": settings.general.newLayoutDesigns(),
              "pl-2 md:pl-4": !settings.general.newLayoutDesigns(),
              "md:max-w-200 md:mx-auto 2xl:max-w-[1000px]": props.centered,
            }}
          >
            <div class="h-12 w-full flex items-center justify-between gap-2">
              <div
                classList={{
                  "flex items-center gap-1 min-w-0 flex-1": true,
                  "pr-3": !settings.general.newLayoutDesigns(),
                }}
              >
                <div class="flex items-center min-w-0 flex-1 w-full">
                  <Show when={parentID()}>
                    <button
                      type="button"
                      data-slot="session-title-parent"
                      class="min-w-0 max-w-[40%] truncate pl-2 text-[13px] font-[530] leading-4 tracking-[-0.04px] text-v2-text-text-faint transition-colors hover:text-v2-text-text-muted"
                      onClick={navigateParent}
                    >
                      {parentTitle()}
                    </button>
                    <span
                      data-slot="session-title-separator"
                      class="-translate-y-[0.5px] pl-2 pr-1 text-[11px] font-medium text-v2-text-text-faint"
                      aria-hidden="true"
                    >
                      /
                    </span>
                  </Show>
                  <Show when={childTitle() || title.editing}>
                    <Show
                      when={title.editing}
                      fallback={
                        <h1
                          data-slot="session-title-child"
                          classList={{
                            "truncate text-[13px] font-[530] leading-4 tracking-[-0.04px] text-v2-text-text-base": true,
                            "w-fit rounded-[6px] px-2 py-1 hover:bg-v2-overlay-simple-overlay-hover":
                              settings.general.newLayoutDesigns(),
                            "grow-1 min-w-0": !settings.general.newLayoutDesigns(),
                          }}
                          onClick={openTitleEditor}
                        >
                          {childTitle()}
                        </h1>
                      }
                    >
                      <InlineInput
                        ref={(el) => {
                          titleRef = el
                        }}
                        data-slot="session-title-child"
                        value={title.draft}
                        disabled={titleMutation.isPending}
                        classList={{
                          "block text-[13px] font-[530] leading-4 tracking-[-0.04px] text-v2-text-text-base": true,
                          "w-full flex-1 grow-1 min-w-0 pl-1 -ml-1 rounded-[6px]": !settings.general.newLayoutDesigns(),
                          "field-sizing-content self-start rounded-[6px] px-2 py-1 ":
                            settings.general.newLayoutDesigns(),
                        }}
                        style={{
                          "--inline-input-shadow": settings.general.newLayoutDesigns()
                            ? "none"
                            : "var(--shadow-xs-border-select)",
                        }}
                        onInput={(event) => setTitle("draft", event.currentTarget.value)}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === "Enter") {
                            event.preventDefault()
                            void saveTitleEditor()
                            return
                          }
                          if (event.key === "Escape") {
                            event.preventDefault()
                            closeTitleEditor()
                          }
                        }}
                        onBlur={closeTitleEditor}
                      />
                    </Show>
                  </Show>
                </div>
              </div>
              <Show when={sessionID()} keyed>
                {(id) => (
                  <div
                    classList={{
                      "shrink-0 flex items-center": true,
                      "gap-2": settings.general.newLayoutDesigns(),
                      "gap-3": !settings.general.newLayoutDesigns(),
                    }}
                  >
                    <SessionContextUsage
                      placement="bottom"
                      buttonAppearance={settings.general.newLayoutDesigns() ? "v2" : "default"}
                    />
                    <Show when={!parentID()}>
                      <Show
                        when={settings.general.newLayoutDesigns()}
                        fallback={
                          <DropdownMenu
                            gutter={4}
                            placement="bottom-end"
                            open={title.menuOpen}
                            onOpenChange={(open) => {
                              setTitle("menuOpen", open)
                              if (open) return
                            }}
                          >
                            <DropdownMenu.Trigger
                              as={IconButton}
                              icon="dot-grid"
                              variant="ghost"
                              class="size-6 rounded-md data-[expanded]:bg-surface-base-active"
                              classList={{
                                "bg-surface-base-active": share.open || title.pendingShare,
                              }}
                              aria-label={language.t("common.moreOptions")}
                              aria-expanded={title.menuOpen || share.open || title.pendingShare}
                              ref={(el: HTMLButtonElement) => {
                                more = el
                              }}
                            />
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                style={{ "min-width": "104px" }}
                                onCloseAutoFocus={(event) => {
                                  if (title.pendingRename) {
                                    event.preventDefault()
                                    setTitle("pendingRename", false)
                                    openTitleEditor()
                                    return
                                  }
                                  if (title.pendingShare) {
                                    event.preventDefault()
                                    requestAnimationFrame(() => {
                                      setShare({ open: true, dismiss: null })
                                      setTitle("pendingShare", false)
                                    })
                                  }
                                }}
                              >
                                <DropdownMenu.Item
                                  onSelect={() => {
                                    setTitle("pendingRename", true)
                                    setTitle("menuOpen", false)
                                  }}
                                >
                                  <DropdownMenu.ItemLabel>{language.t("common.rename")}</DropdownMenu.ItemLabel>
                                </DropdownMenu.Item>
                                <Show when={shareEnabled()}>
                                  <DropdownMenu.Item
                                    onSelect={() => {
                                      setTitle({ pendingShare: true, menuOpen: false })
                                    }}
                                  >
                                    <DropdownMenu.ItemLabel>
                                      {language.t("session.share.action.share")}
                                    </DropdownMenu.ItemLabel>
                                  </DropdownMenu.Item>
                                </Show>
                                <DropdownMenu.Item onSelect={() => void archiveSession(id)}>
                                  <DropdownMenu.ItemLabel>{language.t("common.archive")}</DropdownMenu.ItemLabel>
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator />
                                <DropdownMenu.Item
                                  onSelect={() => dialog.show(() => <DialogDeleteSession sessionID={id} />)}
                                >
                                  <DropdownMenu.ItemLabel>{language.t("common.delete")}</DropdownMenu.ItemLabel>
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu>
                        }
                      >
                        <MenuV2
                          gutter={6}
                          placement="bottom-end"
                          open={title.menuOpen}
                          onOpenChange={(open) => {
                            setTitle("menuOpen", open)
                            if (open) return
                          }}
                        >
                          <MenuV2.Trigger
                            as={IconButtonV2}
                            icon={<IconV2 name="outline-dots" />}
                            variant="ghost-muted"
                            size="large"
                            state={share.open || title.pendingShare ? "pressed" : undefined}
                            aria-label={language.t("common.moreOptions")}
                            aria-expanded={title.menuOpen || share.open || title.pendingShare}
                            ref={(el: HTMLButtonElement) => {
                              more = el
                            }}
                          />
                          <MenuV2.Portal>
                            <MenuV2.Content
                              style={{ width: "120px", "min-width": "120px" }}
                              onCloseAutoFocus={(event) => {
                                if (title.pendingRename) {
                                  event.preventDefault()
                                  setTitle("pendingRename", false)
                                  openTitleEditor()
                                  return
                                }
                                if (title.pendingShare) {
                                  event.preventDefault()
                                  requestAnimationFrame(() => {
                                    setShare({ open: true, dismiss: null })
                                    setTitle("pendingShare", false)
                                  })
                                }
                              }}
                            >
                              <MenuV2.Item
                                onSelect={() => {
                                  setTitle("pendingRename", true)
                                  setTitle("menuOpen", false)
                                }}
                              >
                                {language.t("common.rename")}
                              </MenuV2.Item>
                              <Show when={shareEnabled()}>
                                <MenuV2.Item
                                  onSelect={() => {
                                    setTitle({ pendingShare: true, menuOpen: false })
                                  }}
                                >
                                  {language.t("session.share.action.share")}...
                                </MenuV2.Item>
                              </Show>
                              <MenuV2.Item onSelect={() => void archiveSession(id)}>
                                {language.t("common.archive")}
                              </MenuV2.Item>
                              <MenuV2.Separator />
                              <MenuV2.Item onSelect={() => dialog.show(() => <DialogDeleteSession sessionID={id} />)}>
                                {language.t("common.delete")}...
                              </MenuV2.Item>
                            </MenuV2.Content>
                          </MenuV2.Portal>
                        </MenuV2>
                      </Show>

                      <KobaltePopover
                        open={share.open}
                        anchorRef={() => more}
                        placement="bottom-end"
                        gutter={settings.general.newLayoutDesigns() ? 6 : 4}
                        modal={false}
                        onOpenChange={(open) => {
                          if (open) setShare("dismiss", null)
                          setShare("open", open)
                        }}
                      >
                        <KobaltePopover.Portal>
                          <KobaltePopover.Content
                            data-component="popover-content"
                            classList={{
                              "flex w-80 max-w-none flex-col items-start gap-3 rounded-[10px] border-0 bg-v2-background-bg-layer-01 p-3 shadow-[var(--v2-elevation-floating)]":
                                settings.general.newLayoutDesigns(),
                            }}
                            style={{ "min-width": "320px" }}
                            onEscapeKeyDown={(event) => {
                              setShare({ dismiss: "escape", open: false })
                              event.preventDefault()
                              event.stopPropagation()
                            }}
                            onPointerDownOutside={() => {
                              setShare({ dismiss: "outside", open: false })
                            }}
                            onFocusOutside={() => {
                              setShare({ dismiss: "outside", open: false })
                            }}
                            onCloseAutoFocus={(event) => {
                              if (share.dismiss === "outside") event.preventDefault()
                              setShare("dismiss", null)
                            }}
                          >
                            <Show
                              when={settings.general.newLayoutDesigns()}
                              fallback={
                                <div class="flex flex-col p-3">
                                  <div class="flex flex-col gap-1">
                                    <div class="text-13-medium text-text-strong">
                                      {language.t("session.share.popover.title")}
                                    </div>
                                    <div class="text-12-regular text-text-weak">
                                      {shareUrl()
                                        ? language.t("session.share.popover.description.shared")
                                        : language.t("session.share.popover.description.unshared")}
                                    </div>
                                  </div>
                                  <div class="mt-3 flex flex-col gap-2">
                                    <Show
                                      when={shareUrl()}
                                      fallback={
                                        <Button
                                          size="large"
                                          variant="primary"
                                          class="w-full"
                                          onClick={shareSession}
                                          disabled={shareMutation.isPending}
                                        >
                                          {shareMutation.isPending
                                            ? language.t("session.share.action.publishing")
                                            : language.t("session.share.action.publish")}
                                        </Button>
                                      }
                                    >
                                      <div class="flex flex-col gap-2">
                                        <TextField
                                          value={shareUrl() ?? ""}
                                          readOnly
                                          copyable
                                          copyKind="link"
                                          tabIndex={-1}
                                          class="w-full"
                                        />
                                        <div class="grid grid-cols-2 gap-2">
                                          <Button
                                            size="large"
                                            variant="secondary"
                                            class="w-full shadow-none border border-border-weak-base"
                                            onClick={unshareSession}
                                            disabled={unshareMutation.isPending}
                                          >
                                            {unshareMutation.isPending
                                              ? language.t("session.share.action.unpublishing")
                                              : language.t("session.share.action.unpublish")}
                                          </Button>
                                          <Button
                                            size="large"
                                            variant="primary"
                                            class="w-full"
                                            onClick={viewShare}
                                            disabled={unshareMutation.isPending}
                                          >
                                            {language.t("session.share.action.view")}
                                          </Button>
                                        </div>
                                      </div>
                                    </Show>
                                  </div>
                                </div>
                              }
                            >
                              <div class="flex w-full flex-col gap-1.5 px-0.5 pt-0.5">
                                <div class="select-none text-[13px] font-[530] leading-none tracking-[-0.04px] text-v2-text-text-base [font-variation-settings:'slnt'_0]">
                                  {language.t("session.share.popover.title")}
                                </div>
                                <div class="select-none text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-muted [font-variation-settings:'slnt'_0]">
                                  {shareUrl()
                                    ? language.t("session.share.popover.description.shared")
                                    : language.t("session.share.popover.description.unshared")}
                                </div>
                              </div>
                              <div class="flex w-full flex-col gap-2">
                                <Show
                                  when={shareUrl()}
                                  fallback={
                                    <ButtonV2
                                      variant="contrast"
                                      class="w-full"
                                      onClick={shareSession}
                                      disabled={shareMutation.isPending}
                                    >
                                      {shareMutation.isPending
                                        ? language.t("session.share.action.publishing")
                                        : language.t("session.share.action.publish")}
                                    </ButtonV2>
                                  }
                                >
                                  <div class="flex flex-col gap-2">
                                    <div
                                      class="flex h-8 w-full items-center gap-1.5 rounded-[6px] py-1 pl-2.5 pr-1.5 shadow-[var(--v2-elevation-button-neutral)]"
                                      style={{
                                        background:
                                          "linear-gradient(180deg, var(--v2-alpha-light-2) 0%, var(--v2-alpha-light-0) 100%), var(--v2-background-bg-button-neutral)",
                                      }}
                                    >
                                      <div
                                        class="min-w-0 flex-1 truncate select-text cursor-text text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-base [font-variation-settings:'slnt'_0]"
                                        onClick={selectShareUrlText}
                                      >
                                        {shareUrl()}
                                      </div>
                                      <IconButtonV2
                                        type="button"
                                        size="small"
                                        variant="ghost-muted"
                                        icon={<IconV2 name="outline-copy" />}
                                        aria-label={language.t("session.share.copy.copyLink")}
                                        onClick={copyShareUrl}
                                      />
                                      <IconButtonV2
                                        type="button"
                                        size="small"
                                        variant="ghost-muted"
                                        icon={<IconV2 name="outline-square-arrow" />}
                                        aria-label={language.t("session.share.action.view")}
                                        onClick={viewShare}
                                        disabled={unshareMutation.isPending}
                                      />
                                    </div>
                                    <div class="flex w-full">
                                      <ButtonV2
                                        variant="outline"
                                        class="w-full"
                                        onClick={unshareSession}
                                        disabled={unshareMutation.isPending}
                                      >
                                        {unshareMutation.isPending
                                          ? language.t("session.share.action.unpublishing")
                                          : language.t("session.share.action.unpublish")}
                                      </ButtonV2>
                                    </div>
                                  </div>
                                </Show>
                              </div>
                            </Show>
                          </KobaltePopover.Content>
                        </KobaltePopover.Portal>
                      </KobaltePopover>
                    </Show>
                  </div>
                )}
              </Show>
            </div>
          </div>
        </Show>
        <div
          data-timeline-virtual-content
          ref={(element) => {
            virtualContent = element
            props.setContentRef(element)
          }}
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          <For each={virtualRowKeys()}>{(rowKey) => <VirtualTimelineRow rowKey={rowKey} />}</For>
          <Show when={timelineRows().length > 0}>
            <div
              data-timeline-row="bottom-spacer"
              aria-hidden="true"
              class="h-16 absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualizer.getTotalSize() - 64}px)` }}
            />
          </Show>
        </div>
      </ScrollView>
    </div>
  )
}
