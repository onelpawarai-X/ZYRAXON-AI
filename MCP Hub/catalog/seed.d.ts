export type AuthKind = "none" | "oauth" | "token" | "local";
export interface AppEntry {
    id: string;
    name: string;
    description: string;
    category: string;
    kind: AuthKind;
    /** remote MCP endpoint, when the app is reached over the network */
    url?: string;
    /** where the user goes to create a token, when kind === "token" */
    tokenUrl?: string;
    /** scopes worth requesting by default */
    scope?: string;
    /** brand colour used by the UI */
    color: string;
    /** Simple Icons slug, used to render the app's real logo */
    icon?: string;
    /**
     * The product's own web domain, used to fetch its real favicon.
     * Simple Icons only covers a few thousand brands, so this is what guarantees a
     * real mark for everything else rather than a lettered tile.
     */
    iconDomain?: string;
    /**
     * Who actually runs the server, when it is not the vendor itself. Shown on the
     * card so nobody is surprised about handing an account to a third party.
     */
    via?: string;
    /** true when the server registers clients dynamically, so nothing is asked of the user */
    zeroSetup?: boolean;
}
/**
 * Render an app's real brand mark.
 *
 * Simple Icons first, because it gives a clean monochrome glyph for the brands it
 * covers. Then the product's own favicon, which is the only way to get a real
 * mark for everything else. A lettered tile is a last resort, not the norm.
 */
export declare function appIcon(app: AppEntry, size?: number): string;
/**
 * The vendor's own server, and a one-click sign-in.
 *
 * Each of these answered 401 with a `WWW-Authenticate` challenge and advertises
 * an authorization endpoint with dynamic client registration, which is what lets
 * the whole flow be: press Connect, allow in the browser, connected.
 */
export declare const zeroSetupApps: AppEntry[];
/**
 * The vendor runs the server, but it will not sign you in without a key.
 *
 * Each of these answered 401 and advertised no authorization endpoint, so
 * pressing Connect asks for a token instead of opening a browser.
 */
export declare const tokenApps: AppEntry[];
/**
 * MCP servers that run on this machine. ZYRAXON already ships four of these;
 * the list is here so the Hub can show them next to the remote apps.
 */
export declare const localApps: AppEntry[];
/**
 * Apps with no server of their own, reached through a hosted community server.
 *
 * These are the ones worth being careful about. The endpoint is real and was
 * probed, but it belongs to a third party rather than to the vendor, so an
 * account there may be needed. Each entry names who runs it.
 */
export declare const socialApps: AppEntry[];
export declare const allSeedApps: () => AppEntry[];
export declare const categories: (apps?: AppEntry[]) => string[];
