import type { McpRuntime } from "./connect";
export interface HostBindings {
    /** live status of every configured server, from the app's sync state */
    mcpState: () => Record<string, {
        status: string;
    }> | undefined;
    /** every tool the agent can currently call */
    toolNames: () => string[];
    /** toggle a server on or off */
    toggle: (name: string) => Promise<unknown>;
    /** write a server into the project config and reload */
    updateConfig: (patch: Record<string, unknown>) => Promise<unknown> | unknown;
    /** ask the runtime to begin OAuth; it returns the URL the user must open */
    startAuth: (name: string) => Promise<string | undefined>;
}
/**
 * Build the runtime the panel talks to.
 *
 * The OAuth dance itself is done by ZYRAXON's own service
 * (packages/zyraxon/src/mcp/index.ts): it opens the browser, runs the local
 * callback on port 19876, stores the token and reconnects. Here we only need to
 * ask for it and surface the URL.
 */
export declare function bindRuntime(host: HostBindings): McpRuntime;
