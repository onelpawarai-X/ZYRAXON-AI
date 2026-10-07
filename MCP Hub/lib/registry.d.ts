export interface RegistryServer {
    name: string;
    title?: string;
    description?: string;
    version?: string;
    /** remote endpoints, if the server is hosted */
    remotes: Array<{
        type: string;
        url: string;
    }>;
    /** true when the server advertises a hosted endpoint */
    remote: boolean;
    repository?: string;
}
export interface RegistryPage {
    servers: RegistryServer[];
    nextCursor?: string;
    count?: number;
}
/** Fetch one page of the registry. */
export declare function fetchPage(opts?: {
    cursor?: string;
    search?: string;
    limit?: number;
}): Promise<RegistryPage>;
/**
 * Walk the whole registry.
 *
 * `onPage` is called for each batch so a caller can show progress or persist as it goes.
 * A failure part-way stops the walk and returns what was already collected, because a
 * cache of 900 servers is worth keeping even when page 3 times out.
 */
export declare function walkRegistry(onPage: (page: RegistryPage, index: number) => void | Promise<void>, opts?: {
    maxPages?: number;
    limit?: number;
}): Promise<{
    pages: number;
    servers: number;
}>;
/** Search the registry for a phrase. */
export declare function searchRegistry(term: string, limit?: number): Promise<RegistryServer[]>;
/**
 * Search the local cache, which is the whole registry as it was last fetched.
 *
 * The registry's own `?search=` query parameter does not work: every request with it
 * hangs until the client gives up, at any page size, while `?limit=` on its own answers
 * in about a second. Search was therefore pointed at a parameter that had been dead since
 * it was written, and the panel's search box sat there spinning until it timed out.
 *
 * Searching the snapshot is both the only thing that works and the better answer for the
 * user: it is instant, it works offline, and it covers all 9,580 servers instead of the
 * first page of them.
 *
 * Returns undefined when the cache cannot be read, so the caller can fall back to the
 * registry rather than showing an empty list as though the registry were empty.
 */
export declare function searchCache(term: string, limit?: number): Promise<RegistryServer[] | undefined>;
/** The endpoints a handshake needs, in the shape the discovery order found them. */
export interface OAuthEndpoints {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    registrationEndpoint?: string;
    issuer?: string;
}
/**
 * Find the OAuth endpoints for a server, following the same order the server does:
 * an anonymous initialize for the challenge, then whatever the challenge named, then
 * the resource document's own authorization servers, then the well-known paths.
 */
export declare function discoverOAuth(serverUrl: string): Promise<OAuthEndpoints | undefined>;
/**
 * A server is connectable without the user supplying anything when its authorization
 * server publishes dynamic client registration (RFC 7591).
 *
 * The previous version of this asked only the host-wide
 * `/.well-known/oauth-authorization-server` on the server's own origin, which returned
 * false for every app that authorizes elsewhere — 29 of them, including Higgsfield —
 * and for every server keyed by path.
 */
export declare function supportsZeroSetup(endpoint: string): Promise<boolean>;
