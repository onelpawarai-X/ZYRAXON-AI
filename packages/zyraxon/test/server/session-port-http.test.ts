// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Session export → import must survive a real HTTP round trip.
 *
 * The panel promises that a conversation leaves one install as a file and arrives
 * in another with its history intact. Each piece is covered on its own — the bundle
 * codec, the id remap, the store — but nothing yet proves the whole path over the
 * wire: `GET /api/session/:id/export` returning a bundle, that bundle posted back
 * to `POST /api/session/import`, and the words readable in the new session
 * afterwards.
 *
 * This drives the real route tree, the real database and the real store through
 * `HttpRouter.toWebHandler`, the same app the server serves. The assertion that
 * matters is the last one: the imported session's history contains the text that
 * was exported, so a reader of the new session sees the same words.
 *
 * Session routes are location-scoped, so each request carries
 * `x-zyraxon-directory` for a temp project, the way the exercise harness does. The
 * database is the in-memory one the test preload installs.
 */
import { describe, expect, test } from "bun:test"
import { Effect, Layer, Scope } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { Database } from "@zyraxon-ai/core/database/database"
import { ProjectTable } from "@zyraxon-ai/core/project/sql"
import { MessageV2 } from "@/session/message-v2"
import { SessionPortStore } from "@zyraxon-ai/core/session/port"
import { ProjectSchema } from "@zyraxon-ai/core/project/schema"
import { SessionSchema } from "@zyraxon-ai/core/session/schema"
import { SessionTable } from "@zyraxon-ai/core/session/sql"
import { parseBundle, type StoredMessage } from "@zyraxon-ai/schema/session-port"
import { AbsolutePath } from "@zyraxon-ai/core/schema"
import { runtime } from "./httpapi-exercise/runtime"

const seedMessage: StoredMessage = {
  id: "msg_seed",
  type: "user",
  seq: 1,
  time_created: 1,
  data: {
    id: "msg_seed",
    sessionID: "ses_seed_source",
    role: "user",
    agent: "build",
    model: { providerID: "openai", modelID: "gpt-4o" },
    summary: { diffs: [] },
    time: { created: 1 },
  },
  parts: [
    {
      id: "prt_seed",
      time_created: 1,
      data: { type: "text", text: "Remember this sentence" },
    },
  ],
}

/**
 * Run `use` with the real route tree served by an in-process web handler and the
 * app services behind it. The app layer is built through the shared memoMap so the
 * handler's services are the same instances the test reaches, and the built context
 * is provided to `use` so `Database.Service` resolves.
 */
function withServer<A, E, R>(use: (input: { call: Call; db: DatabaseService }) => Effect.Effect<A, E, R>) {
  return Effect.scoped(
    Effect.gen(function* () {
      const modules = yield* Effect.promise(() => runtime())
      const scope = yield* Scope.Scope
      const ctx = yield* Layer.buildWithMemoMap(modules.AppLayer, modules.memoMap, scope)
      const web = HttpRouter.toWebHandler(modules.HttpApiApp.routes, {
        disableLogger: true,
        memoMap: modules.memoMap,
      })
      yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()).pipe(Effect.ignore))

      const call: Call = (directory, path, init) =>
        Effect.promise(() => {
          const headers = new Headers(init?.headers)
          headers.set("x-zyraxon-directory", directory)
          return web.handler(
            new Request(new URL(path, "http://localhost"), { ...init, headers }),
            modules.HttpApiApp.context,
          )
        })

      return yield* Effect.gen(function* () {
        const database = yield* Database.Service
        return yield* use({ call, db: database.db })
      }).pipe(Effect.provide(ctx))
    }),
  )
}

type Call = (directory: string, path: string, init?: RequestInit) => Effect.Effect<Response>
type DatabaseService = Database.Interface["db"]

describe("session port over HTTP", () => {
  test("an exported conversation is readable in the session it was imported into", async () => {
    const tmp = await (await runtime()).tmpdir({ git: true })
    try {
      await Effect.runPromise(
        withServer(({ call, db }) =>
          Effect.gen(function* () {
            const directory = AbsolutePath.make(tmp.path)
            const source = SessionSchema.ID.create()

            yield* db
              .insert(ProjectTable)
              .values({
                id: ProjectSchema.ID.make("prj_port_http"),
                worktree: directory,
                sandboxes: [directory],
                name: "port-http",
                time_created: 1,
                time_updated: 1,
              })
              .onConflictDoNothing()
              .run()
              .pipe(Effect.orDie)
            yield* db
              .insert(SessionTable)
              .values({
                id: source,
                project_id: ProjectSchema.ID.make("prj_port_http"),
                slug: "port-http",
                directory,
                title: "Exported conversation",
                version: "1",
                time_created: 1,
                time_updated: 1,
              })
              .run()
              .pipe(Effect.orDie)

            // Seed through the store the export reads, so the bundle has content.
            const seeded = yield* SessionPortStore.appendMessages(db, {
              sessionID: source,
              sourceID: "ses_never",
              messages: [seedMessage],
              now: 1,
            })
            expect(seeded).toEqual({ restored: 1, skipped: 0 })

            // Export over the wire.
            const exported = yield* call(directory, `/api/session/${source}/export`)
            expect(exported.status).toBe(200)
            const parsed = parseBundle(yield* Effect.promise(() => exported.text()))
            if (!parsed.ok) throw new Error(`server export was refused: ${parsed.reason}`)
            expect(parsed.bundle.session.title).toBe("Exported conversation")
            expect(parsed.bundle.messages).toHaveLength(1)

            // Import that same bundle back in.
            const imported = yield* call(directory, "/api/session/import", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ bundle: parsed.bundle, location: { directory } }),
            })
            expect(imported.status).toBe(200)
            const outcome = (yield* Effect.promise(() => imported.json())) as {
              id: string
              restored: number
              skipped: number
            }
            expect(outcome.restored).toBe(1)
            expect(outcome.skipped).toBe(0)
            expect(outcome.id).not.toBe(source)

            // The words are readable in the new session through the same reader the
            // app's timeline uses, which is the promise.
            const loaded = yield* MessageV2.page({ sessionID: SessionSchema.ID.make(outcome.id), limit: 50 })
            expect(loaded.items).toHaveLength(1)
            expect(loaded.items[0]?.info.role).toBe("user")
            expect(loaded.items[0]?.parts[0]).toMatchObject({ type: "text", text: "Remember this sentence" })
          }),
        ),
      )
    } finally {
      await tmp[Symbol.asyncDispose]()
    }
  })

  test("a well-formed file from another tool is refused with a 400, not imported empty", async () => {
    const tmp = await (await runtime()).tmpdir({ git: true })
    try {
      await Effect.runPromise(
        withServer(({ call, db }) =>
          Effect.gen(function* () {
            const directory = AbsolutePath.make(tmp.path)
            // Every field is present and correctly typed; only the document's
            // identity is foreign. Accepting this would create a session titled by
            // another tool's file, so the boundary must refuse it.
            const response = yield* call(directory, "/api/session/import", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                bundle: {
                  kind: "some-other-tool",
                  version: 1,
                  exportedAt: 1,
                  session: {
                    id: "ses_foreign",
                    project_id: "prj_foreign",
                    title: "Foreign",
                    cost: 0,
                    tokens_input: 0,
                    tokens_output: 0,
                    tokens_reasoning: 0,
                    tokens_cache_read: 0,
                    tokens_cache_write: 0,
                    time_created: 1,
                    time_updated: 1,
                  },
                  messages: [],
                },
                location: { directory },
              }),
            })
            expect(response.status).toBe(400)

            // Nothing was created: the refusal happened before any write.
            const sessions = yield* db.select().from(SessionTable).all().pipe(Effect.orDie)
            expect(sessions.some((row) => row.title === "Foreign")).toBe(false)
          }),
        ),
      )
    } finally {
      await tmp[Symbol.asyncDispose]()
    }
  })

  test("a blank location imports into the server's own working directory instead of failing", async () => {
    const tmp = await (await runtime()).tmpdir({ git: true })
    try {
      await Effect.runPromise(
        withServer(({ call }) =>
          Effect.gen(function* () {
            const directory = AbsolutePath.make(tmp.path)

            // The settings panel can post before the project list has synced, which
            // sends an empty directory. That must resolve to a real path on the
            // server rather than producing an invalid-absolute-path 500.
            const bundle = {
              kind: "zyraxon-session-port",
              version: 1,
              exportedAt: 1,
              session: {
                id: "ses_blank",
                project_id: "prj_blank",
                title: "Blank location",
                cost: 0,
                tokens_input: 0,
                tokens_output: 0,
                tokens_reasoning: 0,
                tokens_cache_read: 0,
                tokens_cache_write: 0,
                time_created: 1,
                time_updated: 1,
              },
              messages: [],
            }
            const imported = yield* call(directory, "/api/session/import", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ bundle, location: { directory: "" } }),
            })
            expect(imported.status).toBe(200)
            const outcome = (yield* Effect.promise(() => imported.json())) as { id: string }
            expect(outcome.id).toBeTruthy()
          }),
        ),
      )
    } finally {
      await tmp[Symbol.asyncDispose]()
    }
  })
})
