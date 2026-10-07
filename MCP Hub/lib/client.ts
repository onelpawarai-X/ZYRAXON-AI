// MCP Hub — a small, dependency-free MCP client.
//
// Speaks the Streamable HTTP transport directly: initialize, notifications/initialized,
// tools/list, tools/call. Used by the smoke test, and by the panel whenever it needs to
// prove a server is alive before handing it to the agent.

/**
 * One item of tool output.
 *
 * Deliberately wider than text. A server answering with an image, a video or an audio
 * clip is a normal MCP response, and `data` plus `mimeType` is how that arrives; an
 * earlier version of this type could only express `text`, which meant a media tool
 * call could be made but never inspected.
 */
export interface McpContent {
  type: string
  text?: string
  /** base64 payload, for the inline binary kinds */
  data?: string
  mimeType?: string
  /** a link instead of inline bytes */
  uri?: string
  [key: string]: unknown
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface McpCallResult {
  content: McpContent[]
  isError?: boolean
}

export interface McpServerInfo {
  serverName?: string
  version?: string
  protocolVersion?: string
}

export interface McpClientOptions {
  url: string
  /** bearer token, when the server needs one */
  token?: string
  timeoutMs?: number
  clientName?: string
}

/** The protocol revision this client speaks. */
const PROTOCOL_VERSION = "2025-06-18"

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
function parseBody(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed)

  let payload: string | undefined
  for (const line of trimmed.split(/\r?\n/)) {
    // A blank line ends the event, so whatever was accumulated is the whole message.
    if (line.trim() === "") {
      if (payload !== undefined) return JSON.parse(payload)
      continue
    }
    if (!line.startsWith("data:")) continue
    const chunk = line.slice(5).trim()
    payload = payload === undefined ? chunk : `${payload}\n${chunk}`
  }
  if (payload !== undefined) return JSON.parse(payload)

  throw new Error(`could not parse MCP response: ${trimmed.slice(0, 120)}`)
}

/** Read `result` off a JSON-RPC envelope, turning `error` into a thrown failure. */
function unwrap(method: string, payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) return undefined
  const message = payload as { result?: unknown; error?: { message?: string } }
  if (message.error) {
    const detail = message.error.message ?? JSON.stringify(message.error)
    throw new Error(`${method} error: ${detail}`)
  }
  return message.result
}

export class McpClient {
  private sessionId?: string
  private nextId = 1
  private initialized = false

  constructor(private readonly opts: McpClientOptions) {}

  private get timeout() {
    return this.opts.timeoutMs ?? 20_000
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    }
    if (this.opts.token) headers["authorization"] = `Bearer ${this.opts.token}`
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId
    return headers
  }

  private async send(body: unknown): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)
    try {
      const res = await fetch(this.opts.url, {
        method: "POST",
        headers: this.headers(),
        signal: controller.signal,
        body: JSON.stringify(body),
      })
      const sid = res.headers.get("mcp-session-id")
      if (sid) this.sessionId = sid
      return res
    } finally {
      clearTimeout(timer)
    }
  }

  private async rpc(method: string, params: unknown = {}): Promise<unknown> {
    const res = await this.send({ jsonrpc: "2.0", id: this.nextId++, method, params })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`${method} failed: HTTP ${res.status} ${body.slice(0, 160)}`)
    }

    const text = await res.text()
    if (!text.trim()) return undefined
    return unwrap(method, parseBody(text))
  }

  /**
   * Fire a notification.
   *
   * Kept separate from `rpc` because a notification is not a request: it carries no
   * `id` and expects no reply. Sending one through `rpc` put an `id` on
   * `notifications/initialized`, which a stateful server is entitled to treat as an
   * unanswered request.
   */
  private async notify(method: string, params: unknown = {}): Promise<void> {
    await this.send({ jsonrpc: "2.0", method, params })
  }

  async initialize(): Promise<McpServerInfo> {
    const result = (await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      // Roots and sampling are declared only when served; a client that advertises
      // sampling without answering it leaves servers waiting on a callback that never
      // comes, so neither is claimed here.
      capabilities: {},
      clientInfo: { name: this.opts.clientName ?? "mcp-hub", version: "1.0.0" },
    })) as { serverInfo?: { name?: string; version?: string }; protocolVersion?: string } | undefined

    // The server considers the session usable only once this lands, so it is awaited
    // rather than fired and forgotten: a stateful transport will reject the
    // `tools/list` that races ahead of it.
    await this.notify("notifications/initialized")
    this.initialized = true

    return {
      serverName: result?.serverInfo?.name,
      version: result?.serverInfo?.version,
      protocolVersion: result?.protocolVersion,
    }
  }

  async listTools(): Promise<McpTool[]> {
    if (!this.initialized) await this.initialize()
    const result = (await this.rpc("tools/list", {})) as { tools?: McpTool[] } | undefined
    return result?.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
    if (!this.initialized) await this.initialize()
    const result = (await this.rpc("tools/call", { name, arguments: args })) as
      | { content?: McpContent[]; isError?: boolean }
      | undefined
    return { content: result?.content ?? [], isError: result?.isError === true }
  }

  /**
   * End the session.
   *
   * A session id is only really released by a DELETE, so closing a client without one
   * leaves the server holding a session until it times out.
   */
  async close(): Promise<void> {
    if (!this.sessionId) return
    await fetch(this.opts.url, { method: "DELETE", headers: this.headers() }).catch(() => {})
    this.sessionId = undefined
    this.initialized = false
  }

  /** One-line text of a tool result, for logs and tests. */
  static text(result: McpCallResult): string {
    return result.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text as string)
      .join("\n")
  }
}