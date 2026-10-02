// MCP Hub - live access to the official MCP registry.
//
// The registry at registry.modelcontextprotocol.io lists thousands of servers.
// We stream it into a local cache so the UI can search it instantly and work
// offline afterwards.

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

function normalise(entry: any): RegistryServer | undefined {
  const s = entry?.server ?? entry
  const name = s?.name
  if (typeof name !== "string" || name.length === 0) return undefined
  const remotes = Array.isArray(s?.remotes)
    ? s.remotes
        .filter((r: any) => typeof r?.url === "string")
        .map((r: any) => ({ type: String(r.type ?? "streamable-http"), url: String(r.url) }))
    : []
  return {
    name,
    title: typeof s?.title === "string" ? s.title : undefined,
    description: typeof s?.description === "string" ? s.description : undefined,
    version: typeof s?.version === "string" ? s.version : undefined,
    remotes,
    remote: remotes.length > 0,
    repository: typeof s?.repository?.url === "string" ? s.repository.url : undefined,
  }
}

/** Fetch one page of the registry. */
export async function fetchPage(opts: { cursor?: string; search?: string; limit?: number } = {}): Promise<RegistryPage> {
  const url = new URL(BASE)
  url.searchParams.set("limit", String(opts.limit ?? 100))
  if (opts.cursor) url.searchParams.set("cursor", opts.cursor)
  if (opts.search) url.searchParams.set("search", opts.search)

  const res = await fetch(url.toString(), { headers: { accept: "application/json" } })
  if (!res.ok) throw new Error(`registry returned ${res.status}`)
  const data: any = await res.json()
  const servers = (data?.servers ?? []).map(normalise).filter(Boolean) as RegistryServer[]
  return {
    servers,
    nextCursor: data?.metadata?.nextCursor,
    count: data?.metadata?.count,
  }
}

/**
 * Walk the whole registry. `onPage` is called for each batch so a caller can
 * show progress or persist as it goes. Stops on the first error.
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
    const page = await fetchPage({ cursor, limit: opts.limit })
    if (page.servers.length === 0) break
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
  const page = await fetchPage({ search: term, limit })
  return page.servers
}

/**
 * A server is connectable without asking the user for credentials when its
 * authorization server advertises dynamic client registration (RFC 7591).
 */
export async function supportsZeroSetup(endpoint: string): Promise<boolean> {
  try {
    const origin = new URL(endpoint).origin
    const res = await fetch(`${origin}/.well-known/oauth-authorization-server`, {
      headers: { accept: "application/json" },
    })
    if (!res.ok) return false
    const meta: any = await res.json()
    return typeof meta?.registration_endpoint === "string" && meta.registration_endpoint.length > 0
  } catch {
    return false
  }
}
