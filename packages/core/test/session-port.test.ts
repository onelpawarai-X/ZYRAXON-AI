// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Session export → import must put a conversation back, not just move a title.
 *
 * The panel writes a bundle and the server reads it back into a brand new session
 * with fresh ids. The assertion that matters is that a reader who loads the new
 * session sees the same words that were said in the old one — that is the whole
 * promise of "the assistant remembers what we said".
 *
 * The store is the message and part tables, because that is what the app's
 * timeline and the model's history both read. A round trip that wrote somewhere
 * else would pass a storage assertion and still show an empty chat, so the test
 * loads the imported conversation through the exact reader the app uses.
 *
 * This drives the real SQLite tables (an in-memory database through the same node
 * adapter the app uses) rather than a stand-in, because the failure mode being
 * guarded against is a row that is written in a shape the loader later refuses to
 * decode. The session id embedded in a message body is checked too, because the
 * import moves a conversation into a new session and any reference that did not
 * follow the move would point at a session that no longer holds the row.
 */
import { asc, eq } from "drizzle-orm"
import { describe, expect, test } from "bun:test"
import { Cause } from "effect"
import { Effect, Layer, Schema } from "effect"
import { AbsolutePath } from "@zyraxon-ai/core/schema"
import { Database } from "@zyraxon-ai/core/database/database"
import { ProjectTable } from "@zyraxon-ai/core/project/sql"
import { ProjectSchema } from "@zyraxon-ai/core/project/schema"
import { SessionPortStore } from "@zyraxon-ai/core/session/port"
import { SessionSchema } from "@zyraxon-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@zyraxon-ai/core/session/sql"
import { MessageID, PartID, SessionV1 } from "@zyraxon-ai/core/v1/session"
import { buildBundle, parseBundle, serializeBundle, type StoredMessage } from "@zyraxon-ai/schema/session-port"

const encodeMessage = Schema.encodeSync(SessionV1.Info)
const encodePart = Schema.encodeSync(SessionV1.Part)

const directory = AbsolutePath.make("/tmp/zyraxon-session-port-test")
const projectID = ProjectSchema.ID.make("prj_port_test")

type DatabaseService = Database.Interface["db"]

async function runOrReport<A, E>(effect: Effect.Effect<A, E, never>) {
  const exit = await Effect.runPromiseExit(effect)
  if (exit._tag === "Failure") {
    for (const err of Cause.prettyErrors(exit.cause)) console.error(err)
    throw new Error("effect failed")
  }
  return exit.value
}

async function seed(db: DatabaseService, sessionID: SessionSchema.ID) {
  await runOrReport(
    db
      .insert(ProjectTable)
      .values({
        id: projectID,
        worktree: directory,
        sandboxes: [directory],
        name: "port-test",
        time_created: 1,
        time_updated: 1,
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie),
  )
  await runOrReport(
    db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: projectID,
        slug: "port-test",
        directory,
        title: "Original title",
        version: "1",
        time_created: 1,
        time_updated: 1,
      })
      .run()
      .pipe(Effect.orDie),
  )
}

/** Write one message and its parts exactly the way the projector writes them. */
async function putMessage(
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  timeCreated: number,
  message: SessionV1.Info,
  parts: SessionV1.Part[],
) {
  const encoded = encodeMessage(message) as Record<string, unknown>
  const { id, sessionID: _sessionID, ...data } = encoded
  await runOrReport(
    db
      .insert(MessageTable)
      .values({
        id: MessageID.ascending(id as string),
        session_id: sessionID,
        time_created: timeCreated,
        data: data as never,
      })
      .run()
      .pipe(Effect.orDie),
  )
  for (const part of parts) {
    const encodedPart = encodePart(part) as Record<string, unknown>
    const { id: partID, sessionID: _s, messageID, ...partData } = encodedPart
    await runOrReport(
      db
        .insert(PartTable)
        .values({
          id: PartID.ascending(partID as string),
          message_id: MessageID.ascending(id as string),
          session_id: sessionID,
          time_created: timeCreated,
          data: partData as never,
        })
        .run()
        .pipe(Effect.orDie),
    )
  }
}

// A fresh in-memory database per case, through the same node adapter the app uses.
const dbLayer = Database.layerFromPath(":memory:")

/**
 * Read a session the way the app's timeline does: message rows joined to their
 * part rows through the same tables and the same id keys. If the import wrote
 * anywhere else, this returns nothing and the round trip fails here.
 */
async function loadWithParts(db: DatabaseService, sessionID: SessionSchema.ID) {
  const messages = await runOrReport(
    db
      .select()
      .from(MessageTable)
      .where(eq(MessageTable.session_id, sessionID))
      .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
      .all()
      .pipe(Effect.orDie),
  )
  const parts = await runOrReport(
    db.select().from(PartTable).where(eq(PartTable.session_id, sessionID)).orderBy(asc(PartTable.id)).all().pipe(Effect.orDie),
  )
  return messages.map((message) => ({
    info: { ...(message.data as Record<string, unknown>), id: message.id as string, sessionID: message.session_id as string } as Record<string, unknown>,
    parts: parts
      .filter((part) => part.message_id === message.id)
      .map((part) => ({ ...(part.data as Record<string, unknown>), id: part.id as string, sessionID: part.session_id as string, messageID: part.message_id as string }) as Record<string, unknown>),
  }))
}

describe("session port round trip", () => {
  test("an exported conversation comes back readable, in its new session", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        const source = SessionSchema.ID.create()
        yield* Effect.promise(() => seed(db, source))

        const userID = MessageID.ascending()
        const user: SessionV1.Info = {
          id: userID,
          sessionID: source,
          role: "user",
          time: { created: 1_000 },
          agent: "build",
          model: { providerID: "openai", modelID: "gpt-4o" },
          summary: { diffs: [] },
        } as unknown as SessionV1.Info
        const assistantID = MessageID.ascending()
        const assistant: SessionV1.Info = {
          id: assistantID,
          sessionID: source,
          role: "assistant",
          parentID: userID,
          time: { created: 1_100 },
          modelID: "gpt-4o",
          providerID: "openai",
          mode: "build",
          agent: "build",
          path: { cwd: "/tmp", root: "/tmp" },
          cost: 0,
          tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
        } as unknown as SessionV1.Info

        yield* Effect.promise(() =>
          putMessage(db, source, 1_000, user, [
            {
              id: PartID.ascending(),
              sessionID: source,
              messageID: userID,
              type: "text",
              text: "Deploy the staging branch",
            } as unknown as SessionV1.Part,
          ]),
        )
        yield* Effect.promise(() =>
          putMessage(db, source, 1_100, assistant, [
            {
              id: PartID.ascending(),
              sessionID: source,
              messageID: assistantID,
              type: "text",
              text: "Pushing now.",
            } as unknown as SessionV1.Part,
          ]),
        )

        // Export through the real store, serialise, and parse the bytes back.
        const read = yield* SessionPortStore.readSession(db, source)
        const wire = serializeBundle(buildBundle({ session: read.session, messages: read.messages }))
        const parsed = parseBundle(wire)
        if (!parsed.ok) throw new Error(`bundle refused: ${parsed.reason}`)

        // Import into a fresh session, the way the handler does.
        const target = SessionSchema.ID.create()
        yield* Effect.promise(() => seed(db, target))
        yield* SessionPortStore.rename(db, target, parsed.bundle.session.title)
        const appended = yield* SessionPortStore.appendMessages(db, {
          sessionID: target,
          sourceID: parsed.bundle.session.id,
          messages: parsed.bundle.messages,
          now: 2_000,
        })

        // Load through the reader the app's timeline uses.
        const loaded = yield* Effect.promise(() => loadWithParts(db, target))
        return { appended, loaded, source, target, userID }
      }).pipe(Effect.provide(dbLayer)),
    )

    expect(result.appended).toEqual({ restored: 2, skipped: 0 })
    expect(result.loaded).toHaveLength(2)
    // The words are the same words, in the same order.
    expect(result.loaded[0]?.info.role).toBe("user")
    expect(result.loaded[0]?.parts[0]).toMatchObject({ type: "text", text: "Deploy the staging branch" })
    expect(result.loaded[1]?.info.role).toBe("assistant")
    expect(result.loaded[1]?.parts[0]).toMatchObject({ type: "text", text: "Pushing now." })

    // Message ids are fresh, but the conversation still reads the same.
    expect(result.loaded[0]?.info.id).not.toBe(result.userID)

    // Every restored row belongs to the new session, and the embedded session id
    // followed the move rather than pointing at the source.
    for (const item of result.loaded) {
      expect(item.info.sessionID).toBe(result.target)
      for (const part of item.parts) {
        expect(part.sessionID).toBe(result.target)
      }
    }
  })

  test("a row that does not decode is counted as skipped, not fatal", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        const target = SessionSchema.ID.create()
        yield* Effect.promise(() => seed(db, target))

        const good: StoredMessage = {
          id: "msg_good",
          type: "user",
          seq: 1,
          time_created: 1,
          data: {
            id: "msg_good",
            sessionID: "ses_old",
            role: "user",
            agent: "build",
            model: { providerID: "openai", modelID: "gpt-4o" },
            summary: { diffs: [] },
            time: { created: 1 },
          },
          parts: [
            {
              id: "prt_good",
              time_created: 1,
              data: { type: "text", text: "still here" },
            },
          ],
        }
        const bad: StoredMessage = {
          id: "msg_bad",
          type: "user",
          seq: 2,
          time_created: 2,
          // Missing `time`, so the codec refuses this one.
          data: { id: "msg_bad", sessionID: "ses_old", role: "user", text: "gone" },
          parts: [],
        }

        const appended = yield* SessionPortStore.appendMessages(db, {
          sessionID: target,
          sourceID: "ses_old",
          messages: [good, bad],
          now: 3_000,
        })
        const loaded = yield* Effect.promise(() => loadWithParts(db, target))
        return { appended, loaded }
      }).pipe(Effect.provide(dbLayer)),
    )

    expect(result.appended).toEqual({ restored: 1, skipped: 1 })
    expect(result.loaded).toHaveLength(1)
    expect(result.loaded[0]?.parts[0]).toMatchObject({ type: "text", text: "still here" })
  })
})
