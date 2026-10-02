// MCP Hub - plugin entry.
//
// This is the only file ZYRAXON needs to know about. It registers the panel,
// the catalog and the registry client as one unit. Nothing outside "MCP Hub/"
// is modified: the runtime passes its MCP service in, and the Hub hands back a
// component plus the list of servers it wants configured.

import type { AppEntry } from "./catalog/seed"
import { allSeedApps, categories, zeroSetupApps, tokenApps, socialApps, localApps } from "./catalog/seed"
import { connectApp, toServerConfig, countTools, describe, type McpRuntime, type ConnectionState } from "./lib/connect"
import { McpClient } from "./lib/client"
import { bindRuntime } from "./lib/runtime"
import { resolveApp, type Resolution } from "./lib/resolve"
import { fetchPage, walkRegistry, searchRegistry, supportsZeroSetup, type RegistryServer } from "./lib/registry"
import { McpHubPanel } from "./ui/mcp-hub-panel"

export interface McpHubOptions {
  runtime: McpRuntime
  /** resolve an app to a real server when the catalog has no endpoint for it */
  resolve?: (app: AppEntry) => Promise<Resolution>
  /** show the panel in a dialog instead of a page */
  onClose?: () => void
}

export interface McpHub {
  id: string
  title: string
  /** the panel the host renders */
  Panel: (props: McpHubOptions) => unknown
  catalog: {
    all: () => AppEntry[]
    zeroSetup: () => AppEntry[]
    token: () => AppEntry[]
    social: () => AppEntry[]
    local: () => AppEntry[]
    categories: () => string[]
  }
  registry: {
    page: typeof fetchPage
    walk: typeof walkRegistry
    search: typeof searchRegistry
    supportsZeroSetup: typeof supportsZeroSetup
  }
  connect: {
    app: typeof connectApp
    config: typeof toServerConfig
    tools: typeof countTools
    describe: typeof describe
  }
  /** a raw client, for tests and for callers that want to speak MCP directly */
  client: typeof McpClient
  /** resolve an app to a real, connectable server from the registry */
  resolve: (app: AppEntry, preferredUrl?: string) => Promise<Resolution>
  /** the server configs the host should write, for apps the user picked */
  serverConfigs: (ids: string[]) => Record<string, Record<string, unknown>>
}

/** Build the hub. The host calls this once and keeps the result. */
export function createMcpHub(runtime: McpRuntime): McpHub {
  return {
    id: "mcp-hub",
    title: "MCP Connect",
    Panel: (props: McpHubOptions) =>
      McpHubPanel({
        runtime: props.runtime ?? runtime,
        resolve: props.resolve ?? ((app: AppEntry) => resolveApp(app, app.url)),
        onClose: props.onClose,
      }),
    catalog: {
      all: allSeedApps,
      zeroSetup: () => zeroSetupApps,
      token: () => tokenApps,
      social: () => socialApps,
      local: () => localApps,
      categories: () => categories(),
    },
    registry: { page: fetchPage, walk: walkRegistry, search: searchRegistry, supportsZeroSetup },
    connect: { app: connectApp, config: toServerConfig, tools: countTools, describe },
    client: McpClient,
    resolve: resolveApp,
    serverConfigs: (ids: string[]) =>
      Object.fromEntries(
        allSeedApps()
          .filter((a) => ids.includes(a.id))
          .map((a) => [a.id, toServerConfig(a)]),
      ),
  }
}

export type { AppEntry, McpRuntime, ConnectionState, RegistryServer }
export { McpHubPanel, bindRuntime }
export default createMcpHub
