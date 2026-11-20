// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Session portability — the browser half of moving a conversation between installs.
 *
 * The bundle itself is written and read by `@zyraxon-ai/schema/session-port`, so
 * this module only talks to the running server: it asks for one session's bundle
 * and hands a bundle back for import. Both calls go through `fetch` with the same
 * Basic credentials the SDK uses, which keeps the panel working before the
 * generated client has been rebuilt with the new routes.
 */

import { authHeadersForServer } from "@/utils/server"
import type { ServerConnection } from "@/context/server"
import type { Bundle } from "@zyraxon-ai/schema/session-port"

type Server = Pick<ServerConnection.HttpBase, "url" | "username" | "password">

export function sessionAuthHeaders(server: Server): Record<string, string> {
  return authHeadersForServer(server)
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string }
    return body.message ?? body.error ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

/** Ask the server for one session's portable bundle. */
export async function fetchSessionBundle(server: Server, sessionID: string): Promise<Bundle> {
  const response = await fetch(`${server.url}/api/session/${encodeURIComponent(sessionID)}/export`, {
    headers: sessionAuthHeaders(server),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as Bundle
}

export type ImportOutcome = { id: string; restored: number; skipped: number }

/** Hand a bundle back so the server creates a session and restores its history. */
export async function importSessionBundle(input: {
  server: Server
  bundle: Bundle
  location?: { directory: string; workspaceID?: string }
}): Promise<ImportOutcome> {
  const response = await fetch(`${input.server.url}/api/session/import`, {
    method: "POST",
    headers: { "content-type": "application/json", ...sessionAuthHeaders(input.server) },
    body: JSON.stringify({ bundle: input.bundle, location: input.location }),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as ImportOutcome
}

/**
 * Hand the bundle to the browser as a download. The URL is released immediately,
 * because the download has already captured the bytes.
 */
export function downloadSessionBundle(bundle: Bundle, fileName: string, doc: Document = document) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }))
  const anchor = doc.createElement("a")
  anchor.href = url
  anchor.download = fileName
  doc.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
