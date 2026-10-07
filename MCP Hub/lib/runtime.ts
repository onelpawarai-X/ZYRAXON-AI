// MCP Hub — adapts ZYRAXON's own MCP service to the McpRuntime the panel expects.
//
// This is the seam. The host passes in its client and its config writer and gets back
// an McpRuntime. Nothing in the host needs to know how the Hub works internally, and
// nothing here needs to know how the client is built.

import type { McpRuntime, McpStatusEntry } from "./connect"

const KNOWN = new Set(["connected", "failed", "needs_auth", "needs_client_registration", "disabled"])

/** The slice of the generated client the Hub actually drives. */
export interface McpClientLike {
  mcp: {
    status: () => Promise<{ data?: Record<string, { status: string; error?: string }> }>
    add: (input: { name: string; config: unknown }) => Promise<{ data?: Record<string, McpStatusEntry> }>
    connect: (input: { name: string }) => Promise<unknown>
    disconnect: (input: { name: string }) => Promise<unknown>
    auth: {
      authenticate: (input: { name: string }) => Promise<unknown>
      /** whether a stored sign-in exists, so a refusal can be told apart from a bad key */
      hasTokens: (input: { name: string }) => Promise<{ data?: { hasTokens?: boolean } }>
      /** forget stored tokens and client registration for a server */
      remove: (input: { name: string }) => Promise<unknown>
    }
  }
  experimental: {
    toolIDs: () => Promise<string[]>
  }
  global: {
    config: {
      /** just the browser-path key: the full config type is not needed by this shape, only this key */
      get: () => Promise<{ data?: { mcp_browser?: string } }>
    }
  }
}

export interface HostBindings {
  /** the connected ZYRAXON client */
  client: McpClientLike
  /**
   * Write into the project config so a change survives a restart.
   *
   * This is a deep merge into the config on disk, which decides how a server is
   * removed: a key that is simply left out of the patch survives the merge, so the
   * config API cannot delete anything. `enabled: false` is the deletion.
   */
  updateConfig: (patch: Record<string, unknown>) => Promise<unknown> | unknown
}

function toEntry(raw: { status: string; error?: string } | undefined): McpStatusEntry {
  if (!raw || !KNOWN.has(raw.status)) return { status: "disabled" }
  return { status: raw.status as McpStatusEntry["status"], ...(raw.error ? { error: raw.error } : {}) }
}

/**
 * Build the runtime the panel talks to.
 *
 * Everything a card displays is read back from the server, which owns the transports.
 * Declaring a server is the one thing done twice on purpose: the config write makes it
 * permanent, and the add call makes it live now instead of on the next restart.
 */
export function bindRuntime(host: HostBindings): McpRuntime {
  return {
    statuses: async () => {
      const raw = (await host.client.mcp.status()).data ?? {}
      return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, toEntry(value)]))
    },

    toolNames: async () => (await host.client.experimental.toolIDs()) ?? [],

    connect: async (name) => {
      await host.client.mcp.connect({ name })
    },

    addServer: async (name, config) => {
      // A patch of just this entry is enough. updateConfig deep merges into the file, so
      // the other connected servers are left alone.
      await host.updateConfig({ mcp: { [name]: config } })
      const added = (await host.client.mcp.add({ name, config })).data
      return added?.[name]
    },

    authenticate: async (name) => {
      await host.client.mcp.auth.authenticate({ name })
    },

    /**
     * Whether a sign-in already exists for this server.
     *
     * The server answers this from its own auth store, so it is true for a token app as
     * well as an OAuth one. `false` is what makes a connect attempt worth sending to the
     * browser; a server that already holds a credential needs the error reported to it
     * instead of another consent page.
     */
    hasTokens: async (name) => {
      try {
        const data = await host.client.mcp.auth.hasTokens({ name })
        return data.data?.hasTokens ?? false
      } catch {
        // A server that is not declared has nothing stored, and the caller only uses
        // this to decide whether a sign-in is worth attempting.
        return false
      }
    },

    /**
     * Detach a server and forget its stored credentials.
     *
     * Three parts, in this order. The live transport stops, the credentials go, and the
     * config entry is marked disabled so it does not reconnect on the next start.
     *
     * The config write is last on purpose. It cannot delete the key — a key missing
     * from a patch is left untouched by the merge — so it is disabled instead, and it
     * is written after the transport is already down. That ordering is what makes this
     * honest: the server is off before anything is reported, and a failure in the write
     * surfaces as a failure rather than as a Disconnect that quietly did nothing, which
     * is what this button used to be.
     */
    disconnect: async (name, options) => {
      await host.client.mcp.disconnect({ name })
      if (options?.forgetCredentials) {
        await host.client.mcp.auth.remove({ name })
      }
      await host.updateConfig({ mcp: { [name]: { enabled: false } } })
    },

    getBrowserPath: async () => {
      const data = await host.client.global.config.get()
      return data.data?.mcp_browser ?? ""
    },

    setBrowserPath: async (path) => {
      // A deep merge: writes just this key, leaves every other setting alone.
      await host.updateConfig({ mcp_browser: path.trim() })
    },
  }
}