// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as Automation from "./service"

import { Effect, Layer, Context, Schema } from "effect"
import { makeGlobalNode } from "@zyraxon-ai/core/effect/app-node"
import { Global } from "@zyraxon-ai/core/global"
import { GlobalBus } from "@/bus/global"
import { MCP } from "@/mcp"
import { AutomationEventStore } from "./event-store"
import { AutomationMcpObserve } from "./mcp-observe"
import { AutomationWatchSpecs } from "./watch-specs"
import { renderEvents } from "./render"
import type { AutomationEvent, AutomationEventInput, AutomationStatus, RawObservation } from "./types"

/** How often the poller checks every connected connector for new messages. */
const DEFAULT_POLL_INTERVAL_MS = 60_000
/** How many events one flush pass hands to the agent. */
const FLUSH_BATCH = 20

export interface Interface {
  /** Observe every connected connector once and store anything new. Returns events recorded. */
  readonly observe: () => Effect.Effect<number>
  /** Deliver undelivered events through the registered dispatchers. Returns delivered count. */
  readonly flush: () => Effect.Effect<number>
  /** Undelivered events, for context injection. */
  readonly pending: (limit?: number) => Effect.Effect<AutomationEvent[]>
  /** Record an event from a webhook or any out-of-band source. */
  readonly ingest: (input: AutomationEventInput) => Effect.Effect<boolean>
  readonly status: () => Effect.Effect<AutomationStatus>
  readonly start: () => Effect.Effect<void>
  readonly stop: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@zyraxon/Automation") {}

const intervalFromEnv = () => {
  const value = Number(process.env.ZYRAXON_AUTOMATION_INTERVAL_MS)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_POLL_INTERVAL_MS
}

function emitChange(count: number) {
  GlobalBus.emit("event", { payload: { type: "automation.events", properties: { count } } })
}

/**
 * Observe one connector by calling the "what is new" tool of its connected MCP server. A
 * connector that is not connected, has no resolvable tool, or is not a readable app is
 * skipped silently — polling must never turn a missing app into a failing loop.
 */
const observeOne = (mcp: MCP.Interface, spec: AutomationWatchSpecs.WatchSpec, server: string) =>
  Effect.gen(function* () {
    const clients = yield* mcp.clients()
    const client = clients[server]
    if (!client) return [] as RawObservation[]
    const tool = yield* Effect.promise(() => AutomationMcpObserve.resolveTool(client, spec.tools))
    if (!tool) return [] as RawObservation[]
    const result = yield* Effect.promise(() => client.callTool({ name: tool, arguments: spec.args ?? {} } as never))
    return AutomationMcpObserve.toObservations(spec.connectorID, spec, result)
  }).pipe(Effect.catchCause(() => Effect.succeed([] as RawObservation[])))

const storeObservations = (connectorID: string, observations: ReadonlyArray<RawObservation>) =>
  Effect.gen(function* () {
    if (observations.length === 0) return 0
    const since = yield* Effect.promise(() => AutomationEventStore.getCursor(connectorID, ""))
    const fresh = observations.filter((item) => item.receivedAt >= since)
    const inputs: AutomationEventInput[] = fresh.map((item) => ({ connectorID, ...item }))
    const inserted = yield* Effect.promise(() => AutomationEventStore.record(connectorID, inputs))
    yield* Effect.promise(() => AutomationEventStore.recordObservation(connectorID, "", Date.now(), inserted))
    return inserted
  })

const make = Effect.gen(function* () {
  const mcp = yield* MCP.Service
  yield* Global.Service

  const observers = new Map<string, (event: AutomationEvent) => Promise<void>>()
  let timer: ReturnType<typeof setInterval> | undefined
  // One drain at a time. A second kick while a drain is running is dropped: the running
  // drain already re-queries the store, so it picks up whatever the new event added.
  let draining = false

  /**
   * A scheduled task is enqueued as an ordinary event when its time has arrived and it has
   * not run today. The store is on disk, so this works the moment the backend is up —
   * including right after the desktop app was reopened by the wake daemon.
   */
  const enqueueDueSchedules = Effect.fn("Automation.enqueueDueSchedules")(function* () {
    const list = yield* Effect.promise(() => AutomationEventStore.schedules())
    if (list.length === 0) return 0
    const now = new Date()
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()]!
    const minutes = now.getHours() * 60 + now.getMinutes()
    const todayKey = now.toISOString().slice(0, 10)
    let queued = 0
    for (const task of list) {
      if (!task.enabled) continue
      const [hour, minute] = task.time.split(":").map((part) => Number(part))
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue
      if (minutes < hour * 60 + minute) continue
      if (task.lastRunKey === todayKey) continue
      if (task.kind === "daily" && task.days.length > 0 && !task.days.includes(day)) continue
      const inserted = yield* Effect.promise(() =>
        AutomationEventStore.record("schedule", [
          {
            connectorID: "schedule",
            externalID: `schedule:${task.id}:${todayKey}`,
            kind: "scheduled-task",
            title: task.prompt,
            receivedAt: Date.now(),
            metadata: { scheduleID: task.id },
          },
        ]),
      )
      yield* Effect.promise(() => AutomationEventStore.markScheduleRun(task.id, Date.now(), todayKey))
      if (task.kind === "once") yield* Effect.promise(() => AutomationEventStore.toggleSchedule(task.id, false))
      queued += inserted
    }
    return queued
  })

  const observe = Effect.fn("Automation.observe")(function* () {
    const clients = yield* mcp.clients()
    const connected = Object.keys(clients)
    let total = 0
    for (const spec of AutomationWatchSpecs.DEFAULT_WATCH_SPECS) {
      const server = spec.mcpServer ?? spec.connectorID
      if (!connected.includes(server)) continue
      total += yield* storeObservations(spec.connectorID, yield* observeOne(mcp, spec, server))
    }
    // A server connected at runtime with no written spec still gets a chance: derive one
    // from the first "what is new"-looking tool it exposes.
    for (const server of connected) {
      if (AutomationWatchSpecs.specFor(server)) continue
      const spec = AutomationWatchSpecs.deriveSpec(
        server,
        yield* Effect.promise(() => AutomationMcpObserve.listToolNames(clients[server]!)),
      )
      if (!spec) continue
      total += yield* storeObservations(server, yield* observeOne(mcp, spec, server))
    }
    const queued = yield* enqueueDueSchedules()
    if (queued > 0) total += queued
    if (total > 0) emitChange(total)
    return total
  })

  const flush = Effect.fn("Automation.flush")(function* () {
    if (observers.size === 0) return 0
    let delivered = 0
    for (let pass = 0; pass < 5; pass++) {
      const claimed = yield* Effect.promise(() => AutomationEventStore.claim(FLUSH_BATCH))
      if (claimed.length === 0) break
      for (const event of claimed) {
        let accepted = false
        let lastError = "no dispatcher accepted the event"
        for (const observer of observers.values()) {
          const result = yield* Effect.promise(async () => {
            try {
              await observer(event)
              return { ok: true as const }
            } catch (error) {
              return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
            }
          })
          if (result.ok) {
            accepted = true
            break
          }
          lastError = result.error
        }
        if (accepted) {
          yield* Effect.promise(() => AutomationEventStore.markDispatched(event.id))
          delivered++
        } else {
          yield* Effect.promise(() => AutomationEventStore.markFailed(event.id, lastError))
        }
      }
      if (claimed.length < FLUSH_BATCH) break
    }
    if (delivered > 0) emitChange(delivered)
    return delivered
  })

  /**
   * Drain the queue in the background so a webhook returns as soon as the event is durable.
   * An agent turn takes minutes; blocking the HTTP request on it would stall the caller and
   * delay the wake path, while the event is already safe on disk for the next drain.
   *
   * Runs on the global runtime rather than forking into the caller's scope: the webhook's
   * request scope closes the moment the response is written, and a drain bound to it would
   * be interrupted in the middle of an agent turn.
   */
  const drain = () => {
    if (draining) return
    draining = true
    Effect.runFork(flush().pipe(Effect.ensuring(Effect.sync(() => (draining = false)))))
  }

  const pending = Effect.fn("Automation.pending")((limit = 50) =>
    Effect.promise(() => AutomationEventStore.undelivered(limit)),
  )

  const ingest = Effect.fn("Automation.ingest")(function* (input: AutomationEventInput) {
    const inserted = yield* Effect.promise(() => AutomationEventStore.record(input.connectorID, [input]))
    if (inserted > 0) {
      emitChange(inserted)
      drain()
    }
    return inserted > 0
  })

  const status = Effect.fn("Automation.status")(function* () {
    const counts = yield* Effect.promise(() => AutomationEventStore.counts())
    const cursors = yield* Effect.promise(() => AutomationEventStore.cursors())
    const clients = yield* mcp.clients()
    return {
      ...counts,
      running: timer !== undefined,
      observers: [...observers.keys()],
      connectors: AutomationWatchSpecs.DEFAULT_WATCH_SPECS.map((spec) => {
        const server = spec.mcpServer ?? spec.connectorID
        return {
          connectorID: spec.connectorID,
          label: spec.label,
          connected: Boolean(clients[server]),
          lastObservedAt: cursors[`${spec.connectorID}:`]?.lastObservedAt,
        }
      }),
    }
  })

  const tick = () =>
    Effect.runFork(
      Effect.gen(function* () {
        yield* observe()
        yield* flush()
      }).pipe(Effect.provideService(Service, service)) as never,
    )

  // Let the prompt loop read the durable pending block without importing this graph.
  AutomationEventStore.setPendingReader(async (limit) => renderEvents(await AutomationEventStore.undelivered(limit)))

  const service: Interface & { observers: typeof observers } = {
    observe: () => observe(),
    flush: () => flush(),
    pending: (limit) => pending(limit),
    ingest: (input) => ingest(input),
    status: () => status(),
    start: Effect.fn("Automation.start")(function* () {
      if (timer) return
      const interval = intervalFromEnv()
      timer = setInterval(tick, interval)
      ;(timer as { unref?: () => void }).unref?.()
      // A backlog left by a previous run (the app was closed when the event arrived) is
      // drained as soon as the dispatcher is registered, not one poll interval later.
      drain()
      yield* Effect.logInfo("automation poller started", { interval })
    }),
    stop: Effect.fn("Automation.stop")(function* () {
      if (!timer) return
      clearInterval(timer)
      timer = undefined
    }),
    observers,
  }
  return service
})

export const node = makeGlobalNode({
  name: "automation",
  layer: Layer.effect(Service, make),
  deps: [MCP.node, Global.node],
})

/** Attach a dispatcher for the process lifetime. Returns an unregister function. */
export function registerDispatcher(
  service: Interface,
  name: string,
  dispatch: (event: AutomationEvent) => Promise<void>,
) {
  const observers = (service as Interface & { observers?: Map<string, (event: AutomationEvent) => Promise<void>> })
    .observers
  observers?.set(name, dispatch)
  return () => observers?.delete(name)
}

export { renderEvents } from "./render"

export { Schema }
