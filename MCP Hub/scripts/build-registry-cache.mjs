#!/usr/bin/env node
// Rebuild catalog/registry-cache.json and catalog/registry-summary.json from the official
// MCP registry.
//
//   node "MCP Hub/scripts/build-registry-cache.mjs"            walk the whole registry
//   node "MCP Hub/scripts/build-registry-cache.mjs" --pages 5  stop after n pages
//   node "MCP Hub/scripts/build-registry-cache.mjs" --dry-run  report, write nothing
//
// The panel reads only the summary, which is a few dozen bytes. The full cache is a couple
// of megabytes and must never be imported by the app, so the two are written together here
// and the small one is all anything in the UI is allowed to touch.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const CATALOG = join(HERE, "..", "catalog")

const REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers"
const PAGE_SIZE = 100
/** The registry paginates; stop if a page keeps arriving empty rather than spin forever. */
const MAX_PAGES = 1000
const PAGE_TIMEOUT_MS = 30_000

export function parseArgs(argv) {
  const flag = (name) => argv.includes(name)
  const value = (name) => {
    const at = argv.indexOf(name)
    return at === -1 ? undefined : Number(argv[at + 1])
  }
  return { help: flag("--help") || flag("-h"), dryRun: flag("--dry-run"), pages: value("--pages") }
}

export const USAGE = `Rebuild the MCP registry cache.

  --pages <n>   stop after n pages instead of walking the whole registry
  --dry-run     report what would be written, without touching either file
  --help        show this text
`

/**
 * One page of the registry.
 *
 * Two things about this endpoint are not guessable from the docs and both were got wrong
 * before. Every entry arrives as `{ server, _meta }`, so reading `remotes` off the entry
 * itself finds nothing and every server ends up looking local. And the next cursor lives
 * in `metadata.nextCursor` in the body — the `x-mcp-registry-next-cursor` header is always
 * the literal string "null", which reads as "no more pages" and silently truncates the
 * cache to a single page.
 */
export async function fetchPage(cursor, limit = PAGE_SIZE) {
  const url = new URL(REGISTRY)
  url.searchParams.set("limit", String(limit))
  if (cursor) url.searchParams.set("cursor", cursor)

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  })

  if (!res.ok) {
    throw new Error(`registry answered ${res.status}${cursor ? ` at cursor ${cursor}` : " on the first page"}`)
  }

  const body = await res.json()
  const entries = Array.isArray(body.servers) ? body.servers : []

  return {
    servers: entries.map(normalise).filter((server) => server.name !== undefined),
    cursor: typeof body.metadata?.nextCursor === "string" && body.metadata.nextCursor.length > 0
      ? body.metadata.nextCursor
      : undefined,
  }
}

/** Keep only what the Hub actually shows or searches on. */
export function normalise(entry) {
  const server = entry?.server ?? entry
  const remotes = Array.isArray(server?.remotes) ? server.remotes : []
  return {
    name: server?.name,
    title: server?.title,
    description: server?.description,
    version: server?.version_detail?.version,
    remote: remotes.length > 0,
    remotes: remotes.map((r) => ({ type: r.type, url: r.url })),
  }
}

/** Walk the registry, yielding one flat list at the end. */
export async function walk(maxPages) {
  const servers = []
  const seen = new Set()
  let cursor
  let pages = 0

  while (pages < (maxPages ?? MAX_PAGES)) {
    const page = await fetchPage(cursor)
    pages++

    let fresh = 0
    for (const server of page.servers) {
      if (seen.has(server.name)) continue
      seen.add(server.name)
      servers.push(server)
      fresh++
    }

    console.log(
      `page ${String(pages).padStart(3)} · ${String(fresh).padStart(4)} new · ${String(servers.length).padStart(6)} total` +
        (page.cursor ? "" : " · last page"),
    )

    // No cursor means the registry is done. A page that returned nothing new and no cursor
    // means it is stuck, and stopping beats spinning.
    if (!page.cursor || (fresh === 0 && page.servers.length === 0)) break
    cursor = page.cursor
  }

  return { servers, pages }
}

/** How many servers the cache on disk already holds, or 0 when there is none. */
async function existingCount() {
  try {
    const cache = JSON.parse(await readFile(join(CATALOG, "registry-cache.json"), "utf8"))
    return Array.isArray(cache.servers) ? cache.servers.length : 0
  } catch {
    return 0
  }
}

export async function main(argv) {
  const { help, dryRun, pages } = parseArgs(argv)
  if (help) {
    console.log(USAGE)
    return
  }

  console.log("MCP registry cache")
  console.log("==================")

  const { servers, pages: walked } = await walk(pages)
  const remote = servers.filter((s) => s.remote).length
  const generatedAt = new Date().toISOString()

  console.log(`\n${servers.length} servers over ${walked} pages`)
  console.log(`${remote} remote, ${servers.length - remote} local`)

  if (dryRun) {
    console.log(`\n--dry-run: wrote nothing`)
    return
  }

  /**
   * A partial walk must never replace a full cache.
   *
   * This script failed once exactly this way: it read the response shape wrong, believed
   * the walk had finished after one page, and overwrote a 9,580-server cache with a single
   * entry. The panel would then have cheerfully reported a registry of one server. A run
   * that collects less than what is already there is a broken run, not a smaller registry.
   */
  const before = await existingCount()
  if (before > 0 && servers.length < before) {
    console.error(
      `\nRefusing to write. The cache on disk holds ${before} servers but this walk only collected ${servers.length}.`,
    )
    console.error("A partial walk must not replace a full cache. Re-run without --pages, or with more of them.")
    process.exitCode = 1
    return
  }

  await mkdir(CATALOG, { recursive: true })

  await writeFile(
    join(CATALOG, "registry-cache.json"),
    JSON.stringify({ generatedAt, pages: walked, count: servers.length, servers }),
    "utf8",
  )

  // Deliberately tiny, and deliberately written here rather than computed in the panel:
  // the app must never pull the full cache in just to print one sentence.
  await writeFile(
    join(CATALOG, "registry-summary.json"),
    JSON.stringify(
      {
        fetched: generatedAt,
        count: servers.length,
        remote,
        local: servers.length - remote,
        note: "Written by scripts/build-registry-cache.mjs. The panel reads only this small file; the full cache sits beside it and is never bundled into the app.",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  )

  console.log(`\nwrote ${join(CATALOG, "registry-cache.json")}`)
  console.log(`wrote ${join(CATALOG, "registry-summary.json")}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2))
}