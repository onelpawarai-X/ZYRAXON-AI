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
 * `preferredUrl` short-circuits the search when the catalog already knows the
 * endpoint (Notion, Linear and the other first-party servers).
 */
export declare function resolveApp(app: AppEntry, preferredUrl?: string): Promise<Resolution>;
