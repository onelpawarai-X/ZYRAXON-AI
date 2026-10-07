export type AuthKind = "none" | "oauth" | "token" | "local";
/**
 * How a server wants to be connected, in the order the user should meet them.
 *
 * The Hub renders these as sections, so the order here is the order on screen:
 * a browser sign-in first because it is one click, a pasted key next because it
 * is one field, and the servers that need nothing at the bottom.
 */
export type AuthTier = "browser" | "key" | "open" | "local";
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
    /**
     * OAuth endpoints, for the few vendors that publish no discovery document.
     *
     * A client that insists on discovery rejects these apps even though they are
     * perfectly reachable, so their stated endpoints are recorded here. Every value
     * is one the vendor documents; none is guessed.
     */
    oauth?: {
        authorizationUrl: string;
        tokenUrl: string;
    };
    /** scopes worth requesting by default */
    scope?: string;
    /**
     * A client ID this vendor only issues from its own developer console.
     *
     * Around a dozen publishers answer `/register` with a refusal or publish no
     * registration endpoint at all, because they only trust clients they created. The
     * catalog cannot create those, so the ID is supplied by whoever holds the account —
     * and the Details panel says exactly where to get one, which button to press, and
     * what to paste back.
     */
    clientId?: string;
    /**
     * The developer console for a vendor that issues clients by hand.
     *
     * Shown on the Details panel next to the field it belongs to, so nobody has to go
     * hunting for a page the app already knows about.
     */
    consoleUrl?: string;
    /**
     * The exact steps for connecting this app, in the order they are taken.
     *
     * The Details panel shows this instead of describing the flow in prose, because the
     * difference between "click Allow in the browser" and "paste the client ID back here"
     * is the difference between a working app and a dead one.
     */
    steps?: string[];
    /**
     * Why this app needs a credential, stated by the vendor where the vendor says it.
     *
     * Empty means the app needs nothing, which is the norm and not worth a note.
     */
    note?: string;
    /** brand colour used by the UI */
    color: string;
    /** Simple Icons slug, for a clean monochrome glyph */
    icon?: string;
    /**
     * The product's own domain, so its real favicon can be fetched.
     *
     * Simple Icons covers only a few thousand brands, and this is what guarantees a
     * real mark for everything else instead of a lettered tile.
     */
    iconDomain?: string;
    /**
     * Who runs the server when it is not the vendor. Shown on the card, because
     * handing an account to a third party should never be a surprise.
     */
    via?: string;
    /**
     * True when the server registers clients dynamically, so the user is asked for
     * nothing at all. Set only where a registration_endpoint was found.
     */
    zeroSetup?: boolean;
    /**
     * How to launch a local server. Most local servers ship with ZYRAXON and are
     * declared in the runtime's defaults, so this is only for the few fetched from
     * a package registry on demand.
     */
    command?: {
        command: string;
        args: string[];
    };
}
/**
 * An app's real brand mark.
 *
 * Simple Icons first, because it gives a clean glyph for the brands it covers.
 * Then the product's own favicon, which is the only way to get a real mark for
 * the long tail. A lettered tile is the last resort, not the norm.
 */
export declare function appIcon(app: AppEntry, size?: number): string;
/**
 * Browser sign-in. One click, then Allow in the browser.
 *
 * Every one of these answered 401 with an RFC 9728 challenge naming its own
 * metadata document, and that document carried a `registration_endpoint`, so the
 * client registers itself and the whole exchange completes without the user being
 * asked for anything.
 */
export declare const browserApps: AppEntry[];
/**
 * A pasted key. Press Connect, paste one token, done.
 *
 * These answered 401 with no discovery document, so the vendor issues a key and the
 * only honest way in is to ask for it. Google's endpoints, which do publish a
 * sign-in document, live in browserApps.
 */
export declare const keyApps: AppEntry[];
/**
 * Nothing to sign in to. These answered 200 on the very first request.
 *
 * Press Connect and it is connected. No browser, no key, no waiting.
 */
export declare const openApps: AppEntry[];
/**
 * MCP servers that run on this machine. ZYRAXON ships four of these; the list is
 * here so the Hub can show them beside the remote apps.
 */
export declare const localApps: AppEntry[];
/** Which section of the Hub an app belongs in. */
export declare function tierOf(app: AppEntry): AuthTier;
/**
 * Every app, in the order the user meets them: one-click browser sign-in, then a
 * pasted key, then the ones that need nothing, then the local servers.
 */
export declare const allSeedApps: () => AppEntry[];
/**
 * The catalog grouped for display, skipping empty sections.
 *
 * This is the ordering the panel renders, and it is the ordering the user asked
 * for: a browser sign-in is the easiest thing in the world, a pasted key is next,
 * and a server that needs nothing is last.
 */
export declare function catalogSections(): {
    tier: AuthTier;
    title: string;
    hint: string;
    apps: AppEntry[];
}[];
export declare const categories: (apps?: AppEntry[]) => string[];
