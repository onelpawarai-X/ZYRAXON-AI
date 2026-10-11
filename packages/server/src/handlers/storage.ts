// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Database } from "@zyraxon-ai/core/database/database"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

/**
 * Deleting rows frees pages into SQLite's freelist but never shrinks the file,
 * so every destructive path finishes by handing those pages back to the
 * filesystem. Doing it inside the same call means the caller sees the disk
 * actually shrink instead of a number that only changes after a restart.
 */
const fileBytes = Effect.sync(() => {
  try {
    const fs = require("node:fs") as typeof import("node:fs")
    return fs.statSync(Database.path()).size
  } catch {
    return 0
  }
})

const reclaim = Effect.fn("Storage.reclaim")(function* () {
  const { db } = yield* Database.Service
  // Fold the WAL back into the main file first, otherwise the -wal sidecar keeps
  // holding space the user just asked us to release.
  yield* db.run(sql.raw("PRAGMA wal_checkpoint(TRUNCATE)"))
  yield* db.run(sql.raw("PRAGMA incremental_vacuum"))
  yield* db.run(sql.raw("PRAGMA optimize"))
})

/**
 * Ids and timestamps reach the statement as validated literals rather than bind
 * parameters: the raw runner here takes a single string, and every value has
 * already been checked against the id shape or parsed as a number.
 */
const scalar = (statement: string, key: string) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const rows = yield* db.all<Record<string, unknown>>(sql.raw(statement))
    const value = rows[0]?.[key]
    return typeof value === "number" ? value : Number(value ?? 0)
  }).pipe(Effect.catch(() => Effect.succeed(0)))

const count = (table: string) => scalar(`SELECT COUNT(*) AS count FROM ${table}`, "count")

const snapshot = Effect.fn("Storage.snapshot")(function* () {
  return {
    sessions: yield* count("session"),
    messages: yield* count("message"),
    parts: yield* count("part"),
  }
})

const usage = Effect.fn("StorageHttpApi.usage")(function* () {
  yield* reclaim()

  // page_size and freelist_count come back keyed by their own pragma name.
  const pageSize = yield* scalar("PRAGMA page_size", "page_size")
  const freelist = yield* scalar("PRAGMA freelist_count", "freelist_count")

  const bytes = yield* fileBytes
  const tallies = yield* snapshot()

  return {
    path: Database.path(),
    bytes,
    pages: pageSize > 0 ? Math.round(bytes / pageSize) : 0,
    freelistPages: freelist,
    pageSize,
    ...tallies,
  }
})

const compact = Effect.fn("StorageHttpApi.compact")(function* () {
  const before = yield* fileBytes
  yield* reclaim()
  const tallies = yield* snapshot()
  return { ...tallies, bytesBefore: before, bytesAfter: yield* fileBytes }
})

const purge = Effect.fn("StorageHttpApi.purge")(function* (ctx) {
  const before = yield* fileBytes
  const { sessionIDs, olderThan } = ctx.payload
  const { db } = yield* Database.Service

  // Foreign keys are enforced by the database layer, so message and part rows go
  // with their session and nothing is left pointing at a missing parent.
  const safe = (sessionIDs ?? []).filter(
    (id: unknown): id is string => typeof id === "string" && /^ses_[0-9a-z]{16,}$/.test(id),
  )
  const at = olderThan ? Date.parse(olderThan) : Number.NaN

  const statement =
    safe.length > 0
      ? `DELETE FROM session WHERE id IN (${safe.map((id: string) => `'${id}'`).join(",")})`
      : Number.isNaN(at)
        ? undefined
        : `DELETE FROM session WHERE time_created < ${Math.trunc(at)}`

  if (!statement) {
    return {
      sessions: 0,
      messages: 0,
      parts: 0,
      bytesBefore: before,
      bytesAfter: before,
    }
  }

  yield* db.run(sql.raw(statement)).pipe(Effect.catch(() => Effect.void))

  yield* reclaim()
  const tallies = yield* snapshot()
  return { ...tallies, bytesBefore: before, bytesAfter: yield* fileBytes }
})

const emptyUsage = Effect.succeed({
  path: Database.path(),
  bytes: 0,
  pages: 0,
  freelistPages: 0,
  pageSize: 0,
  sessions: 0,
  messages: 0,
  parts: 0,
})

const emptyResult = (bytes: number) =>
  Effect.succeed({ sessions: 0, messages: 0, parts: 0, bytesBefore: bytes, bytesAfter: bytes })

export const StorageHandler = HttpApiBuilder.group(Api, "server.storage", (handlers) =>
  handlers
    // A read that cannot answer should still render the panel, so the database
    // error channel is folded away rather than surfacing as a failed request.
    .handle("storage.usage", () => response(usage()).pipe(Effect.catch(() => response(emptyUsage))))
    .handle("storage.compact", () => response(compact()).pipe(Effect.catch(() => response(emptyResult(0)))))
    .handle("storage.purge", (ctx) => response(purge(ctx)).pipe(Effect.catch(() => response(emptyResult(0))))),
)