export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: unknown;
}
export interface McpCallResult {
    content: Array<{
        type: string;
        text?: string;
    }>;
    isError?: boolean;
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
    private rpc;
    initialize(): Promise<{
        serverName?: string;
        version?: string;
        protocolVersion?: string;
    }>;
    listTools(): Promise<McpTool[]>;
    callTool(name: string, args?: Record<string, unknown>): Promise<McpCallResult>;
    /** One-line text of a tool result, for logs and tests. */
    static text(result: McpCallResult): string;
}
