// MCP Hub - a small, dependency-free MCP client.
//
// Speaks the Streamable HTTP transport directly: initialize, tools/list,
// tools/call. Used by the smoke test and by the panel when it needs to prove a
// server is alive before wiring it into the agent.

export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string }>
  isError?: boolean
}

export interface McpClientOptions {
  url: string
  /** bearer token, when the server needs one */
  token?: string
  timeoutMs?: number
  clientName?: string
}

/** Parse either a plain JSON body or an SSE stream into the JSON-RPC payload. */
function parseBody(text: string): any {
  const trimmed = text.trim()
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed)
  // event-stream: pull the last data: line that holds a JSON object
  const lines = trimmed.split(/\r?\n/).filter((l) => l.startsWith("data:"))
  for (let i = lines.length - 1; i >= 0; i--) {
    const payload = lines[i].slice(5).trim()
    if (payload.startsWith("{")) {
      try {
        return JSON.parse(payload)
      } catch {
        /* keep looking */
      }
    }
  }
  throw new Error(`could not parse MCP response: ${trimmed.slice(0, 120)}`)
}

export class McpClient {
  private sessionId?: string
  private nextId = 1
  private initialized = false

  constructor(private readonly opts: McpClientOptions) {}

  private get timeout() {
    return this.opts.timeoutMs ?? 20_000
  }

  private async rpc(method: string, params: unknown = {}): Promise<any> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    }
    if (this.opts.token) headers.authorization = `Bearer ${this.opts.token}`
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId

    try {
      const res = await fetch(this.opts.url, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
      })

      const sid = res.headers.get("mcp-session-id")
      if (sid) this.sessionId = sid

      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(`${method} failed: HTTP ${res.status} ${body.slice(0, 160)}`)
      }

      const text = await res.text()
      if (!text.trim()) return undefined
      const msg = parseBody(text)
      if (msg?.error) throw new Error(`${method} error: ${msg.error.message ?? JSON.stringify(msg.error)}`)
      return msg?.result
    } finally {
      clearTimeout(timer)
    }
  }

  async initialize(): Promise<{ serverName?: string; version?: string; protocolVersion?: string }> {
    const result = await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { roots: { listChanged: false }, sampling: {} },
      clientInfo: { name: this.opts.clientName ?? "mcp-hub", version: "1.0.0" },
    })
    this.initialized = true
    // the spec asks clients to confirm the handshake
    try {
      await this.rpc("notifications/initialized", {})
    } catch {
      /* optional for some servers */
    }
    return {
      serverName: result?.serverInfo?.name,
      version: result?.serverInfo?.version,
      protocolVersion: result?.protocolVersion,
    }
  }

  async listTools(): Promise<McpTool[]> {
    if (!this.initialized) await this.initialize()
    const result = await this.rpc("tools/list", {})
    return (result?.tools ?? []) as McpTool[]
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
    if (!this.initialized) await this.initialize()
    const result = await this.rpc("tools/call", { name, arguments: args })
    return {
      content: result?.content ?? [],
      isError: result?.isError === true,
    }
  }

  /** One-line text of a tool result, for logs and tests. */
  static text(result: McpCallResult): string {
    return result.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text as string)
      .join("\n")
  }
}
