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
 * The ZYRAXON runtime exposes MCP through the app context.
 *
 * The Hub receives it as a dependency, which keeps this module testable without a
 * running app behind it. Every member here is implemented by bindRuntime in
 * ./runtime, so a card can rely on all of them.
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
     * The server owns the browser: it opens the consent page in the real profile that
     * already holds the session, then blocks on its own loopback callback. So this only
     * settles once the user has clicked Allow.
     */
    authenticate: (name: string) => Promise<void>;
    /**
     * Detach a server for good.
     *
     * This takes the config entry out, stops the live transport, and — with
     * `forgetCredentials` — clears the stored tokens and any client registration. That
     * last part is what a user means by "disconnect my GitHub": leaving credentials
     * behind would silently sign the app back in on the next start.
     */
    disconnect: (name: string, options?: {
        forgetCredentials?: boolean;
    }) => Promise<void>;
}
/** Build the ZYRAXON config entry for an app. */
export declare function toServerConfig(app: AppEntry, token?: string): Record<string, unknown>;
/**
 * Watch one server until it reaches a state worth acting on.
 *
 * A connect is asynchronous: the runtime opens the transport, negotiates a session,
 * and only then reports connected, needs_auth or failed. Reading the status on the
 * next tick sees nothing useful, which is what used to leave every card on
 * "Connecting…" forever with no sign-in ever offered.
 *
 * `until` exists because "settled" means different things at different moments.
 * Before sign-in, needs_auth is the interesting answer and waiting past it is
 * wrong. After sign-in has started it is the answer already held, so the only useful
 * thing left to wait for is a state that is no longer needs_auth.
 */
export declare function waitForStatus(runtime: McpRuntime, name: string, timeoutMs?: number, until?: (status: McpStatusEntry["status"]) => boolean): Promise<McpStatusEntry>;
export interface ConnectOptions {
    /** bearer token, for apps that do not speak OAuth */
    token?: string;
    /** report intermediate states so a card can say "check your browser" */
    onProgress?: (state: ConnectionState) => void;
}
/**
 * Connect an app and return the state its card should render.
 *
 * The browser is never opened from here. The server does it, in the user's real
 * profile, which is why signing in leaves the app already logged in.
 */
export declare function connectApp(runtime: McpRuntime, app: AppEntry, options?: ConnectOptions): Promise<ConnectionState>;
/** How many of the agent's tools came from this server. */
export declare function countTools(runtime: McpRuntime, serverName: string): Promise<number>;
/**
 * A friendly one-line summary of a connection, used by the UI cards.
 */
export declare function describe(state: ConnectionState): string;