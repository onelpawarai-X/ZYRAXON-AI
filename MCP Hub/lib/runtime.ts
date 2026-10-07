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
    /**
     * The generated client types this as `McpLocalConfig | McpRemoteConfig`, and `toServerConfig`
     * builds exactly one of those two shapes, so the Hub accepts the same union rather than
     * `unknown`. `unknown` is not assignable to the union, which broke the client binding.
     */
    add: (input: { name: string; config: McpLocalConfig | McpRemoteConfig }) => Promise<{ data?: Record<string, McpStatusEntry> }>
    connect: (input: { name: string }) => Promise<unknown>
    disconnect: (input: { name: string }) => Promise<unknown>
    auth: {
      authenticate: (input: { name: string }) => Promise<unknown>
      /**
       * Build the consent URL and report it without waiting for the callback.
       *
       * The Details panel's Generate button uses this: the person can copy the link, open
       * it in whatever browser holds their session, approve it there, and the loopback
       * still reaches ZYRAXON. That is the only way to finish a sign-in when the default
       * browser is not the one already signed in.
       */
      start: (input: { name: string }) => Promise<{ data?: { authorizationUrl?: string; oauthState?: string } }>
      /** whether a stored sign-in exists, so a refusal can be told apart from a bad key */
      hasTokens: (input: { name: string }) => Promise<{ data?: { hasTokens?: boolean } }>
      /** forget stored tokens and client registration for a server */
      remove: (input: { name: string }) => Promise<unknown>
    }
  }
  /**
   * The live tool ids, used only to count what a card contributed.
   *
   * Optional, and never required to match, because the generated client's `experimental`
   * group is an empty interface for a build that has no tool-ids route yet. Declaring a
   * property here would make the host's own (correct) type fail to assign, so the shape is
   * read through a lookup instead: a missing call means the count is zero, never a failure.
   */
  experimental?: {
    toolIDs?: () => Promise<string[] | { data?: string[] }>
  } & Record<string, unknown>
  global: {
    config: {
      /** just the browser-path key: the full config type is not needed by this shape, only this key */
      get: () => Promise<{ data?: { mcp_browser?: string } }>
    }
  }
}

/**
 * The two server shapes the generated client accepts.
 *
 * Declared here rather than imported so the Hub keeps its single seam: the host supplies
 * a client, the Hub never imports the SDK. These match the client's own config union.
 */
export type McpLocalConfig = {
  type: "local"
  command: string[]
  enabled: boolean
  timeout?: number
  environment?: Record<string, string>
}
export type McpRemoteConfig = {
  type: "remote"
  url: string
  enabled: boolean
  timeout?: number
  headers?: Record<string, string>
  oauth?:
    | false
    | {
        scope?: string
        authorizationUrl?: string
        tokenUrl?: string
        /** issued by the vendor's own console, for the publishers that refuse self-registration */
        clientId?: string
        clientSecret?: string
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

    toolNames: async () => {
      const raw = await host.client.experimental?.toolIDs?.()
      if (Array.isArray(raw)) return raw
      return (raw as { data?: string[] } | undefined)?.data ?? []
    },

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
     * The consent URL for a server, without opening anything.
     *
     * Returned rather than opened so the caller decides where it goes. The server is
     * already registered at this point, so the link is complete and can be handed to any
     * browser — which is what makes signing in possible when the account lives in a
     * different profile from the default browser.
     */
    startAuth: async (name) => {
      const data = await host.client.mcp.auth.start({ name })
      return data.data?.authorizationUrl ?? ""
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