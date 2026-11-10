#!/usr/bin/env node
export declare function parseArgs(argv: any): {
    help: any;
    apps: number;
    only: number | undefined;
};
export declare const USAGE = "Smoke test the Hub against live servers.\n\n  --apps <n>   how many of each kind to try (default 1)\n  --only <k>   just one kind: open, oauth, token or local\n  --help       show this text\n";
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
    calls: any[];
    statuses: () => Promise<{}>;
    toolNames: () => Promise<never[]>;
    connect: (name: any) => Promise<void>;
    addServer: (name: any) => Promise<{
        status: string;
        tools: number;
    }>;
    authenticate: (name: any) => Promise<void>;
    disconnect: (name: any) => Promise<void>;
};
/** One open server, end to end: initialize, then a real tool list. */
export declare function smokeOpen(app: any): Promise<{
    name: any;
    url: any;
    ms: number;
    server: any;
    protocol: string | undefined;
    tools: number;
    withinBudget: boolean;
}>;
/**
 * One OAuth server, as far as it can be checked without a human.
 *
 * The useful question is whether the sign-in page can be found at all, so that is what
 * gets tested, against the live server. Handing the connector a stub runtime instead only
 * proved that the stub agreed with itself: the stub's own `addServer` returned
 * "connected" and the test dutifully reported an app that demands a password as
 * connected. Nothing about the real server was exercised.
 */
export declare function smokeOauth(app: any): Promise<{
    name: any;
    url: any;
    ms: number;
    authorizeHost: string;
    crossHost: boolean;
    crossHostSafe: boolean;
    oneClick: boolean;
    issuer: string | undefined;
    withinBudget: boolean;
}>;
export declare function main(argv: any): Promise<void>;
