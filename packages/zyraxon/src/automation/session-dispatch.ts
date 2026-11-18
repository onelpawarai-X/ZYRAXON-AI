// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as AutomationSessionDispatch from "./session-dispatch"

import { Effect, Layer } from "effect"
import { makeGlobalNode } from "@zyraxon-ai/core/effect/app-node"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SessionID } from "@/session/schema"
import { Automation } from "./service"
import { AutomationEventStore } from "./event-store"
import { InstanceStore } from "@/project/instance-store"

/** Agent that automation wakes when it has to open a session of its own. */
export const DEFAULT_AGENT = process.env.ZYRAXON_AUTOMATION_AGENT ?? "build"
const SESSION_KEY = "automation.sessionID"

type Sessions = Session.Interface
type Prompts = SessionPrompt.Interface
type Store = InstanceStore.Interface

const WAKE_TEXT =
  "A connected app has new activity. Read the automation context above and act on it now."

/**
 * The dispatcher turns a stored connected-app event into a live agent turn.
 *
 * A message arriving must reach the AI without the person asking, so this steers the most
 * recently updated session when one exists, or opens a session and prompts it when nothing is
 * running. Both service instances are already resolved here, so their effects need no further
 * environment and can be run directly.
 */
export function makeDispatcher(sessions: Sessions, prompts: Prompts, store: Store) {
  // Deliberately not swallowed: a turn that never ran must leave the event undelivered so it
  // is retried (or finally surfaced as failed), rather than being marked delivered with no
  // agent ever seeing it.
  const wake = (sessionID: Parameters<Prompts["prompt"]>[0]["sessionID"], text: string) =>
    prompts
      .prompt({
        sessionID,
        agent: DEFAULT_AGENT,
        system: `[ZYRAXON AUTOMATION]\n${text}`,
        parts: [{ type: "text", text: WAKE_TEXT }],
      })
      .pipe(Effect.asVoid)

  // All automation activity goes to one long-lived session so it reads as a single inbox
  // thread instead of a new session per event. The id is persisted so a restart continues the
  // same thread rather than orphaning it.
  const ensureSession = Effect.gen(function* () {
    const stored = yield* Effect.promise(() => AutomationEventStore.getMeta(SESSION_KEY))
    if (stored) {
      const existing = yield* sessions
        .get(SessionID.make(stored))
        .pipe(Effect.catchCause(() => Effect.succeed(undefined)))
      if (existing) return existing.id
    }
    const created = yield* sessions.create({ title: "Automation — connected app activity", agent: DEFAULT_AGENT })
    yield* Effect.promise(() => AutomationEventStore.setMeta(SESSION_KEY, created.id))
    return created.id
  })

  return (event: { connectorID: string; title: string; body?: string; author?: string; url?: string; receivedAt: number }) => {
    const text = Automation.renderEvents([event as never])
    if (!text) return Promise.resolve()
    return Effect.runPromise(
      // Automation is a process-global observer, so it has no request to inherit an instance
      // from. Loading the server's own directory gives the session a real project id instead of
      // the empty default, which the session table's project foreign key rejects.
      store.provide({ directory: process.cwd() }, Effect.gen(function* () {
        const sessionID = yield* ensureSession
        yield* wake(sessionID, text)
      })).pipe(
        Effect.tapCause((cause) => Effect.logError("[automation] dispatch failed", cause)),
        // Both instances are already resolved, so provide them directly; this keeps the
        // dispatcher runnable from a background callback with no ambient runtime context.
        Effect.provideService(Session.Service, sessions),
        Effect.provideService(SessionPrompt.Service, prompts),
      ),
    )
  }
}

/** Live wiring node: register the dispatcher and start the poller for the process lifetime. */
export const node = makeGlobalNode({
  name: "automation-runtime",
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      const automation = yield* Automation.Service
      const sessions = yield* Session.Service
      const prompts = yield* SessionPrompt.Service
      const store = yield* InstanceStore.Service

      Automation.registerDispatcher(automation, "session", makeDispatcher(sessions, prompts, store))
      yield* automation.start()
      yield* Effect.addFinalizer(() => Effect.sync(() => automation.stop()))
    }),
  ),
  deps: [Automation.node, Session.node, SessionPrompt.node, InstanceStore.node],
})
