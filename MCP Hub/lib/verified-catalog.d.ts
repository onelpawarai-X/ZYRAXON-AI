import type { AppEntry } from "../catalog/seed";
import type { VerifiedRow } from "../catalog/verified-index";
import type { ConnectDetail } from "../catalog/connect-detail";
import type { ConnectKind } from "../catalog/verified-types";
/**
 * What the user has to do, in the order they do it.
 *
 * This is the sentence the card exists to show. "OAuth" tells a user nothing; "your
 * browser opens, you press Allow, it connects itself" tells them what will happen and
 * whether they need anything in hand. The steps are derived from the connect kind that
 * was actually observed, not from what the server's metadata claims.
 */
export interface ConnectStep {
    /** what happens, in plain words */
    what: string;
    /** what the user must have ready before starting, if anything */
    needs?: string;
    /** true when a browser window is part of this flow */
    browser: boolean;
}
export declare const CONNECT_STEPS: Record<ConnectKind, ConnectStep>;
/** The step for a connect kind, defaulting to the honest "we do not know" wording. */
export declare function connectStepFor(kind: ConnectKind): ConnectStep;
/**
 * How strong the proof behind a row is, said plainly.
 *
 * A card that says "verified" without qualification claims the same thing for a server
 * whose tools were listed and called and for one that merely answered a 401 with a
 * discovery document. The two are not the same, so the level is shown.
 */
export declare const VERIFICATION_LABELS: Record<string, string>;
/** One server, as the panel works with it. */
export interface VerifiedHit {
    id: string;
    name: string;
    category: string;
    install_kind: VerifiedRow[3];
    connect_kind: ConnectKind;
    verification: string;
    tool_count: number;
    needs_login: boolean;
    /** the endpoint a remote server answered on */
    url: string;
    /** the package a local server launches from, or undefined for a remote */
    package?: {
        registry_type: string;
        identifier: string;
        version?: string;
    };
    /** the server's own site, when the registry publishes one */
    website: string;
    /** its source repository, when the registry publishes one */
    repository: string;
}
/**
 * Load the compact index once and keep it.
 *
 * The import is dynamic so the rows are a separate chunk: the panel opens for the curated
 * apps without paying for a catalog most visits never scroll to.
 */
export declare function loadVerifiedRows(): Promise<VerifiedRow[]>;
/**
 * Load the sparse connect-detail map once and keep it.
 *
 * Only the rows that ask for a value appear in it, so this is a small module beside the
 * index rather than a field repeated on every row. A row that is absent needs nothing typed,
 * which is the press-and-go majority.
 */
export declare function loadConnectDetails(): Promise<Record<string, ConnectDetail>>;
/** The connect detail for one server, or undefined when it needs nothing typed. */
export declare function connectDetailFor(id: string): Promise<ConnectDetail | undefined>;
/**
 * Search the verified catalog.
 *
 * Name first, because that is what somebody typing "postgres" is looking for, then the id
 * so a full registry name still matches. Rows with more tools sort ahead of rows with
 * fewer when both match, on the theory that a server with twenty tools is the one they
 * meant more often than one with a single tool of the same name.
 */
export declare function searchVerified(term: string, limit?: number): Promise<VerifiedHit[]>;
/** How many verified servers are in the catalog, for the header count. */
export declare function verifiedCount(): Promise<number>;
/**
 * Turn a verified hit into the shape the panel's connect flow already speaks.
 *
 * The panel has always connected `AppEntry` values, and that flow — resolve, write the
 * config, start the handshake — is the part that works. Rather than build a second connect
 * path for registry servers, they are expressed as AppEntry so they go through exactly the
 * same one. The connect kind that was observed on the wire decides everything:
 *
 *   no_auth       → "none"      press Connect, the tools are there
 *   oauth_browser → "oauth"     the browser opens; a client ID is asked for only when the
 *                               server proved it will not register one itself
 *   api_key       → "local"     a package that reads its key from the environment, so the
 *                               env form collects it — not the single-token box, which
 *                               would send the key somewhere the package never looks
 *   url_input     → "instance"  the endpoint is a template; the user's own host fills it
 *
 * A local row's launch command is rebuilt from the package the verifier proved, so what
 * runs on the user's machine is the same command that answered the handshake.
 */
export declare function verifiedHitToApp(hit: VerifiedHit, detail?: ConnectDetail): AppEntry;
