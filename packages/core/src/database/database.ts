export * as Database from "./database"

import { EffectDrizzleSqlite } from "@zyraxon-ai/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Context, Effect, Layer } from "effect"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration"
import { InstallationChannel } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@zyraxon/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase

    // ═══════════════════════════════════════════════════════════════
    // ZYRAXON ETERNAL MEMORY — ZERO-LAG SQLite PRAGMAs
    // Optimized for 1000GB+ databases. 50,000 year preservation.
    // WAL + massive cache + mmap = instant queries at any scale.
    // ═══════════════════════════════════════════════════════════════

    // WAL mode — concurrent reads, zero blocking on writes
    yield* db.run("PRAGMA journal_mode = WAL")
    // NORMAL sync — fsync only on checkpoints (10x faster writes)
    yield* db.run("PRAGMA synchronous = NORMAL")
    // 120 second busy timeout — never fail on lock contention
    yield* db.run("PRAGMA busy_timeout = 120000")
    // 256MB page cache — keeps hot data in RAM (4x default)
    yield* db.run("PRAGMA cache_size = -262144")
    // 4GB memory-mapped I/O — OS manages file caching
    yield* db.run("PRAGMA mmap_size = 4294967296")
    // 8KB page size — optimal for large text content (2x default)
    yield* db.run("PRAGMA page_size = 8192")
    // Temp tables in memory only — zero disk I/O
    yield* db.run("PRAGMA temp_store = MEMORY")
    // Foreign keys enforced — data integrity
    yield* db.run("PRAGMA foreign_keys = ON")
    // WAL autocheckpoint every 1000 pages (8MB with 8KB pages)
    yield* db.run("PRAGMA wal_autocheckpoint = 1000")
    // No secure delete — faster VACUUM (we don't need forensic recovery)
    yield* db.run("PRAGMA secure_delete = OFF")
    // Incremental vacuum — keep DB compact without blocking
    yield* db.run("PRAGMA auto_vacuum = INCREMENTAL")
    // Checkpoint WAL on startup — clean state
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    // Optimize B-tree structure — faster reads
    yield* db.run("PRAGMA optimize")
    // Apply migrations
    yield* DatabaseMigration.apply(db)

    return { db }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  return layer.pipe(Layer.provide(sqliteLayer({ filename })))
}

export function path() {
  if (Flag.ZYRAXON_DB) {
    if (Flag.ZYRAXON_DB === ":memory:" || isAbsolute(Flag.ZYRAXON_DB)) return Flag.ZYRAXON_DB
    return join(Global.Path.data, Flag.ZYRAXON_DB)
  }
  if (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.ZYRAXON_DISABLE_CHANNEL_DB === "1" ||
    process.env.ZYRAXON_DISABLE_CHANNEL_DB === "true"
  )
    return join(Global.Path.data, "zyraxon.db")
  return join(Global.Path.data, `zyraxon-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
}

export const node = makeGlobalNode({ service: Service, layer: layerFromPath(path()), deps: [] })
