export declare function parseArgs(argv: string[]): {
    help: boolean;
    dryRun: boolean;
    pages: number | undefined;
};
export declare const USAGE: string;
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
export declare function fetchPage(cursor: string | undefined, limit?: number): Promise<{
    servers: {
        name: string | undefined;
        title: string | undefined;
        description: string | undefined;
        version: string | undefined;
        remote: boolean;
        remotes: {
            type: string | undefined;
            url: string | undefined;
        }[];
    }[];
    cursor: string | undefined;
}>;
/** Keep only what the Hub actually shows or searches on. */
export declare function normalise(entry: unknown): {
    name: string | undefined;
    title: string | undefined;
    description: string | undefined;
    version: string | undefined;
    remote: boolean;
    remotes: {
        type: string | undefined;
        url: string | undefined;
    }[];
};
/** Walk the registry, yielding one flat list at the end. */
export declare function walk(maxPages: number | undefined): Promise<{
    servers: {
        name: string | undefined;
        title: string | undefined;
        description: string | undefined;
        version: string | undefined;
        remote: boolean;
        remotes: {
            type: string | undefined;
            url: string | undefined;
        }[];
    }[];
    pages: number;
}>;
export declare function main(argv: string[]): Promise<void>;