// MCP Hub - plugin entry.
//
// This is the only file ZYRAXON needs to know about. It registers the panel,
// the catalog and the registry client as one unit. Nothing outside "MCP Hub/"
// is modified: the runtime passes its MCP service in, and the Hub hands back a
// component plus the list of servers it wants configured.

import type { AppEntry } from "./catalog/seed"
import { allSeedApps, categories, zeroSetupApps, tokenApps, localApps } from "./catalog/seed"
import { connectApp, toServerConfig, countTools, describe, type McpRuntime, type ConnectionState } from "./lib/connect"
import { fetchPage, walkRegistry, searchRegistry, supportsZeroSetup, type RegistryServer } from "./lib/registry"
import { McpHubPanel } from "./ui/mcp-hub-panel"

export interface McpHubOptions {
  runtime: McpRuntime
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
  /** the server configs the host should write, for apps the user picked */
  serverConfigs: (ids: string[]) => Record<string, Record<string, unknown>>
}

/** Build the hub. The host calls this once and keeps the result. */
export function createMcpHub(runtime: McpRuntime): McpHub {
  return {
    id: "mcp-hub",
    title: "MCP Connect",
    Panel: (props: McpHubOptions) => McpHubPanel({ runtime: props.runtime ?? runtime, onClose: props.onClose }),
    catalog: {
      all: allSeedApps,
      zeroSetup: () => zeroSetupApps,
      token: () => tokenApps,
      local: () => localApps,
      categories: () => categories(),
    },
    registry: { page: fetchPage, walk: walkRegistry, search: searchRegistry, supportsZeroSetup },
    connect: { app: connectApp, config: toServerConfig, tools: countTools, describe },
    serverConfigs: (ids: string[]) =>
      Object.fromEntries(
        allSeedApps()
          .filter((a) => ids.includes(a.id))
          .map((a) => [a.id, toServerConfig(a)]),
      ),
  }
}

export type { AppEntry, McpRuntime, ConnectionState, RegistryServer }
export { McpHubPanel }
export default createMcpHub
