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
        /**
         * The generated client types this as `McpLocalConfig | McpRemoteConfig`, and `toServerConfig`
         * builds exactly one of those two shapes, so the Hub accepts the same union rather than
         * `unknown`. `unknown` is not assignable to the union, which broke the client binding.
         */
        add: (input: {
            name: string;
            config: McpLocalConfig | McpRemoteConfig;
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
            /**
             * Build the consent URL and report it without waiting for the callback.
             *
             * The Details panel's Generate button uses this: the person can copy the link, open
             * it in whatever browser holds their session, approve it there, and the loopback
             * still reaches ZYRAXON. That is the only way to finish a sign-in when the default
             * browser is not the one already signed in.
             */
            start: (input: {
                name: string;
            }) => Promise<{
                data?: {
                    authorizationUrl?: string;
                    oauthState?: string;
                };
            }>;
            /** whether a stored sign-in exists, so a refusal can be told apart from a bad key */
            hasTokens: (input: {
                name: string;
            }) => Promise<{
                data?: {
                    hasTokens?: boolean;
                };
            }>;
            /** forget stored tokens and client registration for a server */
            remove: (input: {
                name: string;
            }) => Promise<unknown>;
        };
    };
    /**
     * The live tool ids, used only to count what a card contributed.
     *
     * Optional, and never required to match, because the generated client's `experimental`
     * group is an empty interface for a build that has no tool-ids route yet. Declaring a
     * property here would make the host's own (correct) type fail to assign, so the shape is
     * read through a lookup instead: a missing call means the count is zero, never a failure.
     */
    experimental?: {
        toolIDs?: () => Promise<string[] | {
            data?: string[];
        }>;
    } & Record<string, unknown>;
    global: {
        config: {
            /** just the browser-path key: the full config type is not needed by this shape, only this key */
            get: () => Promise<{
                data?: {
                    mcp_browser?: string;
                };
            }>;
        };
    };
}
/**
 * The two server shapes the generated client accepts.
 *
 * Declared here rather than imported so the Hub keeps its single seam: the host supplies
 * a client, the Hub never imports the SDK. These match the client's own config union.
 */
export type McpLocalConfig = {
    type: "local";
    command: string[];
    enabled: boolean;
    timeout?: number;
    environment?: Record<string, string>;
};
export type McpRemoteConfig = {
    type: "remote";
    url: string;
    enabled: boolean;
    timeout?: number;
    headers?: Record<string, string>;
    oauth?: false | {
        scope?: string;
        authorizationUrl?: string;
        tokenUrl?: string;
        /** issued by the vendor's own console, for the publishers that refuse self-registration */
        clientId?: string;
        clientSecret?: string;
    };
};
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
 * Everything a card displays is read back from the server, which owns the transports.
 * Declaring a server is the one thing done twice on purpose: the config write makes it
 * permanent, and the add call makes it live now instead of on the next restart.
 */
export declare function bindRuntime(host: HostBindings): McpRuntime;
