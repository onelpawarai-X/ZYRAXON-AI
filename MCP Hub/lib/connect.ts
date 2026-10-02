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
  | { status: "needs_auth" }
  | { status: "connected"; toolCount: number }
  | { status: "failed"; error: string }

/** mirrors MCP.Status on the server, plus the message a failure carries */
export interface McpStatusEntry {
  status: "connected" | "failed" | "needs_auth" | "needs_client_registration" | "disabled"
  error?: string
}

/**
 * The ZYRAXON runtime exposes the MCP service through the app context.
 * The Hub receives it as a dependency so the module stays testable on its own.
 */
export interface McpRuntime {
  /** live status of every configured server, keyed by name */
  statuses: () => Promise<Record<string, McpStatusEntry>>
  /** every tool the agent can currently call */
  toolNames: () => Promise<string[]>
  /** connect a server that the config already declares */
  connect: (name: string) => Promise<void>
  /** declare a new server and bring it up, reporting whatever it settles on */
  addServer: (name: string, config: Record<string, unknown>) => Promise<McpStatusEntry | undefined>
  /**
   * Run the OAuth handshake to completion.
   *
   * The server owns the browser: it opens the app's consent page in the real
   * profile that already holds the session, then blocks on its own local
   * callback. So this only settles once the user has clicked Allow.
   */
  authenticate: (name: string) => Promise<void>
}

/** Build the ZYRAXON config entry for an app. */
export function toServerConfig(app: AppEntry, token?: string): Record<string, unknown> {
  if (app.kind === "local") {
    // local servers are declared by ZYRAXON's own default config; nothing to add
    return {}
  }
  // The 5s default is a per-request budget, and a first connect has to negotiate
  // a session and list every tool before it can report anything. Give hosted
  // servers room, or a slow one just times out and looks like a hang.
  const config: Record<string, unknown> = { type: "remote", url: app.url, enabled: true, timeout: 30_000 }
  if (token) {
    config.headers = { Authorization: `Bearer ${token}` }
  } else if (app.kind === "oauth") {
    config.oauth = app.scope ? { scope: app.scope } : {}
  }
  return config
}

/** statuses that mean the server has stopped moving */
const SETTLED = new Set(["connected", "failed", "needs_auth", "needs_client_registration"])

/** how long a transport gets to answer before we call it unreachable */
const CONNECT_TIMEOUT_MS = 45_000
/** a person has to read a consent page and press Allow, so allow minutes */
const AUTH_TIMEOUT_MS = 240_000
const POLL_MS = 400

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Watch one server until it says something final.
 *
 * A connect attempt is asynchronous: the runtime opens the transport, negotiates
 * a session, and only then reports connected, needs_auth or failed. Reading the
 * status on the very next tick sees nothing useful, which is what used to leave
 * every card on "Connecting…" forever with no sign-in ever offered.
 */
export async function waitForStatus(
  runtime: McpRuntime,
  name: string,
  timeoutMs = CONNECT_TIMEOUT_MS,
): Promise<McpStatusEntry> {
  const deadline = Date.now() + timeoutMs
  let last: McpStatusEntry = { status: "disabled" }
  while (Date.now() < deadline) {
    try {
      const entry = (await runtime.statuses())[name]
      if (entry) {
        last = entry
        if (SETTLED.has(entry.status)) return entry
      }
    } catch {
      /* the server may be restarting; keep watching */
    }
    await delay(POLL_MS)
  }
  return last
}

export interface ConnectOptions {
  /** bearer token, for apps that do not speak OAuth */
  token?: string
  /** report intermediate states so a card can say "check your browser" */
  onProgress?: (state: ConnectionState) => void
}

/**
 * Connect an app and return the state the card should render.
 *
 * The browser is never opened from here. The server does it, in the user's real
 * profile, which is why signing in leaves the app already logged in.
 */
export async function connectApp(runtime: McpRuntime, app: AppEntry, options: ConnectOptions = {}) {
  const { token, onProgress } = options
  try {
    const config = toServerConfig(app, token)
    onProgress?.({ status: "connecting" })

    // Local servers are already declared by ZYRAXON's own defaults, so there is
    // nothing to add; just wake the one that is configured.
    if (Object.keys(config).length === 0) {
      await runtime.connect(app.id)
      return settle(runtime, app.id, await waitForStatus(runtime, app.id))
    }

    // Adding brings the server up in the same round trip, so the response
    // already says whether it is live, broken, or waiting on a sign-in.
    const added = await runtime.addServer(app.id, config)
    const first = added ?? (await waitForStatus(runtime, app.id))
    if (first.status === "connected" || first.status === "failed") return settle(runtime, app.id, first)

    onProgress?.({ status: "needs_auth" })
    // authenticate blocks on the consent page, so watch status instead of the
    // request and let either one win. Status is the source of truth.
    const [settled] = await Promise.all([
      waitForStatus(runtime, app.id, AUTH_TIMEOUT_MS),
      runtime.authenticate(app.id).catch(() => undefined),
    ])
    return settle(runtime, app.id, settled)
  } catch (error) {
    const failed: ConnectionState = {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }
    onProgress?.(failed)
    return failed
  }
}

/** Turn a server status into the state a card renders. */
function settle(runtime: McpRuntime, name: string, status: McpStatusEntry): ConnectionState {
  if (status.status === "connected") return { status: "connected", toolCount: countTools(runtime, name) }
  if (status.status === "failed") return { status: "failed", error: status.error ?? "the server refused the connection" }
  if (status.status === "needs_auth" || status.status === "needs_client_registration")
    return { status: "failed", error: status.error ?? "sign-in was never completed" }
  return { status: "failed", error: `never finished connecting (last status: ${status.status})` }
}

/** How many of the agent's tools came from this server. */
export async function countTools(runtime: McpRuntime, serverName: string): Promise<number> {
  const prefix = serverName.replace(/[^a-zA-Z0-9_-]/g, "_") + "_"
  return (await runtime.toolNames()).filter((t) => t.startsWith(prefix)).length
}

/**
 * A friendly one-line summary of a connection, used by the UI cards.
 */
export function describe(state: ConnectionState): string {
  switch (state.status) {
    case "connected":
      return state.toolCount > 0
        ? `${state.toolCount} tools available to the agent`
        : "Connected and ready for the agent"
    case "needs_auth":
      return "Approve it in the browser that just opened"
    case "connecting":
      return "Connecting…"
    case "failed":
      return state.error
    default:
      return "Not connected"
  }
}
