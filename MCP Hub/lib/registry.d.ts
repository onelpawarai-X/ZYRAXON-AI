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
/** One request's worth of time. */
declare const HOP_TIMEOUT_MS = 3500;
/**
 * The whole discovery's worth of time.
 *
 * Bounded because discovery fans out over several candidates per hop, and without a
 * ceiling a chain of slow hosts turns a click into a wait. Every endpoint in the
 * catalog resolves inside two hops; the slowest measured was MongoDB at 7.5s across
 * three hops, so this is generous while still being a ceiling.
 */
declare const DISCOVERY_TIMEOUT_MS = 60000;
/** Fetch JSON, or nothing. A non-JSON or failed answer is a dead end, not an error. */
declare function fetchJson(url: string): Promise<Record<string, unknown> | undefined>;
declare function normalise(entry: unknown): RegistryServer | undefined;
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
/** The endpoints a handshake needs, in the shape the discovery order found them. */
export interface OAuthEndpoints {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    registrationEndpoint?: string;
    issuer?: string;
}
/**
 * The origin of a URL, with a plain string as a last resort.
 *
 * `issuer` values are not always URLs — a bare host appears in the wild — and a throw
 * here would take the whole discovery down rather than skip one candidate.
 */
declare function originOf(value: string): string;
/** The path of a URL, without its trailing slash, so it can be spliced into well-known. */
declare function pathOf(value: string): string;
/**
 * Where a protected resource document may live.
 *
 * The path-suffixed form comes first because a server serving several resources under
 * one host keys its metadata by path; the bare form is the fallback, and the trailing
 * slash variant is a real spelling some hosts serve instead.
 */
declare function resourceCandidates(serverUrl: string): string[];
/**
 * Where an authorization server's metadata may live, in the RFC 8414 order.
 *
 * Both the OAuth and the OpenID spellings are tried, with the path-suffixed variant of
 * each ahead of the host-wide one.
 */
declare function issuerCandidates(issuer: string): string[];
/** The authorization servers a metadata document points at. */
declare function issuersOf(doc: Record<string, unknown>): string[];
/** Pull the endpoints out of a metadata document, or nothing if it is not one. */
declare function endpointsOf(doc: Record<string, unknown>): OAuthEndpoints | undefined;
/**
 * Parse a WWW-Authenticate header into its parameters.
 *
 * Only the `Bearer` scheme's parameters matter here, and the quoted-string form has to
 * survive intact because `resource_metadata` arrives quoted and full of slashes.
 */
declare function parseChallenge(header: string): Record<string, string>;
/**
 * Ask the server what it wants, anonymously.
 *
 * The 401 and its `WWW-Authenticate` header are the authoritative answer; the body is
 * often a plain `{"error":"Unauthorized"}` with no JSON-RPC in it, which is why the
 * header is what gets read here.
 */
declare function challengeOf(serverUrl: string): Promise<{
    fields: Record<string, string>;
    resource?: Record<string, unknown>;
}>;
/**
 * Resolve one issuer's metadata, following what it points at.
 *
 * `seen` is what stops this being an infinite walk: an issuer A whose metadata names
 * issuer B whose metadata names A is unusual but legal, and without it the recursion
 * never returns and the connect button hangs.
 */
declare function resolveIssuer(issuer: string, seen: Set<string>, deadline: number, depth?: number): Promise<OAuthEndpoints | undefined>;
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