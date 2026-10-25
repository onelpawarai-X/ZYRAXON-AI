#!/usr/bin/env node
// Copyright (c) 2026 onelpawarai. All rights reserved.

// Harvest the official MCP registry into a local raw snapshot.
//
//   node "MCP Hub/scripts/registry-harvest.mjs"                walk every page
//   node "MCP Hub/scripts/registry-harvest.mjs" --max-pages 5  stop after five pages
//   node "MCP Hub/scripts/registry-harvest.mjs" --refresh      refetch pages already on disk
//
// One page is one file under data/raw/. A page already on disk is not fetched again, so a
// run that dies on page 60 resumes on page 60 instead of page 1. The raw pages are kept
// because the catalog has to be rebuildable without touching the network a second time,
// and because a verification result is only worth anything if the input it was computed
// from is still on disk to check it against.
//
// The registry paginates with `metadata.nextCursor` in the body. The
// `x-mcp-registry-next-cursor` header is the literal string "null" on every page, which
// reads as "no more pages" and silently truncates the walk to page one. The body field is
// the only cursor that means anything.

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const RAW = join(ROOT, "data", "raw")

const REGISTRY = "https://registry.modelcontextprotocol.io/v0.1/servers"
const PAGE_SIZE = 100
const PAGE_TIMEOUT_MS = 30_000
const RETRIES = 6

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}

const maxPages = value("--max-pages") ? Number(value("--max-pages")) : Infinity
const refresh = flag("--refresh")

const pageFile = (n) => join(RAW, `registry-page-${String(n).padStart(4, "0")}.json`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** One page, retried with backoff. A 429 or a 5xx is worth waiting out; a 4xx is not. */
async function fetchPage(cursor) {
  const url = new URL(REGISTRY)
  url.searchParams.set("limit", String(PAGE_SIZE))
  if (cursor) url.searchParams.set("cursor", cursor)

  let lastError
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      })
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`registry answered ${res.status}`)
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw Object.assign(new Error(`registry answered ${res.status}: ${body.slice(0, 200)}`), { fatal: true })
      }
      return await res.json()
    } catch (error) {
      if (error?.fatal) throw error
      lastError = error
      const wait = Math.min(1000 * 2 ** attempt, 30_000)
      process.stderr.write(`  retry ${attempt + 1}/${RETRIES} in ${wait}ms — ${error?.message ?? error}\n`)
      await sleep(wait)
    }
  }
  throw lastError
}

async function main() {
  await mkdir(RAW, { recursive: true })

  let cursor
  let page = 0
  let total = 0

  while (page < maxPages) {
    page++
    const file = pageFile(page)

    if (!refresh) {
      try {
        const cached = JSON.parse(await readFile(file, "utf8"))
        total += cached.servers?.length ?? 0
        cursor = cached.nextCursor
        process.stderr.write(`page ${page}: cached (${cached.servers?.length ?? 0} servers)\n`)
        if (!cursor) break
        continue
      } catch {
        // not on disk yet — fall through and fetch it
      }
    }

    const body = await fetchPage(cursor)
    const servers = Array.isArray(body.servers) ? body.servers : []
    const next = body.metadata?.nextCursor

    await writeFile(file, JSON.stringify({ page, servers, nextCursor: next }, null, 2))
    total += servers.length
    process.stderr.write(`page ${page}: ${servers.length} servers${next ? "" : " (last page)"}\n`)

    if (!next) break
    if (servers.length === 0) break
    cursor = next
  }

  const files = (await readdir(RAW)).filter((n) => n.startsWith("registry-page-")).sort()
  process.stdout.write(JSON.stringify({ pages: files.length, servers: total }, null, 2) + "\n")
}

main().catch((error) => {
  process.stderr.write(`harvest failed: ${error?.message ?? error}\n`)
  process.exit(1)
})
