// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as AutomationRoutes from "./routes"

import { Effect, Schema } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpServerResponse } from "effect/unstable/http"
import { Automation } from "./service"
import { AutomationEventStore } from "./event-store"

const EventPayload = Schema.Struct({
  connectorID: Schema.String,
  externalID: Schema.String,
  kind: Schema.String,
  title: Schema.String,
  body: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
  receivedAt: Schema.optional(Schema.Finite),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  accountID: Schema.optional(Schema.String),
})

const SchedulePayload = Schema.Struct({
  id: Schema.optional(Schema.String),
  prompt: Schema.String,
  time: Schema.String,
  days: Schema.Array(Schema.String),
  kind: Schema.optional(Schema.Literals(["daily", "once"])),
  enabled: Schema.optional(Schema.Boolean),
})

/**
 * Inbound event surface. A connector, a webhook relay, or a test harness posts here and the
 * event is stored, deduplicated, and dispatched to the running agent exactly like a polled
 * event. This is the push half of the automation system.
 */
export const routes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const automation = yield* Automation.Service

    yield* router.add("POST", "/automation/event", (request) =>
      Effect.gen(function* () {
        const body = yield* Effect.orDie(request.text)
        const payload = yield* Schema.decodeUnknownEffect(EventPayload)(JSON.parse(body)).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        )
        if (!payload) {
          return yield* HttpServerResponse.json({ error: "invalid event payload" }, { status: 400 })
        }
        const accepted = yield* automation.ingest({
          connectorID: payload.connectorID,
          accountID: payload.accountID,
          externalID: payload.externalID,
          kind: payload.kind,
          title: payload.title,
          body: payload.body,
          url: payload.url,
          author: payload.author,
          receivedAt: payload.receivedAt ?? Date.now(),
          metadata: payload.metadata,
        })
        return yield* HttpServerResponse.json({ accepted, duplicate: !accepted })
      }),
    )

    yield* router.add("POST", "/automation/observe", () =>
      Effect.gen(function* () {
        const recorded = yield* automation.observe()
        return yield* HttpServerResponse.json({ recorded })
      }),
    )

    yield* router.add("GET", "/automation/status", () =>
      Effect.gen(function* () {
        const status = yield* automation.status()
        return yield* HttpServerResponse.json(status as unknown as Record<string, unknown>)
      }),
    )

    // Schedules are the "run this every day even when the app was closed" surface. They live
    // in the same durable store the poller drains, so a task fires the moment the backend is up.
    yield* router.add("GET", "/automation/schedules", () =>
      Effect.gen(function* () {
        const list = yield* Effect.promise(() => AutomationEventStore.schedules())
        return yield* HttpServerResponse.json(list as unknown as Record<string, unknown>[])
      }),
    )

    yield* router.add("POST", "/automation/schedules", (request) =>
      Effect.gen(function* () {
        const body = yield* Effect.orDie(request.text)
        const input = yield* Schema.decodeUnknownEffect(SchedulePayload)(JSON.parse(body)).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        )
        if (!input) return yield* HttpServerResponse.json({ error: "invalid schedule" }, { status: 400 })
        const schedule = yield* Effect.promise(() =>
          AutomationEventStore.putSchedule({
            id: input.id,
            prompt: input.prompt,
            time: input.time,
            days: input.days,
            kind: input.kind,
            enabled: input.enabled,
          }),
        )
        return yield* HttpServerResponse.json(schedule as unknown as Record<string, unknown>)
      }),
    )

    yield* router.add("POST", "/automation/schedules/remove", (request) =>
      Effect.gen(function* () {
        const body = yield* Effect.orDie(request.text)
        const parsed = yield* Schema.decodeUnknownEffect(Schema.Struct({ id: Schema.String }))(JSON.parse(body)).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        )
        if (!parsed) return yield* HttpServerResponse.json({ error: "invalid body" }, { status: 400 })
        const removed = yield* Effect.promise(() => AutomationEventStore.removeSchedule(parsed.id))
        return yield* HttpServerResponse.json({ removed })
      }),
    )

    yield* router.add("POST", "/automation/schedules/toggle", (request) =>
      Effect.gen(function* () {
        const body = yield* Effect.orDie(request.text)
        const parsed = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ id: Schema.String, enabled: Schema.Boolean }),
        )(JSON.parse(body)).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (!parsed) return yield* HttpServerResponse.json({ error: "invalid body" }, { status: 400 })
        yield* Effect.promise(() => AutomationEventStore.toggleSchedule(parsed.id, parsed.enabled))
        return yield* HttpServerResponse.json({ ok: true })
      }),
    )
  }),
)
