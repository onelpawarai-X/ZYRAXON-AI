// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Database } from "@zyraxon-ai/core/database/database"
import { Global } from "@zyraxon-ai/core/global"
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

type LocationEntry = {
  id: string
  label: string
  kind: "database" | "directory" | "config" | "mcp"
  path: string
  exists: boolean
  bytes: number
  deletable: boolean
}

const fsSync = (): typeof import("node:fs") => require("node:fs") as typeof import("node:fs")

function statOf(target: string): { exists: boolean; bytes: number } {
  try {
    const stat = fsSync().statSync(target)
    return { exists: true, bytes: stat.isFile() ? stat.size : 0 }
  } catch {
    return { exists: false, bytes: 0 }
  }
}

/**
 * Walk a directory tree collecting files whose basename matches one of the
 * wanted names. Depth-limited so a bundled `node_modules` cannot make this
 * expensive, and every result is checked on disk before it is reported.
 */
function scanFiles(root: string, names: Set<string>, extensions: Set<string>, maxDepth = 3): string[] {
  const out: string[] = []
  // Vendored dependency trees are skipped so the list shows the MCP servers
  // themselves, not the thousands of library files they ship with.
  const skipDirs = new Set([
    "node_modules",
    ".git",
    "__pycache__",
    "site-packages",
    "dist-packages",
    ".venv",
    "venv",
    "vendor",
    "third_party",
    "libs",
    "Lib",
    "lib",
    "python",
    "python3",
  ])
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return
    let entries: import("node:fs").Dirent[]
    try {
      entries = fsSync().readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue
        walk(full, depth + 1)
        continue
      }
      const ext = entry.name.includes(".") ? `.${entry.name.split(".").pop()!.toLowerCase()}` : ""
      if (names.has(entry.name) || extensions.has(ext)) out.push(full)
    }
  }
  walk(root, 0)
  return out
}

/** Read the MCP server config so file paths named there can be revealed. */
function mcpConfiguredFiles(): string[] {
  const candidates = [
    process.env.ZYRAXON_MCP_CONFIG,
    `${Global.Path.config}/mcp.json`,
    `${Global.Path.config}/zyraxon.json`,
    `${Global.Path.data}/mcp.json`,
  ].filter((value): value is string => typeof value === "string" && value.length > 0)

  const files = new Set<string>()
  for (const candidate of candidates) {
    if (!statOf(candidate).exists) continue
    try {
      const raw = fsSync().readFileSync(candidate, "utf8")
      // Pull every quoted string that looks like an absolute or resources path.
      for (const match of raw.matchAll(/"([^"]*(?:\/|\\)[^"]*\.(?:cjs|mjs|js|ts|py|json|wasm|so|dylib|dll|exe|node|sh))"/g)) {
        const value = match[1]!
        if (value.includes("__RESOURCES_PATH__")) continue
        const resolved = value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) ? value : `${Global.Path.data}/${value}`
        files.add(resolved)
      }
    } catch {
      // A malformed config just contributes nothing.
    }
  }
  return [...files]
}

/**
 * Discover every location the settings panel can reveal. Databases come from
 * scanning the data directory, config from the known config dirs, and MCP files
 * from both the resource tree and any path named in the MCP config — so the list
 * grows and shrinks with what is actually on disk instead of a fixed manifest.
 */
function discoverLocations(): LocationEntry[] {
  const entries: LocationEntry[] = []
  const seen = new Set<string>()

  const add = (entry: Omit<LocationEntry, "exists" | "bytes"> & { exists?: boolean; bytes?: number }) => {
    if (seen.has(entry.path)) return
    seen.add(entry.path)
    const stat = entry.exists === undefined || entry.bytes === undefined ? statOf(entry.path) : { exists: entry.exists, bytes: entry.bytes }
    entries.push({ ...entry, exists: stat.exists, bytes: stat.bytes })
  }

  // 1. Databases — scan the data dir for any *.db file (main chat, AI Generate,
  //    per-channel builds). The AI Generate database is identified by name so the
  //    panel can offer delete + regenerate for it.
  let dataFiles: import("node:fs").Dirent[] = []
  try {
    dataFiles = fsSync().readdirSync(Global.Path.data, { withFileTypes: true })
  } catch {
    dataFiles = []
  }
  for (const file of dataFiles) {
    if (!file.isFile() || !file.name.endsWith(".db")) continue
    const full = `${Global.Path.data}/${file.name}`
    const isAiGenerate = file.name.includes("ai-generate") || file.name.includes("aigenerate")
    add({
      id: `db:${file.name}`,
      label: isAiGenerate ? "AI Generate database" : file.name === "zyraxon.db" || file.name.includes("zyraxon-") ? "Main chat database" : file.name,
      kind: "database",
      path: full,
      deletable: true,
    })
  }

  // 2. Core directories the app writes to.
  add({ id: "dir:data", label: "Data directory", kind: "directory", path: Global.Path.data, deletable: false })
  add({ id: "dir:config", label: "Config directory", kind: "config", path: Global.Path.config, deletable: false })
  add({ id: "dir:log", label: "Log directory", kind: "directory", path: Global.Path.log, deletable: false })
  add({ id: "dir:repos", label: "Repositories", kind: "directory", path: Global.Path.repos, deletable: false })

  // 3. MCP files — walk the resources tree for manifests and native sources,
  //    then add anything the MCP config points at. The resources folder sits
  //    beside the packaged app in production, and under `packages/desktop` in
  //    the monorepo, so search outward from cwd until a known marker is found.
  const resourcesRoots = [
    process.env.ZYRAXON_RESOURCES_PATH,
    `${Global.Path.data}/../resources`,
    ...findResourcesRoots(),
  ].filter((value): value is string => typeof value === "string" && value.length > 0)

  const wantedNames = new Set(["package.json", "package-lock.json", "default-mcp-config.json"])
  // Native and script sources shipped with the MCP servers, so Packet-style C
  // sources and the server entrypoints are all visible.
  const wantedExtensions = new Set([".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".py", ".cjs", ".mjs"])
  for (const root of resourcesRoots) {
    if (!statOf(root).exists) continue
    for (const file of scanFiles(root, wantedNames, wantedExtensions)) {
      add({ id: `mcp:${file}`, label: `MCP · ${file.split("/").slice(-2).join("/")}`, kind: "mcp", path: file, deletable: false })
    }
  }
  for (const file of mcpConfiguredFiles()) {
    add({ id: `mcp:${file}`, label: `MCP · ${file.split("/").pop()}`, kind: "mcp", path: file, deletable: false })
  }

  return entries
}

/**
 * Find `resources` directories by walking outward from the current directory.
 * The monorepo keeps them at `packages/desktop/resources`, while a packaged
 * build ships one beside the executable, so the walk checks both the direct
 * `resources` child and the monorepo path at each level before moving up.
 */
function findResourcesRoots(): string[] {
  const found: string[] = []
  let dir = process.cwd()
  for (let depth = 0; depth < 6; depth++) {
    for (const candidate of [`${dir}/resources`, `${dir}/packages/desktop/resources`, `${dir}/desktop/resources`]) {
      // The marker keeps this honest: only a real resources folder counts.
      if (statOf(`${candidate}/default-mcp-config.json`).exists) found.push(candidate)
    }
    const parent = dir.replace(/\/[^/]+$/, "")
    if (!parent || parent === dir) break
    dir = parent
  }
  return found
}

const locations = Effect.fn("StorageHttpApi.locations")(function* () {
  return { locations: discoverLocations() }
})

const emptyLocations = Effect.succeed({ locations: [] as LocationEntry[] })

export const StorageHandler = HttpApiBuilder.group(Api, "server.storage", (handlers) =>
  handlers
    // A read that cannot answer should still render the panel, so the database
    // error channel is folded away rather than surfacing as a failed request.
    .handle("storage.usage", () => response(usage()).pipe(Effect.catch(() => response(emptyUsage))))
    .handle("storage.compact", () => response(compact()).pipe(Effect.catch(() => response(emptyResult(0)))))
    .handle("storage.purge", (ctx) => response(purge(ctx)).pipe(Effect.catch(() => response(emptyResult(0)))))
    .handle("storage.locations", () => response(locations()).pipe(Effect.catch(() => response(emptyLocations)))),
)