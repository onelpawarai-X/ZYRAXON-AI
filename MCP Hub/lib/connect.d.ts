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
} | {
    status: "connected";
    toolCount: number;
} | {
    status: "failed";
    error: string;
};
/** mirrors MCP.Status on the server, plus the message a failure carries */
export interface McpStatusEntry {
    status: "connected" | "failed" | "needs_auth" | "needs_client_registration" | "disabled";
    error?: string;
}
/**
 * The ZYRAXON runtime exposes the MCP service through the app context.
 * The Hub receives it as a dependency so the module stays testable on its own.
 */
export interface McpRuntime {
    /** live status of every configured server, keyed by name */
    statuses: () => Promise<Record<string, McpStatusEntry>>;
    /** every tool the agent can currently call */
    toolNames: () => Promise<string[]>;
    /** connect a server that the config already declares */
    connect: (name: string) => Promise<void>;
    /** declare a new server and bring it up, reporting whatever it settles on */
    addServer: (name: string, config: Record<string, unknown>) => Promise<McpStatusEntry | undefined>;
    /**
     * Run the OAuth handshake to completion.
     *
     * The server owns the browser: it opens the app's consent page in the real
     * profile that already holds the session, then blocks on its own local
     * callback. So this only settles once the user has clicked Allow.
     */
    authenticate: (name: string) => Promise<void>;
}
/** Build the ZYRAXON config entry for an app. */
export declare function toServerConfig(app: AppEntry, token?: string): Record<string, unknown>;
/** statuses that mean the server has stopped moving */
declare const SETTLED: Set<string>;
/** how long a transport gets to answer before we call it unreachable */
declare const CONNECT_TIMEOUT_MS: number;
/** a person has to read a consent page and press Allow, so allow minutes */
declare const AUTH_TIMEOUT_MS: number;
declare const POLL_MS: number;
declare function delay(ms: number): Promise<void>;
/**
 * Watch one server until it says something final.
 *
 * A connect attempt is asynchronous: the runtime opens the transport, negotiates
 * a session, and only then reports connected, needs_auth or failed. Reading the
 * status on the very next tick sees nothing useful, which is what used to leave
 * every card on "Connecting…" forever with no sign-in ever offered.
 */
export declare function waitForStatus(runtime: McpRuntime, name: string, timeoutMs?: number): Promise<McpStatusEntry>;
export interface ConnectOptions {
    /** bearer token, for apps that do not speak OAuth */
    token?: string;
    /** report intermediate states so a card can say "check your browser" */
    onProgress?: (state: ConnectionState) => void;
}
/**
 * Connect an app and return the state the card should render.
 *
 * The browser is never opened from here. The server does it, in the user's real
 * profile, which is why signing in leaves the app already logged in.
 */
export declare function connectApp(runtime: McpRuntime, app: AppEntry, options?: ConnectOptions): Promise<ConnectionState>;
/** Turn a server status into the state a card renders. */
declare function settle(runtime: McpRuntime, name: string, status: McpStatusEntry): ConnectionState;
/** How many of the agent's tools came from this server. */
export declare function countTools(runtime: McpRuntime, serverName: string): Promise<number>;
/**
 * A friendly one-line summary of a connection, used by the UI cards.
 */
export declare function describe(state: ConnectionState): string;
