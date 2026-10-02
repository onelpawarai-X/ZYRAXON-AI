// MCP Hub - resolve an app to a real, connectable MCP server.
//
// Most apps do not publish their own MCP server, so the panel cannot hardcode a
// URL for them. Instead it looks the app up in the official registry, picks the
// best hosted server, and uses that. This is what makes an app like Facebook or
// Gmail connectable without shipping a special case for it.

import type { AppEntry } from "../catalog/seed"
import { searchRegistry, type RegistryServer } from "./registry"

export interface Resolution {
  /** the server the app resolved to */
  server?: RegistryServer
  /** the endpoint to connect to */
  url?: string
  /** every candidate found, best first */
  candidates: RegistryServer[]
  /** why there is no result, when there is none */
  reason?: string
}

/** Words that suggest a server is a good match for an app. */
const GOOD = ["official", "mcp", "server", "api"]
const BAD = ["demo", "test", "sample", "example", "deprecated"]

function score(server: RegistryServer, term: string): number {
  const name = server.name.toLowerCase()
  const title = (server.title ?? "").toLowerCase()
  const desc = (server.description ?? "").toLowerCase()
  let s = 0
  if (!server.remote) s -= 40 // a hosted server is far easier to use
  if (name.includes(term)) s += 20
  if (title.includes(term)) s += 14
  if (desc.includes(term)) s += 6
  for (const w of GOOD) if (name.includes(w)) s += 2
  for (const w of BAD) if (name.includes(w) || desc.includes(w)) s -= 8
  // prefer the shortest, most specific name
  s -= Math.min(name.length / 8, 6)
  return s
}

/**
 * Find the best connectable server for an app.
 *
 * `preferredUrl` short-circuits the search when the catalog already knows the
 * endpoint (Notion, Linear and the other first-party servers).
 */
export async function resolveApp(app: AppEntry, preferredUrl?: string): Promise<Resolution> {
  if (preferredUrl) {
    return {
      url: preferredUrl,
      candidates: [],
    }
  }

  const terms = app.id.includes("-") ? [app.id.split("-")[0], app.id] : [app.id]
  const seen = new Map<string, RegistryServer>()

  for (const term of terms) {
    try {
      const hits = await searchRegistry(term, 30)
      for (const h of hits) if (!seen.has(h.name)) seen.set(h.name, h)
    } catch {
      /* try the next term */
    }
  }

  const all = Array.from(seen.values())
  if (all.length === 0) {
    return { candidates: [], reason: `no MCP server found in the registry for "${app.id}"` }
  }

  const ranked = all
    .map((s) => ({ s, score: score(s, app.id.split("-")[0]) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s)

  const hosted = ranked.filter((s) => s.remote && s.remotes.length > 0)
  const best = hosted[0] ?? ranked[0]

  if (!best.remote || best.remotes.length === 0) {
    return {
      server: best,
      candidates: ranked,
      reason: `"${best.name}" is not hosted, so it must be run locally. It is listed as a candidate.`,
    }
  }

  return {
    server: best,
    url: best.remotes[0].url,
    candidates: ranked,
  }
}
