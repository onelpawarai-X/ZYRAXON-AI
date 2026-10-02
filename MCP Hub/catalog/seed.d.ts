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
    /** true when the server registers clients dynamically, so nothing is asked of the user */
    zeroSetup?: boolean;
}
/**
 * Render an app's real brand mark. Simple Icons is used because it carries one
 * consistent, recognisable glyph per product and degrades to the brand colour when
 * the network is unavailable — the panel still reads correctly offline.
 */
export declare function appIcon(app: AppEntry, size?: number): string;
/**
 * Apps that complete an OAuth flow without the user supplying a client id.
 * Verified against each server's /.well-known/oauth-authorization-server.
 */
export declare const zeroSetupApps: AppEntry[];
/**
 * Apps that need a token or a one-time OAuth client.
 * GitHub is here because its authorization server has no dynamic registration.
 */
export declare const tokenApps: AppEntry[];
/**
 * MCP servers that run on this machine. ZYRAXON already ships four of these;
 * the list is here so the Hub can show them next to the remote apps.
 */
export declare const localApps: AppEntry[];
/**
 * Social and communication apps.
 *
 * None of these have an official hosted MCP server, so they are reached through
 * community servers published in the registry, or through the provider's own
 * API with a token. Every one of them is in the registry, which is why the
 * panel can offer them without shipping a special case for each.
 */
export declare const socialApps: AppEntry[];
export declare const allSeedApps: () => AppEntry[];
export declare const categories: (apps?: AppEntry[]) => string[];
