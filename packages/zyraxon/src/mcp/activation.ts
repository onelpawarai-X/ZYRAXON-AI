// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Which MCP servers a session has actually asked for.
 *
 * Every tool of every connected server used to be injected into every request. That made
 * the tool surface a function of how many servers happened to be up rather than of what
 * the task needed: a session that never mentioned Slack still carried Slack's schemas, and
 * the cost was paid on every single request.
 *
 * Injection is gated on this registry instead. A server reaches a session's tool list once
 * the session has activated it, which `mcp_connect` does as part of connecting, and
 * `mcp_disconnect` takes it back out. Nothing activates itself.
 *
 * The state is in memory and keyed by session, because activation belongs to the
 * conversation rather than to the machine: one session working on a browser task must not
 * change what a second session sees.
 */

/**
 * Sessions are short-lived, so a cap keeps a long-running process from accumulating keys.
 * Insertion order is the eviction order, and touching an entry moves it to the end.
 */
const MAX_SESSIONS = 500

interface SessionState {
  /** Servers whose tools belong in this session's list. */
  servers: Set<string>
  /** Whether the servers already up when the session first looked have been taken in. */
  adopted: boolean
}

const sessions = new Map<string, SessionState>()

function sessionState(sessionID: string): SessionState {
  const existing = sessions.get(sessionID)
  if (existing) {
    // Move to the end so the least recently used entry is the one evicted.
    sessions.delete(sessionID)
    sessions.set(sessionID, existing)
    return existing
  }

  if (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value
    if (oldest !== undefined) sessions.delete(oldest)
  }

  const created: SessionState = { servers: new Set(), adopted: false }
  sessions.set(sessionID, created)
  return created
}

export function activateServer(sessionID: string, server: string): void {
  if (!sessionID || !server) return
  sessionState(sessionID).servers.add(server)
}

export function deactivateServer(sessionID: string, server: string): void {
  if (!sessionID || !server) return
  sessions.get(sessionID)?.servers.delete(server)
}

/** A copy, so a caller cannot mutate the registry through the returned set. */
export function activatedServers(sessionID: string): Set<string> {
  return new Set(sessions.get(sessionID)?.servers ?? [])
}

/**
 * Take in the servers that were already up when this session first looked.
 *
 * A server the person enabled in their own config is a deliberate choice, so its tools
 * stay available without a `mcp_connect` round trip. The bundled servers no longer start
 * on their own, so they are absent here and stay out of the tool list until asked for.
 *
 * Adoption happens once per session. Without that, a server another session connects
 * would appear in this one's tool list part-way through the conversation — the same
 * unwanted injection, only delayed.
 */
export function adoptConnected(sessionID: string, servers: Iterable<string>): void {
  if (!sessionID) return
  const state = sessionState(sessionID)
  if (state.adopted) return
  state.adopted = true
  for (const server of servers) state.servers.add(server)
}
