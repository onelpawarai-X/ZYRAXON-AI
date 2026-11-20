import type { AppEntry } from "../catalog/seed";
import { type RegistryServer } from "./registry";
export interface Resolution {
    /** the server the app resolved to */
    server?: RegistryServer;
    /** the endpoint to connect to */
    url?: string;
    /** every candidate found, best first */
    candidates: RegistryServer[];
    /** why there is no result, when there is none */
    reason?: string;
}
/**
 * Find the best connectable server for an app.
 *
 * `preferredUrl` short-circuits the search entirely, and that is the normal path: the
 * catalog carries a verified endpoint for every app that has one, and reaching for the
 * registry instead would trade a known-good URL for a guessed one.
 */
export declare function resolveApp(app: AppEntry, preferredUrl?: string): Promise<Resolution>;
