// MCP Hub — live access to the official MCP registry, and OAuth metadata discovery.
//
// The registry at registry.modelcontextprotocol.io lists thousands of servers. It is
// streamed into a local cache so the UI can search it instantly and work offline
// afterwards.
//
// The second half of this file is the same discovery order the ZYRAXON server uses
// when it builds a real handshake, kept here in plain fetch so the panel can answer
// "will this ask me for anything?" before the user clicks. It is duplicated rather than
// imported because the server-side version is Effect-based and this runs in the UI
// bundle; the two must be changed together.

export interface RegistryServer {
  name: string
  title?: string
  description?: string
  version?: string
  /** remote endpoints, if the server is hosted */
  remotes: Array<{ type: string; url: string }>
  /** true when the server advertises a hosted endpoint */
  remote: boolean
  repository?: string
}

export interface RegistryPage {
  servers: RegistryServer[]
  nextCursor?: string
  count?: number
}

const BASE = "https://registry.modelcontextprotocol.io/v0/servers"

/** The registry rejects a page larger than this with a 422, so asking for more is wasted. */
const PAGE_LIMIT = 100
/** How far the live fallback is willing to page when there is no cache to search. */
const MAX_SEARCH_PAGES = 30

/** One request's worth of time. */
const HOP_TIMEOUT_MS = 10_000
/**
 * The whole discovery's worth of time.
 *
 * Bounded because discovery fans out over several candidates per hop, and without a
 * ceiling a chain of slow hosts turns a click into a wait. Every endpoint in the
 * catalog resolves inside two hops; the slowest measured was MongoDB at 7.5s across
 * three hops, so this is generous while still being a ceiling.
 */
const DISCOVERY_TIMEOUT_MS = 60_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const text = (value: unknown) => (typeof value === "string" ? value : undefined)

/** Fetch JSON, or nothing. A non-JSON or failed answer is a dead end, not an error. */
async function fetchJson(url: string): Promise<Record<string, unknown> | undefined> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
    })
    if (!res.ok) return undefined
    if (!(res.headers.get("content-type") ?? "").includes("json")) return undefined
    const body: unknown = await res.json()
    return isRecord(body) ? body : undefined
  } catch {
    return undefined
  }
}

function normalise(entry: unknown): RegistryServer | undefined {
  const wrapper = isRecord(entry) ? entry : undefined
  const server = isRecord(wrapper?.server) ? wrapper.server : wrapper
  const name = text(server?.name)
  if (!name) return undefined

  const remotes = Array.isArray(server?.remotes)
    ? server.remotes.flatMap((remote) => {
        const url = text(isRecord(remote) ? remote.url : undefined)
        return url ? [{ type: text(isRecord(remote) ? remote.type : undefined) ?? "streamable-http", url }] : []
      })
    : []

  return {
    name,
    title: text(server?.title),
    description: text(server?.description),
    version: text(server?.version),
    remotes,
    remote: remotes.length > 0,
    repository: text(isRecord(server?.repository) ? server.repository.url : undefined),
  }
}

/** Fetch one page of the registry. */
export async function fetchPage(opts: { cursor?: string; search?: string; limit?: number } = {}): Promise<RegistryPage> {
  const url = new URL(BASE)
  url.searchParams.set("limit", String(Math.min(opts.limit ?? PAGE_LIMIT, PAGE_LIMIT)))
  if (opts.cursor) url.searchParams.set("cursor", opts.cursor)

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`registry returned ${res.status}`)

  const data: unknown = await res.json()
  const body = isRecord(data) ? data : {}
  const metadata = isRecord(body.metadata) ? body.metadata : {}

  return {
    servers: (Array.isArray(body.servers) ? body.servers : []).flatMap((entry) => {
      const server = normalise(entry)
      return server ? [server] : []
    }),
    nextCursor: text(metadata.nextCursor),
    count: typeof metadata.count === "number" ? metadata.count : undefined,
  }
}

/**
 * Walk the whole registry.
 *
 * `onPage` is called for each batch so a caller can show progress or persist as it goes.
 * A failure part-way stops the walk and returns what was already collected, because a
 * cache of 900 servers is worth keeping even when page 3 times out.
 */
export async function walkRegistry(
  onPage: (page: RegistryPage, index: number) => void | Promise<void>,
  opts: { maxPages?: number; limit?: number } = {},
): Promise<{ pages: number; servers: number }> {
  const maxPages = opts.maxPages ?? Number.POSITIVE_INFINITY
  let cursor: string | undefined
  let pages = 0
  let servers = 0

  while (pages < maxPages) {
    const page = await fetchPage({ cursor, limit: opts.limit }).catch(() => undefined)
    if (!page || page.servers.length === 0) break
    pages += 1
    servers += page.servers.length
    await onPage(page, pages)
    cursor = page.nextCursor
    if (!cursor) break
  }

  return { pages, servers }
}

/** Search the registry for a phrase. */
export async function searchRegistry(term: string, limit = 30): Promise<RegistryServer[]> {
  return (await searchCache(term, limit)) ?? (await searchByWalking(term, limit))
}

/**
 * Search the local cache, which is the whole registry as it was last fetched.
 *
 * The registry's own `?search=` query parameter does not work: every request with it
 * hangs until the client gives up, at any page size, while `?limit=` on its own answers
 * in about a second. Search was therefore pointed at a parameter that had been dead since
 * it was written, and the panel's search box sat there spinning until it timed out.
 *
 * Searching the snapshot is both the only thing that works and the better answer for the
 * user: it is instant, it works offline, and it covers all 9,580 servers instead of the
 * first page of them.
 *
 * Returns undefined when the cache cannot be read, so the caller can fall back to the
 * registry rather than showing an empty list as though the registry were empty.
 */
export async function searchCache(term: string, limit = 30): Promise<RegistryServer[] | undefined> {
  const needle = term.trim().toLowerCase()
  if (!needle) return []

  const cached = await readCache()
  if (!cached) return undefined

  // Name first, because that is what somebody typing a tool name is looking for.
  return cached
    .filter(
      (server) =>
        server.name.toLowerCase().includes(needle) ||
        server.title?.toLowerCase().includes(needle) ||
        server.description?.toLowerCase().includes(needle),
    )
    .sort((a, b) => {
      const aName = a.name.toLowerCase().startsWith(needle) ? 0 : 1
      const bName = b.name.toLowerCase().startsWith(needle) ? 0 : 1
      return aName - bName || a.name.localeCompare(b.name)
    })
    .slice(0, limit)
}

/** The cache on disk, read once per process. A missing or unreadable cache is not fatal. */
let cachePromise: Promise<RegistryServer[] | undefined> | undefined

async function readCache(): Promise<RegistryServer[] | undefined> {
  cachePromise ??= (async () => {
    try {
      const { readFile } = await import("node:fs/promises")
      const { fileURLToPath } = await import("node:url")
      const { dirname, join } = await import("node:path")

      const here = dirname(fileURLToPath(import.meta.url))
      const raw = await readFile(join(here, "..", "catalog", "registry-cache.json"), "utf8")
      const parsed: unknown = JSON.parse(raw)
      const servers = isRecord(parsed) && Array.isArray(parsed.servers) ? parsed.servers : []
      return servers.flatMap((entry) => {
        const server = normalise(entry)
        return server ? [server] : []
      })
    } catch {
      return undefined
    }
  })()
  return cachePromise
}

/**
 * Fall back to the live registry when there is no cache.
 *
 * The registry returns its entries in name order, so a term late in the alphabet is only
 * reachable by paging most of the way through it. This therefore walks a bounded number of
 * pages and returns whatever it matched, which is honest: a partial result from a live
 * registry beats no result at all, and the cache path above is what makes the search box
 * actually complete.
 */
async function searchByWalking(term: string, limit: number): Promise<RegistryServer[]> {
  const needle = term.trim().toLowerCase()
  const hits: RegistryServer[] = []
  let cursor: string | undefined

  for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
    const result = await fetchPage({ cursor, limit: PAGE_LIMIT })
    for (const server of result.servers) {
      if (
        server.name.toLowerCase().includes(needle) ||
        server.title?.toLowerCase().includes(needle) ||
        server.description?.toLowerCase().includes(needle)
      ) {
        hits.push(server)
      }
    }
    if (hits.length >= limit || !result.nextCursor) break
    cursor = result.nextCursor
  }

  return hits.slice(0, limit)
}

// --------------------------------------------------------------------------------------
// OAuth discovery
// --------------------------------------------------------------------------------------

/** The endpoints a handshake needs, in the shape the discovery order found them. */
export interface OAuthEndpoints {
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint?: string
  issuer?: string
}

/**
 * The origin of a URL, with a plain string as a last resort.
 *
 * `issuer` values are not always URLs — a bare host appears in the wild — and a throw
 * here would take the whole discovery down rather than skip one candidate.
 */
function originOf(value: string): string {
  try {
    return new URL(value).origin
  } catch {
    return value.replace(/\/+$/, "")
  }
}

/** The path of a URL, without its trailing slash, so it can be spliced into well-known. */
function pathOf(value: string): string {
  try {
    const path = new URL(value).pathname
    return path === "/" ? "" : path.replace(/\/+$/, "")
  } catch {
    return ""
  }
}

/**
 * Where a protected resource document may live.
 *
 * The path-suffixed form comes first because a server serving several resources under
 * one host keys its metadata by path; the bare form is the fallback, and the trailing
 * slash variant is a real spelling some hosts serve instead.
 */
function resourceCandidates(serverUrl: string): string[] {
  const root = originOf(serverUrl)
  const path = pathOf(serverUrl)
  return [
    `${root}/.well-known/oauth-protected-resource${path}`,
    `${root}/.well-known/oauth-protected-resource`,
    `${root}/.well-known/oauth-protected-resource/`,
  ]
}

/**
 * Where an authorization server's metadata may live, in the RFC 8414 order.
 *
 * Both the OAuth and the OpenID spellings are tried, with the path-suffixed variant of
 * each ahead of the host-wide one.
 */
function issuerCandidates(issuer: string): string[] {
  const root = originOf(issuer)
  const path = pathOf(issuer)
  return [
    `${root}/.well-known/oauth-authorization-server${path}`,
    `${root}/.well-known/oauth-authorization-server`,
    `${root}/.well-known/openid-configuration${path}`,
    `${root}/.well-known/openid-configuration`,
    `${root}${path}/.well-known/openid-configuration`,
    root,
  ]
}

/** The authorization servers a metadata document points at. */
function issuersOf(doc: Record<string, unknown>): string[] {
  const listed = doc.authorization_servers
  if (Array.isArray(listed)) return listed.flatMap((s) => (typeof s === "string" ? [s] : []))
  return typeof doc.issuer === "string" ? [doc.issuer] : []
}

/** Pull the endpoints out of a metadata document, or nothing if it is not one. */
function endpointsOf(doc: Record<string, unknown>): OAuthEndpoints | undefined {
  const authorizationEndpoint = text(doc.authorization_endpoint)
  const tokenEndpoint = text(doc.token_endpoint)
  if (!authorizationEndpoint || !tokenEndpoint) return undefined
  const registrationEndpoint = text(doc.registration_endpoint)
  const issuer = text(doc.issuer)
  return {
    authorizationEndpoint,
    tokenEndpoint,
    ...(registrationEndpoint ? { registrationEndpoint } : {}),
    ...(issuer ? { issuer } : {}),
  }
}

/**
 * Parse a WWW-Authenticate header into its parameters.
 *
 * Only the `Bearer` scheme's parameters matter here, and the quoted-string form has to
 * survive intact because `resource_metadata` arrives quoted and full of slashes.
 */
function parseChallenge(header: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const pattern = /([a-zA-Z0-9_-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^,\s]+)/g
  for (const match of header.matchAll(pattern)) {
    const name = match[1]
    const raw = match[2]
    if (!name || raw === undefined) continue
    fields[name.toLowerCase()] = raw.startsWith('"')
      ? raw
          .slice(1, -1)
          .replace(/\\(.)/g, "$1")
      : raw
  }
  return fields
}

/**
 * Ask the server what it wants, anonymously.
 *
 * The 401 and its `WWW-Authenticate` header are the authoritative answer; the body is
 * often a plain `{"error":"Unauthorized"}` with no JSON-RPC in it, which is why the
 * header is what gets read here.
 */
async function challengeOf(serverUrl: string): Promise<{ fields: Record<string, string>; resource?: Record<string, unknown> }> {
  try {
    const res = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-hub", version: "1.0.0" } },
      }),
      signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
    })

    const header = res.headers.get("www-authenticate")
    if (!header) return { fields: {} }

    const fields = parseChallenge(header)
    const advertised = fields.resource_metadata
    // The advertised document is only worth fetching when the header did not also name
    // an authorization endpoint, because that endpoint is the more direct route.
    const resource =
      advertised && !fields.authorization_uri && !fields.authorization_url
        ? ((await fetchJson(advertised)) ?? undefined)
        : undefined

    return { fields, ...(resource ? { resource } : {}) }
  } catch {
    return { fields: {} }
  }
}

/**
 * Resolve one issuer's metadata, following what it points at.
 *
 * `seen` is what stops this being an infinite walk: an issuer A whose metadata names
 * issuer B whose metadata names A is unusual but legal, and without it the recursion
 * never returns and the connect button hangs.
 */
async function resolveIssuer(
  issuer: string,
  seen: Set<string>,
  deadline: number,
  depth = 0,
): Promise<OAuthEndpoints | undefined> {
  if (depth > 3 || Date.now() > deadline) return undefined

  for (const candidate of issuerCandidates(issuer)) {
    if (seen.has(candidate) || Date.now() > deadline) continue
    seen.add(candidate)

    const doc = await fetchJson(candidate)
    if (!doc) continue

    const direct = endpointsOf(doc)
    if (direct) return direct

    for (const next of issuersOf(doc)) {
      const nested = await resolveIssuer(next, seen, deadline, depth + 1)
      if (nested) return nested
    }
  }

  return undefined
}

/**
 * Find the OAuth endpoints for a server, following the same order the server does:
 * an anonymous initialize for the challenge, then whatever the challenge named, then
 * the resource document's own authorization servers, then the well-known paths.
 */
export async function discoverOAuth(serverUrl: string): Promise<OAuthEndpoints | undefined> {
  const deadline = Date.now() + DISCOVERY_TIMEOUT_MS
  const seen = new Set<string>()

  const { fields, resource } = await challengeOf(serverUrl)
  if (Date.now() > deadline) return undefined

  // A challenge that names the authorization endpoint directly is the shortest path.
  const stated = fields.authorization_uri ?? fields.authorization_url
  if (stated) {
    const direct = await resolveIssuer(stated, seen, deadline)
    if (direct) return direct
  }

  if (resource) {
    for (const issuer of issuersOf(resource)) {
      const nested = await resolveIssuer(issuer, seen, deadline)
      if (nested) return nested
    }
    const own = endpointsOf(resource)
    if (own) return own
  }

  for (const candidate of resourceCandidates(serverUrl)) {
    if (seen.has(candidate) || Date.now() > deadline) continue
    seen.add(candidate)

    const doc = await fetchJson(candidate)
    if (!doc) continue

    const own = endpointsOf(doc)
    if (own) return own

    for (const issuer of issuersOf(doc)) {
      const nested = await resolveIssuer(issuer, seen, deadline)
      if (nested) return nested
    }
  }

  const fallback = await resolveIssuer(originOf(serverUrl), seen, deadline)
  return fallback
}

/**
 * A server is connectable without the user supplying anything when its authorization
 * server publishes dynamic client registration (RFC 7591).
 *
 * The previous version of this asked only the host-wide
 * `/.well-known/oauth-authorization-server` on the server's own origin, which returned
 * false for every app that authorizes elsewhere — 29 of them, including Higgsfield —
 * and for every server keyed by path.
 */
export async function supportsZeroSetup(endpoint: string): Promise<boolean> {
  return (await discoverOAuth(endpoint))?.registrationEndpoint !== undefined
}