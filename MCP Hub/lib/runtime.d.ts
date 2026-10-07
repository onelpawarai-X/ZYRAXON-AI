import type { McpRuntime, McpStatusEntry } from "./connect";
/** The slice of the generated client the Hub actually drives. */
export interface McpClientLike {
    mcp: {
        status: () => Promise<{
            data?: Record<string, {
                status: string;
                error?: string;
            }>;
        }>;
        add: (input: {
            name: string;
            config: unknown;
        }) => Promise<{
            data?: Record<string, McpStatusEntry>;
        }>;
        connect: (input: {
            name: string;
        }) => Promise<unknown>;
        disconnect: (input: {
            name: string;
        }) => Promise<unknown>;
        auth: {
            authenticate: (input: {
                name: string;
            }) => Promise<unknown>;
            /** forget stored tokens and client registration for a server */
            remove: (input: {
                name: string;
            }) => Promise<unknown>;
        };
    };
    experimental: {
        toolIDs: () => Promise<string[]>;
    };
}
export interface HostBindings {
    /** the connected ZYRAXON client */
    client: McpClientLike;
    /**
     * Write into the project config so a change survives a restart.
     *
     * This is a deep merge into the config on disk, which decides how a server is
     * removed: a key that is simply left out of the patch survives the merge, so the
     * config API cannot delete anything. `enabled: false` is the deletion.
     */
    updateConfig: (patch: Record<string, unknown>) => Promise<unknown> | unknown;
}
/**
 * Build the runtime the panel talks to.
 *
 * Everything a card displays is read back from the server, which owns the
 * transports. Declaring a server is the one thing done twice on purpose: the
 * config write makes it permanent, and the add call makes it live right now
 * instead of on the next restart.
 */
export declare function bindRuntime(host: HostBindings): McpRuntime;