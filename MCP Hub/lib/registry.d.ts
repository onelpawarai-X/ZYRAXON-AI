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
 * Walk the whole registry. `onPage` is called for each batch so a caller can
 * show progress or persist as it goes. Stops on the first error.
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
 * A server is connectable without asking the user for credentials when its
 * authorization server advertises dynamic client registration (RFC 7591).
 */
export declare function supportsZeroSetup(endpoint: string): Promise<boolean>;
