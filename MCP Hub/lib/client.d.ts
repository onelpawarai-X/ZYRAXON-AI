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
export declare class McpClient {
    private readonly opts;
    private sessionId?;
    private nextId;
    private initialized;
    constructor(opts: McpClientOptions);
    private get timeout();
    private headers;
    private send;
    private rpc;
    private notify;
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
    /** One-line text of a tool result, for logs and tests. */
    static text(result: McpCallResult): string;
}
