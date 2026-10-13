// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as AutomationEventStore from "./event-store"

import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@zyraxon-ai/core/global"
import type { AutomationEvent, AutomationEventInput } from "./types"

type DB = import("bun:sqlite").Database

const STORE_DIR = path.join(Global.Path.data, "automation")
const STORE_DB = path.join(STORE_DIR, "events.db")
const MAX_ATTEMPTS = 8
const RETRY_BASE_MS = 5_000
const RETRY_CAP_MS = 10 * 60_000

let db: DB | null = null
let dbInitPromise: Promise<void> | null = null

/**
 * One durable store for every connected-app event. It survives an app restart and a
 * process crash because it is a file, not memory: the whole point is that an event that
 * arrived while the agent was closed is still there when it comes back.
 */
async function getDb(): Promise<DB> {
  if (db) return db
  if (!dbInitPromise) dbInitPromise = initDb()
  await dbInitPromise
  return db!
}

async function initDb(): Promise<void> {
  try {
    await fs.access(STORE_DIR)
  } catch {
    await fs.mkdir(STORE_DIR, { recursive: true })
  }
  const { Database } = await import("bun:sqlite")
  db = new Database(STORE_DB)
  db.run("PRAGMA journal_mode=WAL")
  db.run("PRAGMA synchronous=NORMAL")
  db.run("PRAGMA busy_timeout=5000")
  db.run(`CREATE TABLE IF NOT EXISTS automation_event (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL,
    account_id TEXT,
    external_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    url TEXT,
    author TEXT,
    received_at INTEGER NOT NULL,
    metadata TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(connector_id, external_id)
  )`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_event_status ON automation_event(status, next_attempt_at)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_event_received ON automation_event(received_at)`)
  db.run(`CREATE TABLE IF NOT EXISTS automation_cursor (
    connector_id TEXT NOT NULL,
    account_id TEXT NOT NULL DEFAULT '',
    last_observed_at INTEGER NOT NULL,
    events_seen INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (connector_id, account_id)
  )`)
  // Scheduled work shares the same durable queue as connector events: a daily or one-off
  // task is just another event whose source is the scheduler. That is what lets a task run
  // when the desktop app is closed — the store is on disk and the poller reads it.
  db.run(`CREATE TABLE IF NOT EXISTS automation_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS automation_schedule (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    time TEXT NOT NULL,
    days TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'daily',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run INTEGER,
    last_run_key TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
}

export interface Schedule {
  readonly id: string
  readonly prompt: string
  readonly time: string
  readonly days: ReadonlyArray<string>
  readonly kind: "daily" | "once"
  readonly enabled: boolean
  readonly lastRun?: number
  readonly lastRunKey?: string
  readonly createdAt: number
  readonly updatedAt: number
}

function rowToSchedule(row: Record<string, unknown>): Schedule {
  return {
    id: String(row.id),
    prompt: String(row.prompt),
    time: String(row.time),
    days: JSON.parse(String(row.days)) as string[],
    kind: (row.kind as "daily" | "once") ?? "daily",
    enabled: Number(row.enabled) === 1,
    lastRun: row.last_run === null || row.last_run === undefined ? undefined : Number(row.last_run),
    lastRunKey: row.last_run_key ? String(row.last_run_key) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export async function schedules(): Promise<Schedule[]> {
  const d = await getDb()
  const rows = d.query(`SELECT * FROM automation_schedule ORDER BY time ASC`).all() as Record<string, unknown>[]
  return rows.map(rowToSchedule)
}

export async function putSchedule(input: {
  id?: string
  prompt: string
  time: string
  days: ReadonlyArray<string>
  kind?: "daily" | "once"
  enabled?: boolean
}): Promise<Schedule> {
  const d = await getDb()
  const now = Date.now()
  const id = input.id ?? `sch_${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`
  d.query(
    `INSERT INTO automation_schedule (id, prompt, time, days, kind, enabled, created_at, updated_at)
     VALUES ($id, $prompt, $time, $days, $kind, $enabled, $now, $now)
     ON CONFLICT(id) DO UPDATE SET prompt = $prompt, time = $time, days = $days, kind = $kind,
       enabled = $enabled, updated_at = $now`,
  ).run({
    $id: id,
    $prompt: input.prompt,
    $time: input.time,
    $days: JSON.stringify(input.days),
    $kind: input.kind ?? "daily",
    $enabled: input.enabled === false ? 0 : 1,
    $now: now,
  })
  const row = d.query(`SELECT * FROM automation_schedule WHERE id = $id`).all({ $id: id })[0] as Record<string, unknown>
  return rowToSchedule(row)
}

export async function removeSchedule(id: string): Promise<boolean> {
  const d = await getDb()
  const result = d.query(`DELETE FROM automation_schedule WHERE id = $id`).run({ $id: id })
  return result.changes > 0
}

export async function toggleSchedule(id: string, enabled: boolean): Promise<void> {
  const d = await getDb()
  d.query(`UPDATE automation_schedule SET enabled = $enabled, updated_at = $now WHERE id = $id`).run({
    $id: id,
    $enabled: enabled ? 1 : 0,
    $now: Date.now(),
  })
}

export async function markScheduleRun(id: string, at: number, key: string): Promise<void> {
  const d = await getDb()
  d.query(`UPDATE automation_schedule SET last_run = $at, last_run_key = $key, updated_at = $at WHERE id = $id`).run({
    $id: id,
    $at: at,
    $key: key,
  })
}

function newId(): string {
  return `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Record observations in bulk. Dedupe is enforced by the UNIQUE(connector_id, external_id)
 * constraint with INSERT OR IGNORE, so a poll that re-reads the same message never creates
 * a second event, even across restarts.
 *
 * @returns the number of rows actually inserted (0 means every item was a duplicate)
 */
export async function record(connectorID: string, inputs: ReadonlyArray<AutomationEventInput>): Promise<number> {
  if (inputs.length === 0) return 0
  const d = await getDb()
  const now = Date.now()
  let inserted = 0
  const stmt = d.query(
    `INSERT OR IGNORE INTO automation_event
      (id, connector_id, account_id, external_id, kind, title, body, url, author, received_at, metadata,
       status, attempts, last_error, next_attempt_at, created_at, updated_at)
     VALUES ($id, $connectorID, $accountID, $externalID, $kind, $title, $body, $url, $author, $receivedAt, $metadata,
       'pending', 0, NULL, 0, $createdAt, $updatedAt)`,
  )
  const tx = d.transaction(() => {
    for (const input of inputs) {
      const result = stmt.run({
        $id: newId(),
        $connectorID: connectorID,
        $accountID: input.accountID ?? "",
        $externalID: input.externalID,
        $kind: input.kind,
        $title: input.title,
        $body: input.body ?? "",
        $url: input.url ?? "",
        $author: input.author ?? "",
        $receivedAt: input.receivedAt,
        $metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        $createdAt: now,
        $updatedAt: now,
      })
      if (result.changes > 0) inserted++
    }
  })
  tx()
  return inserted
}

function rowToEvent(row: Record<string, unknown>): AutomationEvent {
  const metadata = row.metadata
  return {
    id: String(row.id),
    connectorID: String(row.connector_id),
    accountID: row.account_id ? String(row.account_id) : undefined,
    externalID: String(row.external_id),
    kind: String(row.kind),
    title: String(row.title),
    body: row.body ? String(row.body) : undefined,
    url: row.url ? String(row.url) : undefined,
    author: row.author ? String(row.author) : undefined,
    receivedAt: Number(row.received_at),
    metadata: metadata ? (JSON.parse(String(metadata)) as Record<string, unknown>) : undefined,
    status: row.status as AutomationEvent["status"],
    attempts: Number(row.attempts),
    lastError: row.last_error ? String(row.last_error) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

/**
 * Atomically claim up to `limit` deliverable events. Claiming marks rows `claimed` in one
 * transaction so two workers on the same store can never deliver the same event twice.
 */
export async function claim(limit: number): Promise<AutomationEvent[]> {
  const d = await getDb()
  const now = Date.now()
  const claimed: AutomationEvent[] = []
  const tx = d.transaction(() => {
    const rows = d
      .query(
        `SELECT * FROM automation_event
         WHERE status = 'pending' AND next_attempt_at <= $now AND attempts < $maxAttempts
         ORDER BY received_at ASC LIMIT $limit`,
      )
      .all({ $now: now, $maxAttempts: MAX_ATTEMPTS, $limit: limit }) as Record<string, unknown>[]
    const mark = d.query(`UPDATE automation_event SET status = 'claimed', updated_at = $now WHERE id = $id`)
    for (const row of rows) {
      mark.run({ $id: String(row.id), $now: now })
      claimed.push(rowToEvent({ ...row, status: "claimed" }))
    }
  })
  tx()
  return claimed
}

export async function markDispatched(id: string): Promise<void> {
  const d = await getDb()
  d.query(`UPDATE automation_event SET status = 'dispatched', updated_at = $now WHERE id = $id`).run({
    $id: id,
    $now: Date.now(),
  })
}

/**
 * Record a failed delivery. Below the attempt cap the event returns to `pending` with an
 * exponential backoff so a transient network failure is retried, not lost. At the cap it is
 * parked as `failed` and left for inspection rather than retried forever.
 */
export async function markFailed(id: string, error: string): Promise<{ attempts: number; parked: boolean }> {
  const d = await getDb()
  const row = d.query(`SELECT attempts FROM automation_event WHERE id = $id`).all({ $id: id })[0] as
    | { attempts: number }
    | undefined
  const attempts = (row?.attempts ?? 0) + 1
  const parked = attempts >= MAX_ATTEMPTS
  const backoff = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (attempts - 1))
  d.query(
    `UPDATE automation_event
     SET status = $status, attempts = $attempts, last_error = $error,
         next_attempt_at = $next, updated_at = $now
     WHERE id = $id`,
  ).run({
    $id: id,
    $status: parked ? "failed" : "pending",
    $attempts: attempts,
    $error: error.slice(0, 1000),
    $next: Date.now() + backoff,
    $now: Date.now(),
  })
  return { attempts, parked }
}

export async function counts(): Promise<{ pending: number; dispatched: number; failed: number }> {
  const d = await getDb()
  const rows = d.query(`SELECT status, COUNT(*) AS n FROM automation_event GROUP BY status`).all() as {
    status: string
    n: number
  }[]
  const byStatus = new Map(rows.map((r) => [r.status, r.n]))
  const pending = (byStatus.get("pending") ?? 0) + (byStatus.get("claimed") ?? 0)
  return { pending, dispatched: byStatus.get("dispatched") ?? 0, failed: byStatus.get("failed") ?? 0 }
}

/** Undelivered events, oldest first — this is what gets injected into the agent context. */
export async function undelivered(limit: number): Promise<AutomationEvent[]> {
  const d = await getDb()
  const rows = d
    .query(`SELECT * FROM automation_event WHERE status IN ('pending', 'claimed') ORDER BY received_at ASC LIMIT $limit`)
    .all({ $limit: limit }) as Record<string, unknown>[]
  return rows.map(rowToEvent)
}

/** Recent events regardless of status, for status reporting. */
export async function recent(limit: number): Promise<AutomationEvent[]> {
  const d = await getDb()
  const rows = d
    .query(`SELECT * FROM automation_event ORDER BY received_at DESC LIMIT $limit`)
    .all({ $limit: limit }) as Record<string, unknown>[]
  return rows.map(rowToEvent)
}

export async function recordObservation(connectorID: string, accountID: string, at: number, seen: number): Promise<void> {
  const d = await getDb()
  d.query(
    `INSERT INTO automation_cursor (connector_id, account_id, last_observed_at, events_seen)
     VALUES ($connectorID, $accountID, $at, $seen)
     ON CONFLICT(connector_id, account_id)
     DO UPDATE SET last_observed_at = $at, events_seen = events_seen + $seen`,
  ).run({ $connectorID: connectorID, $accountID: accountID, $at: at, $seen: seen })
}

export async function getCursor(connectorID: string, accountID: string): Promise<number> {
  const d = await getDb()
  const row = d
    .query(`SELECT last_observed_at FROM automation_cursor WHERE connector_id = $c AND account_id = $a`)
    .all({ $c: connectorID, $a: accountID })[0] as { last_observed_at: number } | undefined
  return row?.last_observed_at ?? 0
}

export async function cursors(): Promise<Record<string, { lastObservedAt: number; eventsSeen: number }>> {
  const d = await getDb()
  const rows = d.query(`SELECT * FROM automation_cursor`).all() as {
    connector_id: string
    account_id: string
    last_observed_at: number
    events_seen: number
  }[]
  const out: Record<string, { lastObservedAt: number; eventsSeen: number }> = {}
  for (const row of rows) {
    out[`${row.connector_id}:${row.account_id}`] = { lastObservedAt: row.last_observed_at, eventsSeen: row.events_seen }
  }
  return out
}

/**
 * A process-global reader for undelivered events. The prompt loop needs the block on every
 * turn but must not import the automation service graph (that would pull the MCP client into
 * the session module). The service installs the reader at startup; until then this is empty.
 */
type PendingReader = (limit: number) => Promise<string>
let pendingReader: PendingReader | undefined

export function setPendingReader(reader: PendingReader): void {
  pendingReader = reader
}

export async function getMeta(key: string): Promise<string | undefined> {
  const d = await getDb()
  const row = d.query(`SELECT value FROM automation_meta WHERE key = $key`).all({ $key: key })[0] as
    | { value?: string }
    | undefined
  return row?.value
}

export async function setMeta(key: string, value: string): Promise<void> {
  const d = await getDb()
  d.query(
    `INSERT INTO automation_meta (key, value) VALUES ($key, $value)
     ON CONFLICT(key) DO UPDATE SET value = $value`,
  ).run({ $key: key, $value: value })
}

export async function pendingBlock(limit = 20): Promise<string> {
  if (!pendingReader) return ""
  try {
    return await pendingReader(limit)
  } catch {
    return ""
  }
}

export async function close(): Promise<void> {
  if (!db) return
  db.close()
  db = null
  dbInitPromise = null
}
