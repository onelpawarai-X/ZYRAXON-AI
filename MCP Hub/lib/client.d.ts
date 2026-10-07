/**
 * One item of tool output.
 *
 * Deliberately wider than text. A server answering with an image, a video or an audio
 * clip is a normal MCP response, and `data` plus `mimeType` is how that arrives; an
 * earlier version of this type could only express `text`, which meant a media tool
 * call could be made but never inspected.
 */
export interface McpContent {
    type: string;
    text?: string;
    /** base64 payload, for the inline binary kinds */
    data?: string;
    mimeType?: string;
    /** a link instead of inline bytes */
    uri?: string;
    [key: string]: unknown;
}
export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: unknown;
}
export interface McpCallResult {
    content: McpContent[];
    isError?: boolean;
}
export interface McpServerInfo {
    serverName?: string;
    version?: string;
    protocolVersion?: string;
}
export interface McpClientOptions {
    url: string;
    /** bearer token, when the server needs one */
    token?: string;
    timeoutMs?: number;
    clientName?: string;
}
/** The protocol revision this client speaks. */
declare const PROTOCOL_VERSION = "2025-06-18";
/**
 * Pull the JSON-RPC payload out of a response body.
 *
 * A Streamable HTTP server may answer either with a plain JSON body or with an
 * `text/event-stream`, and the stream form is what most of the catalog uses.
 *
 * `data:` lines are accumulated per event rather than read one at a time: the spec lets
 * a single event split its payload over several `data:` lines, and taking only the last
 * one truncated every message that did that.
 */
declare function parseBody(text: string): unknown;
/** Read `result` off a JSON-RPC envelope, turning `error` into a thrown failure. */
declare function unwrap(method: string, payload: unknown): unknown;
export declare class McpClient {
    private sessionId?;
    private nextId;
    private initialized;
    private readonly opts;
    constructor(opts: McpClientOptions);
    private get timeout();
    private headers(): Record<string, string>;
    private send(body: unknown): Promise<Response>;
    private rpc(method: string, params?: unknown): Promise<unknown>;
    /**
     * Fire a notification.
     *
     * Kept separate from `rpc` because a notification is not a request: it carries no
     * `id` and expects no reply. Sending one through `rpc` put an `id` on
     * `notifications/initialized`, which a stateful server is entitled to treat as an
     * unanswered request.
     */
    private notify(method: string, params?: unknown): Promise<void>;
    /**
     * Open a session.
     *
     * The server considers the session usable only once `notifications/initialized`
     * lands, so that notification is awaited rather than fired and forgotten: a
     * stateful transport will reject the `tools/list` that races ahead of it.
     */
    initialize(): Promise<McpServerInfo>;
    listTools(): Promise<McpTool[]>;
    callTool(name: string, args?: Record<string, unknown>): Promise<McpCallResult>;
    /**
     * End the session.
     *
     * A session id is only really released by a DELETE, so closing a client without one
     * leaves the server holding a session until it times out.
     */
    close(): Promise<void>;
    /**
     * One-line text of a tool result, for logs and tests.
     */
    static text(result: McpCallResult): string;
}