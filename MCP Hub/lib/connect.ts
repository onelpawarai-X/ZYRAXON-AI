// MCP Hub - connect an app and hand its tools to the agent.
//
// The heavy lifting (transport, OAuth, dynamic client registration, token
// storage) already lives in ZYRAXON under packages/zyraxon/src/mcp. This module
// is the thin layer the Hub UI talks to, so nothing outside "MCP Hub/" changes.

import type { AppEntry } from "../catalog/seed"
import { McpClient } from "./client"
import { resolveApp, type Resolution } from "./resolve"

export { McpClient, resolveApp }
export type { Resolution }

export type ConnectionState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "needs_auth"; authorizationUrl: string }
  | { status: "connected"; toolCount: number }
  | { status: "failed"; error: string }

export interface McpStatusEntry {
  status: "connected" | "failed" | "needs_auth" | "needs_client_registration" | "disabled"
}

/**
 * The ZYRAXON runtime exposes the MCP service through the app context.
 * The Hub receives it as a dependency so the module stays testable on its own.
 */
export interface McpRuntime {
  /** current status for every configured server, keyed by name */
  statuses: () => Record<string, McpStatusEntry>
  /** names of every tool the agent can currently call */
  toolNames: () => string[]
  /** turn a server on or off */
  toggle: (name: string) => Promise<void>
  /** begin the OAuth flow; resolves with the URL the user must visit */
  startAuth: (name: string) => Promise<string>
  /** store a token for a server that does not support dynamic registration */
  setToken: (name: string, token: string) => Promise<void>
  /** write a new server into the user's config and connect it */
  addServer: (name: string, config: Record<string, unknown>) => Promise<void>
}

/** Build the ZYRAXON config entry for an app. */
export function toServerConfig(app: AppEntry, token?: string): Record<string, unknown> {
  if (app.kind === "local") {
    // local servers are declared by ZYRAXON's own default config; nothing to add
    return {}
  }
  const config: Record<string, unknown> = { type: "remote", url: app.url, enabled: true }
  if (token) {
    config.headers = { Authorization: `Bearer ${token}` }
  } else if (app.kind === "oauth") {
    config.oauth = app.scope ? { scope: app.scope } : {}
  }
  return config
}

/**
 * Connect an app. Returns the state the UI should render.
 * For OAuth apps with dynamic registration this opens the browser and waits;
 * for token apps the caller passes the token in.
 */
export async function connectApp(runtime: McpRuntime, app: AppEntry, token?: string): Promise<ConnectionState> {
  try {
    const config = toServerConfig(app, token)
    if (Object.keys(config).length === 0) {
      await runtime.toggle(app.id)
      const st = runtime.statuses()[app.id]
      return st?.status === "connected"
        ? { status: "connected", toolCount: countTools(runtime, app.id) }
        : { status: "failed", error: st?.status ?? "unknown" }
    }

    await runtime.addServer(app.id, config)

    if (token) {
      await runtime.setToken(app.id, token)
    }

    const status = runtime.statuses()[app.id]?.status
    if (status === "needs_auth" || status === "needs_client_registration") {
      const url = await runtime.startAuth(app.id)
      return { status: "needs_auth", authorizationUrl: url }
    }
    if (status === "connected") {
      return { status: "connected", toolCount: countTools(runtime, app.id) }
    }
    return { status: "connecting" }
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) }
  }
}

/** How many of the agent's tools came from this server. */
export function countTools(runtime: McpRuntime, serverName: string): number {
  const prefix = `${serverName}_`
  return runtime.toolNames().filter((t) => t.startsWith(prefix)).length
}

/**
 * A friendly one-line summary of a connection, used by the UI cards.
 */
export function describe(state: ConnectionState): string {
  switch (state.status) {
    case "connected":
      return `${state.toolCount} tools available to the agent`
    case "needs_auth":
      return "Finish sign-in in the browser"
    case "connecting":
      return "Connecting…"
    case "failed":
      return state.error
    default:
      return "Not connected"
  }
}
