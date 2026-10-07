import type { AppEntry } from "../catalog/seed.ts";
export declare function parseArgs(argv: string[]): {
    help: boolean;
    apps: number;
    only: number | undefined;
};
export declare const USAGE: string;
/**
 * A runtime that records what the connector asked for instead of holding real servers.
 *
 * Kept for tests that need to drive the connector's state machine rather than a live
 * server. The shape has to match McpRuntime exactly: a stub with `add` where the connector
 * calls `addServer` does not report a weaker result, it reports `runtime.addServer is not
 * a function` and every OAuth app looks broken for reasons that have nothing to do with it.
 *
 * It is not used by the checks below, because a stub that returns a status the real server
 * would never return turns the test into a conversation with itself.
 */
export declare function recordingRuntime(): {
    calls: (string | undefined)[][];
    statuses: () => Promise<Record<string, never>>;
    toolNames: () => Promise<never[]>;
    connect: (name: string) => Promise<void>;
    addServer: (name: string) => Promise<{
        status: string;
        tools: number;
    }>;
    authenticate: (name: string) => Promise<void>;
    disconnect: (name: string) => Promise<void>;
};
/** One open server, end to end: initialize, then a real tool list. */
export declare function smokeOpen(app: AppEntry): Promise<Record<string, unknown>>;
/**
 * One OAuth server, as far as it can be checked without a human.
 *
 * The useful question is whether the sign-in page can be found at all, so that is what
 * gets tested, against the live server. Handing the connector a stub runtime instead only
 * proved that the stub agreed with itself: the stub's own `addServer` returned
 * "connected" and the test dutifully reported an app that demands a password as
 * connected. Nothing about the real server was exercised.
 */
export declare function smokeOauth(app: AppEntry): Promise<Record<string, unknown>>;
export declare function main(argv: string[]): Promise<void>;