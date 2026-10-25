/** How the server is installed, decided from `packages` and `remotes` in the registry. */
export type InstallKind = "remote_http" | "npx" | "uvx" | "docker" | "mcpb" | "nuget" | "unknown";
/**
 * What the user has to do to connect.
 *
 *   no_auth       nothing — press Connect and the tools are there
 *   oauth_browser a sign-in page opens in the browser
 *   api_key       a form asks for a key, or for a start command plus a client id
 *   url_input     the endpoint needs a value only the user has, such as their own instance
 */
export type ConnectKind = "no_auth" | "oauth_browser" | "api_key" | "url_input" | "unknown";
/**
 * How far the proof went, so a card never claims more than was checked.
 *
 *   full          initialize, tools/list and a read-only tools/call all answered
 *   tools_list    initialize and tools/list answered; no read-only tool to call
 *   auth_discovery a 401 was followed by a working discovery document or challenge
 *   launched      the package resolved and started, and then asked for its key
 *   declared      the endpoint is reachable but needs a user-supplied value
 */
export type VerificationLevel = "full" | "tools_list" | "auth_discovery" | "launched" | "declared" | "unknown";
/** One environment variable a server needs before it will run. */
export interface EnvField {
    name: string;
    description?: string;
    isSecret?: boolean;
}
/** Where a 401'ing server said its auth lives. */
export interface AuthInfo {
    metadata_url?: string;
    authorization_servers?: string[];
    registration_endpoint?: string;
    note?: string;
}
/** A server that answered a real MCP handshake, as the panel renders it. */
export interface VerifiedServer {
    /** the registry name, e.g. `io.modelcontextprotocol/everything` */
    id: string;
    /** a human title when the registry publishes one, otherwise the id */
    name: string;
    description: string;
    /** derived from the name and description, for the filter chips */
    category: string;
    install_kind: InstallKind;
    connect_kind: ConnectKind;
    verification: VerificationLevel;
    needs_login: boolean;
    /** the endpoint a remote server answered on */
    url?: string;
    /** the package a local server launches from, as the verifier proved it */
    package?: PackageRef;
    repository?: string;
    website?: string;
    version?: string;
    last_verified: string;
    tool_count: number;
    tool_names?: string[];
    env_schema?: EnvField[];
    auth?: AuthInfo;
}
/** A package a local server is launched from. */
export interface PackageRef {
    registry_type: "npm" | "pypi" | "oci" | "mcpb" | "nuget";
    identifier: string;
    version?: string;
}
/** The counts, computed once by the builder and shown identically in the panel and README. */
export interface CatalogSummary {
    generated: string;
    verified: number;
    failed: number;
    attempted: number;
    pass_rate: number;
    by_install_kind: Record<string, number>;
    by_connect_kind: Record<string, number>;
    by_verification: Record<string, number>;
    by_category: Record<string, number>;
    tools_total: number;
    failure_reasons: Record<string, number>;
}
