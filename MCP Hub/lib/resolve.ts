// MCP Hub — resolve an app to a real, connectable MCP server.
//
// An app the catalog already names resolves to that endpoint and nothing else. Only the
// apps with no URL of their own — the ones reached through a broker such as HasData or
// izap, and anything a user searched for — go to the registry, where the best hosted
// server is picked. That is what makes an app like Facebook connectable without shipping
// a special case for it.

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
/** Words that suggest it is not. */
const BAD = ["demo", "test", "sample", "example", "deprecated", "tutorial"]

/**
 * Rank a candidate against one search term.
 *
 * A hosted endpoint is worth a lot: it is the difference between one click and asking
 * the user to install something. Name matches beat title matches beat description
 * matches, and a short specific name beats a long one, because "notion" should not lose
 * to "notion-advanced-example-mcp-server".
 */
function score(server: RegistryServer, term: string): number {
  const name = server.name.toLowerCase()
  const title = (server.title ?? "").toLowerCase()
  const description = (server.description ?? "").toLowerCase()

  let value = 0
  if (!server.remote) value -= 40
  if (name.includes(term)) value += 20
  if (title.includes(term)) value += 14
  if (description.includes(term)) value += 6
  for (const word of GOOD) if (name.includes(word)) value += 2
  for (const word of BAD) if (name.includes(word) || description.includes(word)) value -= 8
  value -= Math.min(name.length / 8, 6)
  return value
}

/**
 * Find the best connectable server for an app.
 *
 * `preferredUrl` short-circuits the search entirely, and that is the normal path: the
 * catalog carries a verified endpoint for every app that has one, and reaching for the
 * registry instead would trade a known-good URL for a guessed one.
 */
export async function resolveApp(app: AppEntry, preferredUrl?: string): Promise<Resolution> {
  const known = preferredUrl ?? app.url
  if (known) return { url: known, candidates: [] }

  // "google-drive" should find the Drive server as readily as the calendar one, so both
  // the head and the full id are searched.
  const head = app.id.includes("-") ? app.id.split("-")[0] : app.id
  const terms = head === app.id ? [app.id] : [head, app.id]

  const seen = new Map<string, RegistryServer>()
  for (const term of terms) {
    const hits = await searchRegistry(term, 30).catch(() => [] as RegistryServer[])
    for (const hit of hits) if (!seen.has(hit.name)) seen.set(hit.name, hit)
  }

  const ranked = Array.from(seen.values())
    .map((server) => ({ server, value: score(server, head) }))
    .sort((a, b) => b.value - a.value)
    .map((entry) => entry.server)

  const best = ranked.find((server) => server.remote && server.remotes.length > 0)
  if (!best) {
    const top = ranked[0]
    return {
      ...(top ? { server: top } : {}),
      candidates: ranked,
      reason: top
        ? `"${top.name}" is not hosted, so it has to be run locally. It is listed as a candidate.`
        : `no MCP server found in the registry for "${app.id}"`,
    }
  }

  // remotes is non-empty by the filter above, but the element access still needs saying
  // out loud rather than being assumed.
  const endpoint = best.remotes[0]?.url
  if (!endpoint) {
    return { server: best, candidates: ranked, reason: `"${best.name}" published a hosted endpoint with no URL` }
  }

  return { server: best, url: endpoint, candidates: ranked }
}