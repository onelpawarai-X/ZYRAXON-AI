// Copyright (c) 2026 onelpawarai. All rights reserved.
// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X

import { withTimeout } from "@/util/timeout"

const DISCOVERY_TIMEOUT_MS = 10_000

export interface DiscoveryEndpoints {
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint?: string
}

export class DiscoveryError extends Error {
  constructor(
    message: string,
    readonly stage: "resource" | "authorization-server" | "registration",
  ) {
    super(message)
    this.name = "DiscoveryError"
  }
}

/**
 * Fetch a JSON document, treating a non-200 or a non-JSON body as a failure.
 *
 * The content-type check matters: several of these endpoints answer a request with
 * an HTML error page and a 200, which is indistinguishable from a valid document
 * unless the type is looked at. Parsing that as JSON produced an object with no
 * endpoints on it and a confusing downstream failure.
 */
async function fetchJson(url: string): Promise<unknown> {
  const response = await withTimeout(
    fetch(url, { headers: { accept: "application/json" }, redirect: "follow" }),
    DISCOVERY_TIMEOUT_MS,
  )

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const type = response.headers.get("content-type") ?? ""
  if (!type.includes("json")) throw new Error(`expected JSON, received "${type || "nothing"}"`)
  return response.json()
}

/**
 * Normalise an issuer for use as a base.
 *
 * A trailing slash is not cosmetic: `https://api.box.com/` and `https://api.box.com`
 * are different strings, and appending a well-known segment to the first produces
 * `//.well-known/...`, which no server answers. Box ships its authorization server
 * with a trailing slash, so every discovery attempt against it 404s.
 */
function baseUrl(value: string): string {
  return value.replace(/\/+$/, "")
}

/**
 * The path of a URL, or "" when there is none.
 *
 * RFC 8414 inserts the well-known segment *before* the path and RFC 9728 puts it
 * after. Both are tried, because servers implement either one.
 */
function urlPath(value: string): string {
  try {
    const { pathname } = new URL(value)
    return pathname === "/" ? "" : pathname.replace(/\/+$/, "")
  } catch {
    return ""
  }
}

async function fetchProtectedResource(serverUrl: string): Promise<{ servers: string[] }> {
  const { origin } = new URL(serverUrl)
  const path = urlPath(serverUrl)

  const candidates = [
    `${origin}/.well-known/oauth-protected-resource${path}`,
    `${origin}/.well-known/oauth-protected-resource`,
  ]

  let lastError: unknown
  for (const candidate of candidates) {
    try {
      const doc = (await fetchJson(candidate)) as {
        authorization_servers?: string[]
        authorization_server?: string
      }
      const servers = doc.authorization_servers ?? (doc.authorization_server ? [doc.authorization_server] : [])
      if (servers.length) return { servers }
      lastError = new Error("the document named no authorization server")
    } catch (error) {
      lastError = error
    }
  }

  throw new DiscoveryError(
    `This server does not publish OAuth discovery metadata (${String(lastError)}), so its endpoints have to be configured for it.`,
    "resource",
  )
}

async function fetchAuthorizationServer(issuer: string): Promise<Record<string, unknown>> {
  const origin = baseUrl(issuer)
  const path = urlPath(issuer)

  // Some servers publish the metadata document on the issuer itself.
  const candidates = [
    `${origin}/.well-known/oauth-authorization-server${path}`,
    `${origin}/.well-known/openid-configuration${path}`,
    origin,
  ]

  let lastError: unknown
  for (const candidate of candidates) {
    try {
      const doc = (await fetchJson(candidate)) as Record<string, unknown>
      if (typeof doc.authorization_endpoint === "string" && typeof doc.token_endpoint === "string") return doc
      lastError = new Error("the document named no authorization or token endpoint")
    } catch (error) {
      lastError = error
    }
  }

  throw new DiscoveryError(
    `The authorization server could not be read (${String(lastError)}), so its endpoints have to be configured for this app.`,
    "authorization-server",
  )
}

/**
 * Resolve the OAuth endpoints for a remote MCP server.
 *
 * The SDK's own discovery rejects a family of servers that work in practice: a
 * trailing slash on the issuer, a resource identifier that differs from the request
 * URL, and a server that names its authorization server without a metadata URL.
 * Each produced either "Protected Resource Metadata not found" or "Incompatible
 * auth server" on an endpoint that was reachable and correct.
 *
 * Doing it here means a genuine failure is reported as a genuine failure, and a
 * server that does publish usable metadata is used rather than written off.
 */
export async function discoverOAuthEndpoints(serverUrl: string): Promise<DiscoveryEndpoints> {
  const { servers } = await fetchProtectedResource(serverUrl)

  // Prefer an issuer whose metadata actually resolves over one that 404s.
  const failures: string[] = []
  for (const issuer of servers) {
    try {
      const doc = await fetchAuthorizationServer(issuer)
      return {
        authorizationEndpoint: doc.authorization_endpoint as string,
        tokenEndpoint: doc.token_endpoint as string,
        registrationEndpoint: doc.registration_endpoint as string | undefined,
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }

  throw new DiscoveryError(
    `The server named an authorization server but none could be read: ${failures.join("; ")}`,
    "authorization-server",
  )
}

/**
 * Register a client dynamically, where the server supports it.
 *
 * A server that does not advertise registration is not an error here — the caller
 * falls back to a configured client ID, which is what happens with Slack, Box,
 * Zoom, Figma and several others.
 */
export async function registerClient(
  endpoints: DiscoveryEndpoints,
  metadata: {
    client_name: string
    redirect_uris: string[]
    grant_types: string[]
    response_types: string[]
    token_endpoint_auth_method: string
    scope?: string
  },
): Promise<{ client_id: string; client_secret?: string }> {
  if (!endpoints.registrationEndpoint) {
    throw new DiscoveryError(
      "This server does not offer dynamic client registration, so a client ID and secret must be configured for it.",
      "registration",
    )
  }

  const response = await withTimeout(
    fetch(endpoints.registrationEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(metadata),
    }),
    DISCOVERY_TIMEOUT_MS,
  )

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new DiscoveryError(
      `Client registration was refused (HTTP ${response.status}). ${body.slice(0, 200)}`,
      "registration",
    )
  }

  const doc = (await response.json()) as { client_id?: string; client_secret?: string }
  if (!doc.client_id) throw new DiscoveryError("Client registration returned no client ID.", "registration")
  return { client_id: doc.client_id, client_secret: doc.client_secret }
}

export * as McpOAuthDiscovery from "./oauth-discovery"