import type { AppEntry, AuthTier } from "./catalog/seed";
import { connectApp, countTools, describe, toServerConfig, type ConnectionState, type McpRuntime } from "./lib/connect";
import { McpClient } from "./lib/client";
import { bindRuntime } from "./lib/runtime";
import { type Resolution } from "./lib/resolve";
import { fetchPage, searchRegistry, supportsZeroSetup, walkRegistry, type OAuthEndpoints, type RegistryServer } from "./lib/registry";
import { McpHubPanel } from "./ui/mcp-hub-panel";
export interface McpHubPanelProps {
    runtime: McpRuntime;
    /** resolve an app to a real server when the catalog has no endpoint for it */
    resolve: (app: AppEntry) => Promise<Resolution>;
    onClose?: () => void;
}
export interface McpHub {
    id: string;
    title: string;
    /**
     * The panel, to be rendered as a component.
     *
     * It is exposed as the component itself and not as a factory that calls it. Calling a
     * Solid component as a plain function runs its body outside a reactive owner, so the
     * signals it creates are never disposed and the first render is not tracked — the
     * panel appeared to work and then stopped updating.
     */
    Panel: (props: McpHubPanelProps) => unknown;
    catalog: {
        all: () => AppEntry[];
        /** apps that sign in through a browser */
        browser: () => AppEntry[];
        /** apps that want an API key pasted in */
        key: () => AppEntry[];
        /** apps that connect with nothing at all */
        open: () => AppEntry[];
        local: () => AppEntry[];
        /** the tiers in display order, each already sorted */
        sections: () => {
            tier: AuthTier;
            title: string;
            hint: string;
            apps: AppEntry[];
        }[];
        categories: (apps?: AppEntry[]) => string[];
        tierOf: (app: AppEntry) => AuthTier;
        icon: (app: AppEntry, size?: number) => string;
    };
    registry: {
        page: typeof fetchPage;
        walk: typeof walkRegistry;
        search: typeof searchRegistry;
        /** the full discovery chain, for a panel that wants to say why sign-in is needed */
        discover: (serverUrl: string) => Promise<OAuthEndpoints | undefined>;
        supportsZeroSetup: typeof supportsZeroSetup;
    };
    connect: {
        app: typeof connectApp;
        config: typeof toServerConfig;
        tools: typeof countTools;
        describe: typeof describe;
    };
    /** a raw client, for tests and for callers that want to speak MCP directly */
    client: typeof McpClient;
    /** resolve an app to a real, connectable server from the registry */
    resolve: (app: AppEntry, preferredUrl?: string) => Promise<Resolution>;
    /** the server configs the host should write, for apps the user picked */
    serverConfigs: (ids: string[]) => Record<string, Record<string, unknown>>;
}
/** Build the hub. The host calls this once and keeps the result. */
export declare function createMcpHub(runtime: McpRuntime): McpHub;
export type { AppEntry, AuthTier, ConnectionState, McpRuntime, OAuthEndpoints, RegistryServer, Resolution };
export type { McpClientLike, McpLocalConfig, McpRemoteConfig } from "./lib/runtime";
export { McpHubPanel, bindRuntime };
export default createMcpHub;
