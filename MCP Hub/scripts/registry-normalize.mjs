#!/usr/bin/env node
// Copyright (c) 2026 onelpawarai. All rights reserved.

// Turn the raw registry pages into a normalised server list.
//
//   node "MCP Hub/scripts/registry-normalize.mjs"
//
// The registry stores one row per *version*, not per server: 177,179 rows carry 49,808
// distinct names. Keeping every row would put the same card on screen a dozen times, so
// this collapses each name to its newest active row and throws the rest away. Deprecated
// and deleted rows go with them — a card that installs something the registry has retired
// is worse than no card.
//
// What comes out is `data/servers.json`: one object per server, carrying the parts the
// next two stages need and nothing else. The raw pages stay untouched beside it, so this
// is re-runnable without the network.

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const RAW = join(ROOT, "data", "raw")
const DATA = join(ROOT, "data")

const args = process.argv.slice(2)
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity

/** Registries the catalog knows how to install from. Anything else is dropped. */
const KNOWN_PACKAGE_TYPES = new Set(["npm", "pypi", "oci", "mcpb", "nuget"])

/**
 * Pick the newest row per name.
 *
 * `updatedAt` is the field that moves when a server is republished; `publishedAt` does
 * not, so comparing on it would keep the oldest version of every server that was ever
 * edited. The official `_meta` block is where both live.
 */
function pickNewest(rows) {
  let best
  let bestAt = ""
  for (const row of rows) {
    const at = row.meta?.updatedAt ?? row.meta?.publishedAt ?? ""
    if (!best || at > bestAt) {
      best = row
      bestAt = at
    }
  }
  return best
}

function normaliseServer(row) {
  const s = row.server ?? {}
  const remotes = (s.remotes ?? [])
    .filter((r) => r && typeof r.url === "string" && (r.type === "streamable-http" || r.type === "sse"))
    .map((r) => ({ type: r.type, url: r.url, headers: r.headers ?? [] }))

  const packages = (s.packages ?? [])
    .filter((p) => p && KNOWN_PACKAGE_TYPES.has(p.registryType))
    .map((p) => ({
      registryType: p.registryType,
      identifier: p.identifier,
      version: p.version,
      runtimeHint: p.runtimeHint,
      runtimeArguments: p.runtimeArguments ?? [],
      packageArguments: p.packageArguments ?? [],
      environmentVariables: p.environmentVariables ?? [],
    }))

  return {
    id: s.name,
    name: s.name,
    title: s.title,
    description: s.description,
    version: s.version,
    repository: s.repository?.url,
    website: s.websiteUrl,
    remotes,
    packages,
    updatedAt: row.meta?.updatedAt ?? row.meta?.publishedAt,
    publishedAt: row.meta?.publishedAt,
  }
}

async function main() {
  await mkdir(DATA, { recursive: true })
  const files = (await readdir(RAW)).filter((n) => n.startsWith("registry-page-")).sort()

  /** name -> array of normalised rows, so the newest can be picked after the whole walk */
  const byName = new Map()
  let scanned = 0
  let skippedDeprecated = 0

  for (const file of files) {
    const body = JSON.parse(await readFile(join(RAW, file), "utf8"))
    for (const entry of body.servers ?? []) {
      scanned++
      const status = entry._meta?.["io.modelcontextprotocol.registry/official"]?.status
      if (status && status !== "active") {
        skippedDeprecated++
        continue
      }
      const row = { server: entry.server, meta: entry._meta?.["io.modelcontextprotocol.registry/official"] }
      const name = row.server?.name
      if (!name) continue
      const list = byName.get(name)
      if (list) list.push(row)
      else byName.set(name, [row])
    }
  }

  const servers = []
  for (const [name, rows] of byName) {
    const row = pickNewest(rows)
    const server = normaliseServer(row)
    // A server with no way to reach it at all is not a server the catalog can offer.
    if (server.remotes.length === 0 && server.packages.length === 0) continue
    servers.push(server)
    if (servers.length >= limit) break
  }

  // Stable order so two runs produce byte-identical output and a diff means a real change.
  servers.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  await writeFile(
    join(DATA, "servers.json"),
    JSON.stringify({ generatedFrom: files.length, scanned, skippedDeprecated, count: servers.length, servers }, null, 2),
  )

  process.stdout.write(
    JSON.stringify({ scanned, skippedDeprecated, uniqueNames: byName.size, kept: servers.length }, null, 2) + "\n",
  )
}

main().catch((error) => {
  process.stderr.write(`normalise failed: ${error?.message ?? error}\n`)
  process.exit(1)
})
