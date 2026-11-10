// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createZyraxonClient } from "@zyraxon-ai/sdk/v2/client"
import type { ServerConnection } from "@/context/server"
import { decode64 } from "@/utils/base64"

export function authTokenFromCredentials(input: { username?: string; password: string }) {
  return btoa(`${input.username ?? "zyraxon"}:${input.password}`)
}

/** The Authorization header for a server connection with credentials, or nothing when there are none. */
export function authHeadersForServer(
  server: Pick<ServerConnection.HttpBase, "username" | "password">,
): Record<string, string> {
  if (!server.password) return {}
  return {
    Authorization: `Basic ${authTokenFromCredentials({ username: server.username, password: server.password })}`,
  }
}

export function authFromToken(token: string | null) {
  const decoded = decode64(token ?? undefined)
  if (!decoded) return
  const separator = decoded.indexOf(":")
  if (separator === -1) return
  return {
    username: decoded.slice(0, separator) || "zyraxon",
    password: decoded.slice(separator + 1),
  }
}

export function createSdkForServer({
  server,
  ...config
}: Omit<NonNullable<Parameters<typeof createZyraxonClient>[0]>, "baseUrl"> & {
  server: ServerConnection.HttpBase
}) {
  const auth = authHeadersForServer(server)

  return createZyraxonClient({
    ...config,
    headers: {
      ...(config.headers instanceof Headers ? Object.fromEntries(config.headers.entries()) : config.headers),
      ...auth,
    },
    baseUrl: server.url,
  })
}
