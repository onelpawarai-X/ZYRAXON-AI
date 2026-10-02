import type { AppEntry } from "../catalog/seed";
import { McpClient } from "./client";
import { resolveApp, type Resolution } from "./resolve";
export { McpClient, resolveApp };
export type { Resolution };
export type ConnectionState = {
    status: "disconnected";
} | {
    status: "connecting";
} | {
    status: "needs_auth";
    authorizationUrl: string;
} | {
    status: "connected";
    toolCount: number;
} | {
    status: "failed";
    error: string;
};
export interface McpStatusEntry {
    status: "connected" | "failed" | "needs_auth" | "needs_client_registration" | "disabled";
}
/**
 * The ZYRAXON runtime exposes the MCP service through the app context.
 * The Hub receives it as a dependency so the module stays testable on its own.
 */
export interface McpRuntime {
    /** current status for every configured server, keyed by name */
    statuses: () => Record<string, McpStatusEntry>;
    /** names of every tool the agent can currently call */
    toolNames: () => string[];
    /** turn a server on or off */
    toggle: (name: string) => Promise<void>;
    /** begin the OAuth flow; resolves with the URL the user must visit */
    startAuth: (name: string) => Promise<string>;
    /** store a token for a server that does not support dynamic registration */
    setToken: (name: string, token: string) => Promise<void>;
    /** write a new server into the user's config and connect it */
    addServer: (name: string, config: Record<string, unknown>) => Promise<void>;
}
/** Build the ZYRAXON config entry for an app. */
export declare function toServerConfig(app: AppEntry, token?: string): Record<string, unknown>;
/**
 * Connect an app. Returns the state the UI should render.
 * For OAuth apps with dynamic registration this opens the browser and waits;
 * for token apps the caller passes the token in.
 */
export declare function connectApp(runtime: McpRuntime, app: AppEntry, token?: string): Promise<ConnectionState>;
/** How many of the agent's tools came from this server. */
export declare function countTools(runtime: McpRuntime, serverName: string): number;
/**
 * A friendly one-line summary of a connection, used by the UI cards.
 */
export declare function describe(state: ConnectionState): string;
