// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Integrations — the browser half of connecting an external system to the agent.
 *
 * The server already owns the registry and the credential store
 * (`@zyraxon-ai/core/integration`), and exposes them over the routes in
 * `@zyraxon-ai/protocol/groups/integration`. This module is the panel's side of
 * that conversation: list what is available, connect one with a key or through
 * OAuth, and disconnect it again.
 *
 * Every call goes through `fetch` with the same Basic credentials the SDK uses.
 * That keeps the panel working without regenerating the generated client, and it
 * is the same choice `session-port.ts` makes for the same reason.
 */

import { authHeadersForServer } from "@/utils/server"
import type { ServerConnection } from "@/context/server"
import type { Attempt, AttemptStatus, Info, Inputs, MethodID } from "@zyraxon-ai/schema/integration"

type Server = Pick<ServerConnection.HttpBase, "url" | "username" | "password">

export interface IntegrationLocation {
  directory?: string
  workspace?: string
}

export function integrationAuthHeaders(server: Server): Record<string, string> {
  return authHeadersForServer(server)
}

/**
 * The `location` query is a deep object: `location[directory]` and
 * `location[workspace]`. The routes scope an integration to a workspace, so the
 * panel has to pass the same location the rest of the settings use.
 */
export function integrationQuery(location?: IntegrationLocation): string {
  const params = new URLSearchParams()
  if (location?.directory) params.set("location[directory]", location.directory)
  if (location?.workspace) params.set("location[workspace]", location.workspace)
  const query = params.toString()
  return query ? `?${query}` : ""
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string }
    return body.message ?? body.error ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function endpoint(server: Server, path: string, location?: IntegrationLocation): string {
  return `${server.url}/api/integration${path}${integrationQuery(location)}`
}

/**
 * `Location.response` routes wrap their payload as `{ location, data }`; the
 * plain routes (`connect/key`, the attempt verbs) do not. Reading the wrong one
 * of the two is silent — the request succeeds and the caller gets `undefined` —
 * so unwrapping is explicit rather than assumed.
 */
function payload<T>(body: { data?: T } | T): T {
  return body !== null && typeof body === "object" && "data" in body ? (body as { data: T }).data : (body as T)
}

/** Every integration the server knows about, with its methods and connections. */
export async function listIntegrations(
  server: Server,
  location?: IntegrationLocation,
  signal?: AbortSignal,
): Promise<Info[]> {
  const response = await fetch(endpoint(server, "", location), {
    headers: integrationAuthHeaders(server),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
  return payload<Info[]>(await response.json())
}

/** One integration, or undefined when the id is not registered. */
export async function getIntegration(
  server: Server,
  integrationID: string,
  location?: IntegrationLocation,
): Promise<Info | undefined> {
  const response = await fetch(endpoint(server, `/${encodeURIComponent(integrationID)}`, location), {
    headers: integrationAuthHeaders(server),
  })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(await readError(response))
  return payload<Info | undefined>(await response.json())
}

/** Connect an integration that authenticates with a key or token. */
export async function connectIntegrationKey(input: {
  server: Server
  integrationID: string
  key: string
  label?: string
  location?: IntegrationLocation
}): Promise<void> {
  const response = await fetch(endpoint(input.server, `/${encodeURIComponent(input.integrationID)}/connect/key`, input.location), {
    method: "POST",
    headers: { "content-type": "application/json", ...integrationAuthHeaders(input.server) },
    body: JSON.stringify({ key: input.key, label: input.label }),
  })
  if (!response.ok) throw new Error(await readError(response))
}

/**
 * Begin an OAuth connection. The server returns an attempt with the URL the user
 * has to open; `pollIntegrationAttempt` then reports when it completes.
 */
export async function startIntegrationOAuth(input: {
  server: Server
  integrationID: string
  methodID: MethodID
  inputs?: Inputs
  label?: string
  location?: IntegrationLocation
}): Promise<Attempt> {
  const response = await fetch(
    endpoint(input.server, `/${encodeURIComponent(input.integrationID)}/connect/oauth`, input.location),
    {
      method: "POST",
      headers: { "content-type": "application/json", ...integrationAuthHeaders(input.server) },
      body: JSON.stringify({ methodID: input.methodID, inputs: input.inputs ?? {}, label: input.label }),
    },
  )
  if (!response.ok) throw new Error(await readError(response))
  return payload<Attempt>(await response.json())
}

/** The current state of an OAuth attempt. */
export async function integrationAttemptStatus(
  server: Server,
  attemptID: string,
  location?: IntegrationLocation,
): Promise<AttemptStatus> {
  const response = await fetch(endpoint(server, `/attempt/${encodeURIComponent(attemptID)}`, location), {
    headers: integrationAuthHeaders(server),
  })
  if (!response.ok) throw new Error(await readError(response))
  return payload<AttemptStatus>(await response.json())
}

/**
 * Finish a code-mode OAuth attempt. An attempt in auto mode completes on its own,
 * so the code is only required when the server asks for one.
 */
export async function completeIntegrationAttempt(input: {
  server: Server
  attemptID: string
  code?: string
  location?: IntegrationLocation
}): Promise<void> {
  const response = await fetch(endpoint(input.server, `/attempt/${encodeURIComponent(input.attemptID)}/complete`, input.location), {
    method: "POST",
    headers: { "content-type": "application/json", ...integrationAuthHeaders(input.server) },
    body: JSON.stringify({ code: input.code }),
  })
  if (!response.ok) throw new Error(await readError(response))
}

/** Abandon an attempt and release whatever the server held for it. */
export async function cancelIntegrationAttempt(
  server: Server,
  attemptID: string,
  location?: IntegrationLocation,
): Promise<void> {
  const response = await fetch(endpoint(server, `/attempt/${encodeURIComponent(attemptID)}`, location), {
    method: "DELETE",
    headers: integrationAuthHeaders(server),
  })
  if (!response.ok) throw new Error(await readError(response))
}

/** Remove a stored connection so the integration stops being usable. */
export async function disconnectIntegration(input: {
  server: Server
  credentialID: string
  location?: IntegrationLocation
}): Promise<void> {
  const query = integrationQuery(input.location)
  const response = await fetch(
    `${input.server.url}/api/credential/${encodeURIComponent(input.credentialID)}${query}`,
    {
      method: "DELETE",
      headers: integrationAuthHeaders(input.server),
    },
  )
  if (!response.ok) throw new Error(await readError(response))
}

/** Whether an integration currently has a usable connection. */
export function isConnected(info: Info): boolean {
  return info.connections.length > 0
}

/** The first method that can be started without an OAuth round trip, if any. */
export function keyMethod(info: Info) {
  return info.methods.find((method) => method.type === "key")
}

/** The first OAuth method, if the integration offers one. */
export function oauthMethod(info: Info) {
  return info.methods.find((method) => method.type === "oauth")
}
