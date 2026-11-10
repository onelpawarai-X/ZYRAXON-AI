#!/usr/bin/env node
export declare function parseArgs(argv: any): {
    help: any;
    dryRun: any;
    pages: number | undefined;
};
export declare const USAGE = "Rebuild the MCP registry cache.\n\n  --pages <n>   stop after n pages instead of walking the whole registry\n  --dry-run     report what would be written, without touching either file\n  --help        show this text\n";
/**
 * One page of the registry.
 *
 * Two things about this endpoint are not guessable from the docs and both were got wrong
 * before. Every entry arrives as `{ server, _meta }`, so reading `remotes` off the entry
 * itself finds nothing and every server ends up looking local. And the next cursor lives
 * in `metadata.nextCursor` in the body — the `x-mcp-registry-next-cursor` header is always
 * the literal string "null", which reads as "no more pages" and silently truncates the
 * cache to a single page.
 */
export declare function fetchPage(cursor: any, limit?: number): Promise<{
    servers: any;
    cursor: any;
}>;
/** Keep only what the Hub actually shows or searches on. */
export declare function normalise(entry: any): {
    name: any;
    title: any;
    description: any;
    version: any;
    remote: boolean;
    remotes: any;
};
/** Walk the registry, yielding one flat list at the end. */
export declare function walk(maxPages: any): Promise<{
    servers: any[];
    pages: number;
}>;
export declare function main(argv: any): Promise<void>;
