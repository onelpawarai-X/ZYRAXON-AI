#!/usr/bin/env node
// Build a local cache of the official MCP registry so the Hub can search it
// instantly and work without a network.
//
//   node scripts/build-registry-cache.mjs [maxPages]
//
// Writes catalog/registry-cache.json

import { writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "..", "catalog", "registry-cache.json")
const BASE = "https://registry.modelcontextprotocol.io/v0/servers"
const MAX_PAGES = Number(process.argv[2] ?? 400)

function normalise(entry) {
  const s = entry?.server ?? entry
  if (!s?.name) return undefined
  const remotes = Array.isArray(s.remotes)
    ? s.remotes.filter((r) => r?.url).map((r) => ({ type: String(r.type ?? "streamable-http"), url: String(r.url) }))
    : []
  return {
    name: s.name,
    title: s.title,
    description: s.description,
    version: s.version,
    remote: remotes.length > 0,
    remotes,
  }
}

async function main() {
  const seen = new Map()
  let cursor
  let pages = 0

  while (pages < MAX_PAGES) {
    const url = new URL(BASE)
    url.searchParams.set("limit", "100")
    if (cursor) url.searchParams.set("cursor", cursor)

    let data
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } })
      if (!res.ok) {
        console.error(`registry returned ${res.status}, stopping`)
        break
      }
      data = await res.json()
    } catch (error) {
      console.error(`network error, stopping: ${error.message}`)
      break
    }

    const batch = data?.servers ?? []
    if (batch.length === 0) break

    for (const raw of batch) {
      const s = normalise(raw)
      if (s && !seen.has(s.name)) seen.set(s.name, s)
    }

    pages += 1
    cursor = data?.metadata?.nextCursor
    if (pages % 25 === 0) console.log(`  ${pages} pages, ${seen.size} unique servers`)
    if (!cursor) {
      console.log("registry exhausted")
      break
    }
  }

  const servers = Array.from(seen.values())
  const payload = {
    generatedAt: new Date().toISOString(),
    pages,
    count: servers.length,
    servers,
  }
  await writeFile(OUT, JSON.stringify(payload))
  console.log(`wrote ${OUT}`)
  console.log(`pages=${pages} unique=${servers.length} hosted=${servers.filter((s) => s.remote).length}`)
}

main()
