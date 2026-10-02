// MCP Hub - adapts ZYRAXON's own MCP service to the McpRuntime interface the
// panel expects.
//
// This is the seam. The host passes in what it already has (sync state, the
// mcp toggle mutation and the config updater) and gets back a McpRuntime.
// Nothing in the host needs to know how the Hub works internally.

import type { McpRuntime, McpStatusEntry } from "./connect"

export interface HostBindings {
  /** live status of every configured server, from the app's sync state */
  mcpState: () => Record<string, { status: string }> | undefined
  /** every tool the agent can currently call */
  toolNames: () => string[]
  /** toggle a server on or off */
  toggle: (name: string) => Promise<unknown>
  /** write a server into the project config and reload */
  updateConfig: (patch: Record<string, unknown>) => Promise<unknown> | unknown
  /** ask the runtime to begin OAuth; it returns the URL the user must open */
  startAuth: (name: string) => Promise<string | undefined>
}

/**
 * Build the runtime the panel talks to.
 *
 * The OAuth dance itself is done by ZYRAXON's own service
 * (packages/zyraxon/src/mcp/index.ts): it opens the browser, runs the local
 * callback on port 19876, stores the token and reconnects. Here we only need to
 * ask for it and surface the URL.
 */
export function bindRuntime(host: HostBindings): McpRuntime {
  return {
    statuses: (): Record<string, McpStatusEntry> => {
      const raw = host.mcpState() ?? {}
      const out: Record<string, McpStatusEntry> = {}
      for (const [name, value] of Object.entries(raw)) {
        const status = value?.status
        out[name] = {
          status:
            status === "connected" || status === "failed" || status === "needs_auth" ||
            status === "needs_client_registration" || status === "disabled"
              ? status
              : "disabled",
        }
      }
      return out
    },

    toolNames: host.toolNames,

    toggle: async (name: string) => {
      await host.toggle(name)
    },

    /**
     * Adding a remote server means writing it into the config and letting the
     * runtime pick it up. The runtime then reports needs_auth, and the caller
     * asks for the URL below.
     */
    addServer: async (name: string, config: Record<string, unknown>) => {
      await host.updateConfig({ mcp: { [name]: config } })
    },

    /**
     * Ask the runtime for the authorization URL. The runtime starts its local
     * callback server and returns the URL the user must visit, which is exactly
     * the app's own consent page.
     */
    startAuth: async (name: string) => {
      const url = await host.startAuth(name)
      if (!url) throw new Error(`no authorization URL for ${name}`)
      return url
    },

    /** store a token for servers that do not support dynamic registration */
    setToken: async (name: string, token: string) => {
      await host.updateConfig({ mcp: { [name]: { headers: { Authorization: `Bearer ${token}` } } } })
    },
  }
}
