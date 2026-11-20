// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as SessionPortStore from "./port"

import { asc, eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import {
  remapIds,
  type Json,
  type StoredMessage,
  type StoredPart,
  type StoredSession,
} from "@zyraxon-ai/schema/session-port"
import type { Database } from "../database/database"
import { MessageTable, PartTable, SessionTable } from "./sql"
import { SessionSchema } from "./schema"
import { MessageID, PartID, SessionV1 } from "../v1/session"

export class PortNotFoundError extends Schema.TaggedErrorClass<PortNotFoundError>()("SessionPort.NotFoundError", {
  sessionID: Schema.String,
}) {}

type DatabaseService = Database.Interface["db"]

/**
 * Read one session and every durable message it owns. The rows go out exactly as
 * they sit in storage, so the export is a faithful picture and not a projection
 * that could drop fields the database keeps.
 *
 * The message and part tables are the store the app renders: the panel's timeline
 * and the model's history both load from them, so a bundle built here is a bundle
 * that can actually be shown again. Parts travel with their message, because a
 * message without its parts is a heading with nothing under it.
 */
export const readSession = Effect.fn("SessionPort.readSession")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
) {
  const session = yield* db
    .select()
    .from(SessionTable)
    .where(eq(SessionTable.id, sessionID))
    .get()
    .pipe(Effect.orDie)
  if (!session) return yield* new PortNotFoundError({ sessionID })

  const messageRows = yield* db
    .select()
    .from(MessageTable)
    .where(eq(MessageTable.session_id, sessionID))
    .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
    .all()
    .pipe(Effect.orDie)

  const partRows = yield* db
    .select()
    .from(PartTable)
    .where(eq(PartTable.session_id, sessionID))
    .orderBy(asc(PartTable.message_id), asc(PartTable.id))
    .all()
    .pipe(Effect.orDie)

  const partsByMessage = new Map<string, StoredPart[]>()
  for (const row of partRows) {
    const part: StoredPart = {
      id: row.id,
      time_created: row.time_created,
      data: row.data as unknown as Json,
    }
    const list = partsByMessage.get(row.message_id)
    if (list) list.push(part)
    else partsByMessage.set(row.message_id, [part])
  }

  const stored: StoredSession = {
    id: session.id,
    project_id: session.project_id,
    parent_id: session.parent_id ?? null,
    title: session.title,
    agent: session.agent ?? null,
    model: session.model ?? null,
    cost: session.cost,
    tokens_input: session.tokens_input,
    tokens_output: session.tokens_output,
    tokens_reasoning: session.tokens_reasoning,
    tokens_cache_read: session.tokens_cache_read,
    tokens_cache_write: session.tokens_cache_write,
    time_created: session.time_created,
    time_updated: session.time_updated,
    time_archived: session.time_archived ?? null,
  }

  return {
    session: stored,
    messages: messageRows.map((row, index): StoredMessage => {
      const body = row.data as { role?: string }
      return {
        id: row.id,
        type: body.role ?? "user",
        seq: index + 1,
        time_created: row.time_created,
        data: row.data as unknown as Json,
        parts: partsByMessage.get(row.id) ?? [],
      }
    }),
  }
})

/**
 * Give an imported session the title it carried, since create always names a new
 * session after the current time.
 */
export const rename = Effect.fn("SessionPort.rename")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  title: string,
) {
  yield* db
    .update(SessionTable)
    .set({ title })
    .where(eq(SessionTable.id, sessionID))
    .run()
    .pipe(Effect.orDie)
})

/**
 * Append imported messages onto a session that already exists. Every row travels
 * through the same codec the projector uses, so a hand-edited or older file cannot
 * put bytes into storage that the reader would later refuse to decode; a row that
 * does not decode is counted as skipped instead of failing the whole import.
 *
 * Message and part ids are always minted fresh, and every id embedded in a message
 * or part body is repointed through the same map. That is what lets an imported
 * conversation render as one continuous chat in its new home, with no reference
 * left dangling at a session or message that only exists in the file.
 */
export const appendMessages = Effect.fn("SessionPort.appendMessages")(function* (
  db: DatabaseService,
  input: {
    sessionID: SessionSchema.ID
    sourceID: string
    messages: ReadonlyArray<StoredMessage>
    now: number
  },
) {
  const decodeMessage = Schema.decodeUnknownEffect(SessionV1.Info)
  const decodePart = Schema.decodeUnknownEffect(SessionV1.Part)

  const ordered = [...input.messages].sort((a, b) => a.seq - b.seq)

  // Every row gets a fresh id and the session moves to its new home. Message ids,
  // part ids and the source session id all go into one map, so any reference a body
  // carries follows its row instead of pointing at something that only exists in
  // the file.
  const idMap: Record<string, string> = { [input.sourceID]: input.sessionID }
  const fresh = ordered.map((message) => {
    const id = MessageID.ascending()
    idMap[message.id] = id
    const parts = message.parts.map((part) => {
      const partID = PartID.ascending()
      idMap[part.id] = partID
      return { part, id: partID }
    })
    return { message, id, parts }
  })

  let restored = 0
  let skipped = 0

  for (const { message, id, parts } of fresh) {
    const body = remapIds(message.data, idMap)
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      skipped += 1
      continue
    }
    // The stored body is the message without its identity columns, exactly as the
    // projector writes it; the reader puts id and session id back before decoding.
    const data = body as Record<string, unknown>
    const decoded = yield* decodeMessage({ ...data, id, sessionID: input.sessionID }).pipe(
      Effect.catch(() => Effect.succeed(undefined)),
    )
    if (!decoded) {
      skipped += 1
      continue
    }
    const { id: _id, sessionID: _sessionID, ...storedData } = decoded as Record<string, unknown>
    yield* db
      .insert(MessageTable)
      .values({
        id,
        session_id: input.sessionID,
        time_created: message.time_created || input.now,
        data: storedData as never,
      })
      .run()
      .pipe(Effect.orDie)

    for (const { part, id: partID } of parts) {
      const partBody = remapIds(part.data, idMap)
      if (partBody === null || typeof partBody !== "object" || Array.isArray(partBody)) continue
      const partData = partBody as Record<string, unknown>
      const decodedPart = yield* decodePart({
        ...partData,
        id: partID,
        sessionID: input.sessionID,
        messageID: id,
      }).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!decodedPart) continue
      const {
        id: _partID,
        sessionID: _partSessionID,
        messageID: _messageID,
        ...storedPart
      } = decodedPart as Record<string, unknown>
      yield* db
        .insert(PartTable)
        .values({
          id: partID,
          message_id: id,
          session_id: input.sessionID,
          time_created: part.time_created || message.time_created || input.now,
          data: storedPart as never,
        })
        .run()
        .pipe(Effect.orDie)
    }

    restored += 1
  }

  return { restored, skipped }
})
