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

    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 30000")
    yield* db.run("PRAGMA cache_size = -8192")
    yield* db.run("PRAGMA temp_store = MEMORY")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_autocheckpoint = 1000")
    yield* db.run("PRAGMA secure_delete = OFF")
    yield* db.run("PRAGMA auto_vacuum = INCREMENTAL")
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
