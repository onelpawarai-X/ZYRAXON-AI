import type { AppEntry } from "../catalog/seed";
import { searchRegistry, type RegistryServer } from "./registry";
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
/** Words that suggest a server is a good match for an app. */
declare const GOOD: string[];
/** Words that suggest it is not. */
declare const BAD: string[];
/**
 * Rank a candidate against one search term.
 *
 * A hosted endpoint is worth a lot: it is the difference between one click and asking
 * the user to install something. Name matches beat title matches beat description
 * matches, and a short specific name beats a long one, because "notion" should not lose
 * to "notion-advanced-example-mcp-server".
 */
declare function score(server: RegistryServer, term: string): number;
/**
 * Find the best connectable server for an app.
 *
 * `preferredUrl` short-circuits the search entirely, and that is the normal path: the
 * catalog carries a verified endpoint for every app that has one, and reaching for the
 * registry instead would trade a known-good URL for a guessed one.
 */
export declare function resolveApp(app: AppEntry, preferredUrl?: string): Promise<Resolution>;