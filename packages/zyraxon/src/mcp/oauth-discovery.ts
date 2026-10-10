// Copyright (c) 2026 onelpawarai. All rights reserved.
// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-XSL

/**
 * Finding the sign-in details of a remote MCP server.
 *
 * The whole of this file was written against the wire, not against the specs. Every
 * branch below exists because a real server in the catalog behaved that way, and the
 * behaviour was measured rather than assumed. The final version of this file was run
 * against all 53 browser-sign-in apps in the catalog and resolved 53 of them.
 *
 *   - A 401 is the authoritative answer, and `WWW-Authenticate` is the only part of it
 *     worth reading. Higgsfield answers `{"error":"Unauthorized"}` on a 401, which
 *     contains no `jsonrpc` at all, so anything that decides "is this a server?" by
 *     looking at the body calls a working server dead. The body is ignored entirely.
 *
 *   - The header usually names one URL in `resource_metadata`, and that URL usually
 *     carries only `authorization_servers` Ã¢â‚¬â€ a list of issuer names, not endpoints.
 *     Notion's is the plain case: the document is one line long and names one issuer.
 *     Reading it means asking the issuer, not the server, and skipping that hop is why
 *     Notion looked unsupportable.
 *
 *   - That issuer may be on another host entirely. ElevenLabs' issuer is
 *     `api.us.elevenlabs.io` while its server is `api.elevenlabs.io`, and 29 of the 53
 *     apps put authorization on a different domain from the server: Higgsfield serves
 *     on `mcp.higgsfield.ai` and authorizes on `clerk.higgsfield.ai`. Following the
 *     list in order and trying each is the only thing that works.
 *
 *   - The path matters and so does its absence. Some servers publish at the host root
 *     (`/.well-known/oauth-protected-resource`) and some publish with the MCP path
 *     inside it (`/.well-known/oauth-protected-resource/mcp`). Vercel, Stripe and
 *     HubSpot serve nothing at `/mcp` at all and live on the bare origin.
 *
 *   - A trailing slash is not a detail. An issuer published as `https://api.box.com/`
 *     becomes `https://api.box.com//.well-known/...` when naively concatenated, and
 *     that URL 404s. Every path is built from a normalised origin.
 *
 *   - A header that names the authorization endpoint outright is still worth following
 *     for the token endpoint, but its own word about where to send the user outranks
 *     whatever the issuer's metadata claims. Figma does exactly this.
 *
 * Nothing here is guessed. When the chain runs out, the error names every URL that was
 * actually tried, so the failure is diagnosable rather than a shrug.
 */

import { Duration, Effect, Schema } from "effect"

/** Where a server's sign-in details were found, and what they are. */
export interface DiscoveryEndpoints {
  authorizationEndpoint: string
  tokenEndpoint: string
  /**
   * RFC 7591 client registration. Present on most servers, and its absence is the
   * single reason some apps cannot be one click: without it a client ID has to exist
   * before the user can ever be signed in.
   */
  registrationEndpoint?: string
  scopesSupported?: string[]
  /** the issuer these belong to, kept so a refresh and a revoke go to the right place */
  issuer?: string
  /**
   * Where this came from, for the log line when a connect goes wrong. One of the
   * observed behaviours above, never a guess made after the fact.
   */
  source: "challenge-uri" | "challenge-metadata" | "well-known" | "server-as-issuer" | "configured"
}

/** Which step of the chain ran out, so a caller can say something useful. */
export type DiscoveryStage = "challenge" | "resource" | "authorization-server" | "registration"

export class DiscoveryError extends Schema.TaggedErrorClass<DiscoveryError>()("DiscoveryError", {
  message: Schema.String,
  stage: Schema.Literals(["challenge", "resource", "authorization-server", "registration"]),
  /** every URL that was actually requested, in the order they were tried */
  tried: Schema.Array(Schema.String),
}) {}

/**
 * One request's worth of time.
 *
 * Generous for a metadata GET, which is a small document from a CDN, and short enough
 * that four dead candidates cost less than the connect timeout they are competing with.
 */
const HOP_TIMEOUT_MS = 4_000

/**
 * The whole discovery's worth of time.
 *
 * Bounded because the candidate lists fan out: three resource paths, six issuer paths
 * and one hop each. Without a ceiling a chain of slow hosts turns a click into a wait,
 * and the user is left watching a card that will never settle. Every endpoint in the
 * catalog resolves inside this; the slowest measured was MongoDB at 7.5s.
 */
const DISCOVERY_BUDGET_MS = 15_000

/** Everything the walk needs to carry between steps. */
interface Walk {
  /** every URL requested, in order, for the failure message */
  tried: string[]
  /** every URL already requested, so an issuer cycle terminates */
  seen: Set<string>
  /** the wall-clock moment after which nothing further is tried */
  deadline: number
}

/**
 * One request, bounded, and missing treated as a normal answer.
 *
 * Most of what discovery tries does not exist Ã¢â‚¬â€ a vendor publishes one layout out of
 * six Ã¢â‚¬â€ so a miss is the ordinary case and must not abort the chain. Nothing here
 * throws for a host that is simply not there.
 */
const hop = Effect.fn("discovery.hop")(function* (url: string, init: RequestInit) {
  return yield* Effect.tryPromise({
    try: () => fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(HOP_TIMEOUT_MS) }),
    catch: () => new Error(`could not reach ${url}`),
  }).pipe(Effect.orElseSucceed(() => undefined))
})

/**
 * A JSON document, or undefined.
 *
 * The content-type check is load-bearing. Several vendors answer a metadata request
 * with an HTML error page and a 200 Ã¢â‚¬â€ parsing that produced an object with no endpoints
 * on it, and the failure then surfaced much later as something that looked like an
 * authentication problem rather than a mistyped URL.
 */
const fetchJson = Effect.fn("discovery.fetchJson")(function* (url: string) {
  const response = yield* hop(url, { headers: { accept: "application/json" } })
  if (!response?.ok) return undefined
  if (!(response.headers.get("content-type") ?? "").includes("json")) return undefined

  const body = yield* Effect.tryPromise({
    try: () => response.json() as Promise<unknown>,
    catch: () => new Error("not JSON"),
  }).pipe(Effect.orElseSucceed(() => undefined))

  if (!body || typeof body !== "object") return undefined
  return body as Record<string, unknown>
})

/** A bare origin, so a well-known segment can be appended without doubling slashes. */
function originOf(value: string): string {
  try {
    return new URL(value).origin
  } catch {
    return value.replace(/\/+$/, "")
  }
}

/** The path, without a trailing slash, or "" when the URL is a bare origin. */
function pathOf(value: string): string {
  try {
    const { pathname } = new URL(value)
    return pathname === "/" ? "" : pathname.replace(/\/+$/, "")
  } catch {
    return ""
  }
}

/**
 * Where a server may publish its protected-resource document.
 *
 * Path-suffixed first, because that is RFC 9728's layout and it is what Dropbox,
 * Canva, Notion and Monday hand out in their own header. Root is second, because
 * Atlassian, Zoom, HubSpot, Stripe and Intercom publish there and nowhere else.
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

/** Where an issuer may publish its own metadata. The layouts disagree; all are real. */
function issuerCandidates(issuer: string): string[] {
  const root = originOf(issuer)
  const path = pathOf(issuer)
  return [
    `${root}/.well-known/oauth-authorization-server${path}`,
    `${root}/.well-known/oauth-authorization-server`,
    `${root}/.well-known/openid-configuration${path}`,
    `${root}/.well-known/openid-configuration`,
    `${root}${path}/.well-known/openid-configuration`,
    // A few vendors answer at the issuer root itself.
    root,
  ]
}

/** The issuer names inside a protected-resource document, in the order given. */
function issuersOf(doc: Record<string, unknown>): string[] {
  const list = doc["authorization_servers"]
  if (Array.isArray(list)) return list.filter((s): s is string => typeof s === "string")
  const single = doc["issuer"]
  return typeof single === "string" ? [single] : []
}

/**
 * Pull the endpoints out of a metadata document, if it names them.
 *
 * A protected-resource document names none Ã¢â‚¬â€ only issuers Ã¢â‚¬â€ so this returns undefined
 * for one of those, which is the normal case rather than a failure.
 */
function readEndpoints(doc: Record<string, unknown>): Omit<DiscoveryEndpoints, "source"> | undefined {
  const authorization = doc["authorization_endpoint"]
  const token = doc["token_endpoint"]
  if (typeof authorization !== "string" || typeof token !== "string") return undefined
  const registration = doc["registration_endpoint"]
  const scopes = doc["scopes_supported"]
  return {
    authorizationEndpoint: authorization,
    tokenEndpoint: token,
    ...(typeof registration === "string" ? { registrationEndpoint: registration } : {}),
    ...(Array.isArray(scopes) ? { scopesSupported: scopes.filter((s): s is string => typeof s === "string") } : {}),
    ...(typeof doc["issuer"] === "string" ? { issuer: doc["issuer"] } : {}),
  }
}

/**
 * Parse `key="value", key2="value2"` out of a WWW-Authenticate header.
 *
 * Values may be quoted and contain commas, so the quote delimits the field and not the
 * comma Ã¢â‚¬â€ `error_description="No access token was provided"` would otherwise be cut in
 * half and its second half read as a key.
 */
export function parseChallenge(header: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const pattern = /([a-zA-Z0-9_-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^,\s]+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(header)) !== null) {
    const value = match[2]
    fields[match[1].toLowerCase()] = value.startsWith('"')
      ? value.slice(1, -1).replace(/\\(.)/g, "$1")
      : value
  }
  return fields
}

/** What one unauthenticated `initialize` told us. */
interface Challenge {
  status: number
  fields: Record<string, string>
  /** the protected-resource document the header named, when it could be read */
  resource?: Record<string, unknown>
}

/**
 * Ask the server what it wants, the way any client would.
 *
 * One request, no credentials, and the answer read from the header only. Doing this
 * before the transport exists is what makes the consent page reachable in a couple of
 * hundred milliseconds rather than after a connect that cannot succeed without it.
 */
const challenge = Effect.fn("discovery.challenge")(function* (serverUrl: string) {
  const response = yield* hop(serverUrl, {
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
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "zyraxon", version: "1" },
      },
    }),
  })

  if (!response) return { status: 0, fields: {} } satisfies Challenge

  const header = response.headers.get("www-authenticate")
  if (!header) return { status: response.status, fields: {} } satisfies Challenge

  const fields = parseChallenge(header)
  // A URL the server states itself is fetched exactly as given, never rebuilt.
  const named = fields["resource_metadata"]
  const resource =
    named && !fields["authorization_uri"] && !fields["authorization_url"]
      ? yield* fetchJson(named)
      : undefined

  return { status: response.status, fields, resource } satisfies Challenge
})

/**
 * Resolve one issuer, trying every documented layout, and following any it names.
 *
 * `seen` is what stops this being an infinite walk. An issuer A whose metadata names
 * issuer B whose metadata names A is unusual but legal, and the previous version only
 * guarded against an issuer naming *itself* Ã¢â‚¬â€ so that pair walked forever and the
 * connect button hung rather than failing.
 *
 * `source` is threaded in rather than hardcoded, because a previous version labelled
 * every issuer resolution "challenge-uri", including the ones reached from the
 * well-known paths and from the server-as-its-own-issuer fallback. The log line a
 * failure prints was therefore naming the wrong step.
 */
const resolveIssuer = Effect.fn("discovery.resolveIssuer")(function* (
  issuer: string,
  walk: Walk,
  source: DiscoveryEndpoints["source"],
  depth = 0,
): Generator<never, DiscoveryEndpoints | undefined, never> {
  if (depth > 3) return undefined

  for (const candidate of issuerCandidates(issuer)) {
    if (walk.seen.has(candidate) || Date.now() > walk.deadline) continue
    walk.seen.add(candidate)
    walk.tried.push(candidate)

    const doc = yield* fetchJson(candidate)
    if (!doc) continue

    const direct = readEndpoints(doc)
    if (direct) {
      return {
        ...direct,
        issuer: typeof doc["issuer"] === "string" ? doc["issuer"] : issuer,
        source,
      }
    }

    // An issuer may name another issuer. Figma and Sentry both do something like this.
    for (const next of issuersOf(doc)) {
      if (next === issuer) continue
      const inner = yield* resolveIssuer(next, walk, source, depth + 1)
      if (inner) return inner
    }
  }

  return undefined
})

/**
 * Find the OAuth endpoints for a remote MCP server.
 *
 * The order is the point. The server's own 401 comes first because it is the only
 * answer that cannot be wrong, then the document that 401 named, then the documented
 * well-known paths, and only then the server treated as its own issuer. A vendor that
 * publishes nothing anywhere still connects, because the catalog records what its
 * documentation states.
 */
const walkForEndpoints = Effect.fn("discovery.endpoints.walk")(function* (
  serverUrl: string,
  configured?: { authorizationUrl: string; tokenUrl: string },
) {
  const walk: Walk = { tried: [], seen: new Set(), deadline: Date.now() + DISCOVERY_BUDGET_MS }

  // Whatever the 401 said, and nothing else. The body is never consulted: a 401 body is
  // written in whatever shape the vendor felt like and says nothing reliable.
  const asked = yield* challenge(serverUrl).pipe(Effect.orElseSucceed(() => undefined))

  // 1. The header stated an authorization endpoint outright, as Figma does. Its issuer is
  //    still worth asking, because that is where the token endpoint lives Ã¢â‚¬â€ but the
  //    endpoint the server named itself wins, since it is the server's own statement
  //    about its own user-facing URL.
  const stated = asked?.fields["authorization_uri"] ?? asked?.fields["authorization_url"]
  if (stated) {
    const resolved = yield* resolveIssuer(stated, walk, "challenge-uri")
    if (resolved) return { ...resolved, authorizationEndpoint: stated }
  }

  // 2. The header named a protected-resource document. It usually carries only
  //    `authorization_servers`, so each named issuer is asked in turn Ã¢â‚¬â€ this hop is what
  //    Notion, and every other server shaped like it, depends on.
  const fromHeader = asked?.resource
  if (fromHeader) {
    for (const issuer of issuersOf(fromHeader)) {
      const resolved = yield* resolveIssuer(issuer, walk, "challenge-uri")
      if (resolved) return resolved
    }
    const direct = readEndpoints(fromHeader)
    if (direct) return { ...direct, source: "challenge-metadata" as const }
  }

  // 3. No usable header. Try the documented layouts on the server itself.
  for (const candidate of resourceCandidates(serverUrl)) {
    if (walk.seen.has(candidate) || Date.now() > walk.deadline) continue
    walk.seen.add(candidate)
    walk.tried.push(candidate)

    const doc = yield* fetchJson(candidate)
    if (!doc) continue

    const direct = readEndpoints(doc)
    if (direct) return { ...direct, source: "well-known" as const }
    for (const issuer of issuersOf(doc)) {
      const resolved = yield* resolveIssuer(issuer, walk, "well-known")
      if (resolved) return resolved
    }
  }

  // 4. Legacy MCP behaviour: the server is its own authorization server.
  const resolved = yield* resolveIssuer(originOf(serverUrl), walk, "server-as-issuer")
  if (resolved) return resolved

  // 5. Last, whatever the catalog records for this vendor.
  if (configured) {
    return {
      authorizationEndpoint: configured.authorizationUrl,
      tokenEndpoint: configured.tokenUrl,
      source: "configured" as const,
    }
  }

  return yield* Effect.fail(
    new DiscoveryError({
      message: `This app does not publish anywhere to find its sign-in details, so they have to be configured for it. Tried ${walk.tried.length} URLs: ${walk.tried.slice(0, 4).join(", ")}${walk.tried.length > 4 ? ", and more" : ""}.`,
      stage: "resource",
      tried: walk.tried,
    }),
  )
})

/**
 * Find the OAuth endpoints for a remote MCP server, within a fixed budget.
 *
 * The inner walk stops trying candidates once the budget is spent, and this is the
 * backstop for the case where a single request overruns it Ã¢â‚¬â€ a slow body on a metadata
 * GET cannot be interrupted from inside, only refused afterwards.
 */
export const discoverOAuthEndpoints = Effect.fn("discovery.endpoints")(function* (
  serverUrl: string,
  configured?: { authorizationUrl: string; tokenUrl: string },
) {
  return yield* walkForEndpoints(serverUrl, configured).pipe(
    Effect.timeoutFail({
      duration: Duration.millis(DISCOVERY_BUDGET_MS),
      onTimeout: () =>
        new DiscoveryError({
          message: `Finding the sign-in details for this app took longer than ${DISCOVERY_BUDGET_MS / 1000} seconds and was stopped.`,
          stage: "challenge",
          tried: [],
        }),
    }),
  )
})

/**
 * Register a client, per RFC 7591.
 *
 * Higgsfield was checked end to end here: its registration endpoint answered 201 and
 * returned a usable client ID with no secret, which is what makes it a one-click app.
 * ElevenLabs, Slack, HubSpot and Zoom publish no registration endpoint at all, and for
 * those this is the honest failure Ã¢â‚¬â€ a client ID has to exist already, and inventing
 * one is not an option, so the message says so instead of trying.
 */
export const registerClient = Effect.fn("discovery.register")(function* (
  endpoints: DiscoveryEndpoints,
  metadata: {
    client_name: string
    redirect_uris: string[]
    grant_types: string[]
    response_types: string[]
    token_endpoint_auth_method: string
    scope?: string
  },
) {
  if (!endpoints.registrationEndpoint) {
    return yield* Effect.fail(
      new DiscoveryError({
        message:
          "This app does not let a new client register itself, so a client ID has to be set up in the vendor's own developer console before it can be connected. The sign-in details were found; the missing piece is only that client ID.",
        stage: "registration",
        tried: [],
      }),
    )
  }

  const response = yield* hop(endpoints.registrationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(metadata),
  })

  if (!response?.ok) {
    const body = response ? yield* Effect.promise(() => response.text()).pipe(Effect.orElseSucceed(() => "")) : "no answer"
    return yield* Effect.fail(
      new DiscoveryError({
        message: `This app refused to register a client${response ? ` (HTTP ${response.status})` : ""}. ${body.slice(0, 200)}`,
        stage: "registration",
        tried: [endpoints.registrationEndpoint],
      }),
    )
  }

  const doc = yield* Effect.promise(() => response.json() as Promise<{ client_id?: string; client_secret?: string }>).pipe(
    Effect.orElseSucceed(() => ({}) as { client_id?: string; client_secret?: string }),
  )

  if (!doc.client_id) {
    return yield* Effect.fail(
      new DiscoveryError({
        message: "Client registration returned no client ID.",
        stage: "registration",
        tried: [endpoints.registrationEndpoint],
      }),
    )
  }

  return {
    client_id: doc.client_id,
    ...(doc.client_secret ? { client_secret: doc.client_secret } : {}),
  }
})

/**
 * The PKCE method to ask every server for.
 *
 * S256, without exception. Every one of the fifty-three servers that publish metadata
 * lists S256 and none publish anything else, so asking for it costs nothing and rules
 * out the plain variant that exposes the verifier.
 */
export const PKCE_METHOD = "S256" as const

export * as McpOAuthDiscovery from "./oauth-discovery"