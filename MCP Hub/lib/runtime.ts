// MCP Hub - adapts ZYRAXON's own MCP service to the McpRuntime interface the
// panel expects.
//
// This is the seam. The host passes in its client and the config updater and
// gets back a McpRuntime. Nothing in the host needs to know how the Hub works
// internally, and nothing here knows how the client is built.

import type { McpRuntime, McpStatusEntry } from "./connect"

const KNOWN = new Set(["connected", "failed", "needs_auth", "needs_client_registration", "disabled"])

/** The slice of the generated client the Hub actually drives. */
export interface McpClientLike {
  mcp: {
    status: () => Promise<{ data?: Record<string, { status: string; error?: string }> }>
    add: (input: { name: string; config: unknown }) => Promise<{ data?: Record<string, McpStatusEntry> }>
    connect: (input: { name: string }) => Promise<unknown>
    auth: {
      authenticate: (input: { name: string }) => Promise<unknown>
    }
  }
  experimental: {
    toolIDs: () => Promise<string[]>
  }
}

export interface HostBindings {
  /** the connected ZYRAXON client */
  client: McpClientLike
  /** write a server into the project config so it survives a restart */
  updateConfig: (patch: Record<string, unknown>) => Promise<unknown> | unknown
}

function toEntry(raw: { status: string; error?: string } | undefined): McpStatusEntry {
  if (!raw || !KNOWN.has(raw.status)) return { status: "disabled" }
  return { status: raw.status as McpStatusEntry["status"], ...(raw.error ? { error: raw.error } : {}) }
}

/**
 * Build the runtime the panel talks to.
 *
 * Everything the cards display is read back from the server, which owns the
 * transports. Declaring a server is the one thing done twice on purpose: the
 * config write makes it permanent, and the add call makes it live right now
 * instead of on the next restart.
 */
export function bindRuntime(host: HostBindings): McpRuntime {
  return {
    statuses: async () => {
      const raw = (await host.client.mcp.status()).data ?? {}
      return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, toEntry(value)]))
    },

    toolNames: async () => (await host.client.experimental.toolIDs()) ?? [],

    connect: (name) => Promise.resolve(host.client.mcp.connect({ name })),

    addServer: async (name, config) => {
      await host.updateConfig({ mcp: { [name]: config } })
      const added = (await host.client.mcp.add({ name, config })).data
      return added?.[name]
    },

    authenticate: (name) => Promise.resolve(host.client.mcp.auth.authenticate({ name })),
  }
}
