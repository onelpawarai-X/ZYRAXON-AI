// Copyright (c) 2026 onelpawarai. All rights reserved.

import path from "node:path"
import { pathToFileURL } from "node:url"
import { LayerNode } from "@zyraxon-ai/core/effect/layer-node"
import { ConfigV1 } from "@zyraxon-ai/core/v1/config/config"
import { serviceUse } from "@zyraxon-ai/core/effect/service-use"
import { Client, type ClientOptions } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import {
  ListRootsRequestSchema,
  type LoggingMessageNotification,
  LoggingMessageNotificationSchema,
  type Tool as MCPToolDef,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { Config } from "@/config/config"
import { ConfigMCPV1 } from "@zyraxon-ai/core/v1/config/mcp"
import { NamedError } from "@zyraxon-ai/core/util/error"
import { InstallationVersion } from "@zyraxon-ai/core/installation/version"
import { withTimeout } from "@/util/timeout"
import { FSUtil } from "@zyraxon-ai/core/fs-util"
import { McpOAuthPendingProvider, McpOAuthProvider, OAUTH_CALLBACK_PATH } from "./oauth-provider"
import { McpOAuthDiscovery } from "./oauth-discovery"
import { McpOAuthCallback } from "./oauth-callback"
import { McpAuth } from "./auth"
import { EventV2Bridge } from "@/event-v2-bridge"
import { TuiEvent } from "@/server/tui-event"
import { Cause, Effect, Exit, Layer, Context, Schema, Stream } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { InstanceState } from "@/effect/instance-state"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@zyraxon-ai/core/cross-spawn-spawner"
import { McpCatalog } from "./catalog"
import { McpEvent } from "@zyraxon-ai/schema/mcp-event"
import { McpBrowser } from "./browser"

// Bundled local servers (Playwright, Python imports, desktop-commander cold start)
// routinely need >10s for the initialize handshake
const DEFAULT_TIMEOUT = 30_000

// Cache resolved node path to avoid repeated blocking `where` calls
let _cachedNodePath: string | null = null
let _nodePathResolved = false

async function resolveNodePath(): Promise<string> {
  if (_nodePathResolved) return _cachedNodePath ?? "node"
  _nodePathResolved = true
  try {
    const { execFile: _execFile } = require("child_process") as typeof import("child_process")
    const { promisify } = require("util") as typeof import("util")
    const execFileAsync = promisify(_execFile)
    // "where" only exists on Windows; Linux and macOS use "which". Getting this wrong
// burned a 5s timeout on every connect before falling back, so pick per platform.
    const finder = process.platform === "win32" ? "where" : "which"
    const { stdout } = await execFileAsync(finder, ["node"], { encoding: "utf8", timeout: 5000 })
    const nodePath = stdout.trim().split("\n")[0]?.trim()
    if (nodePath && (require("fs") as typeof import("fs")).existsSync(nodePath)) {
      _cachedNodePath = nodePath
      return nodePath
    }
  } catch {
    // finder not available or node not on PATH — leave as null (fall back to "node")
  }
  // Packaged Electron: node is not on PATH, but the Electron binary itself runs JS
  // as plain Node when ELECTRON_RUN_AS_NODE is set. Fall back to process.execPath
  // so local MCP servers keep working on any platform without hardcoded paths.
  const execPath = (process as { execPath?: string }).execPath
  if (execPath && (require("fs") as typeof import("fs")).existsSync(execPath)) {
    _cachedNodePath = execPath
    return execPath
  }
  return "node"
}
const CLIENT_OPTIONS = {
  capabilities: {
    // https://github.com/onelpawarai/ZYRAXON-AI/issues/11948
    // sampling: {},
    // https://github.com/onelpawarai/ZYRAXON-AI/issues/23066
    // elicitation: {},
    // https://github.com/onelpawarai/ZYRAXON-AI/issues/2308
    roots: {},
    // https://github.com/onelpawarai/ZYRAXON-AI/issues/28567
    // tasks: {},
  },
} satisfies ClientOptions

export const Resource = Schema.Struct({
  name: Schema.String,
  uri: Schema.String,
  description: Schema.optional(Schema.String),
  mimeType: Schema.optional(Schema.String),
  client: Schema.String,
}).annotate({ identifier: "McpResource" })
export type Resource = Schema.Schema.Type<typeof Resource>

export const ToolsChanged = McpEvent.ToolsChanged

export const BrowserOpenFailed = McpEvent.BrowserOpenFailed

export const Failed = NamedError.create("MCPFailed", {
  name: Schema.String,
})

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("MCP.NotFoundError", {
  name: Schema.String,
}) {}

/**
 * The HTTP status a transport failure carries, or undefined when it carries none.
 *
 * The MCP SDK does not preserve the response, so the status has to be read out of what
 * it threw: `code` on the fetch-style errors it rethrows, `statusCode` on the ones it
 * wraps, and otherwise the trailing `HTTP error: 401` in its message. Vendors write
 * three different phrasings of the same refusal and this has to survive all of them,
 * because a 401 that gets read as a plain failure is a server the user can never sign
 * in to.
 */
function httpStatus(error: Error): number | undefined {
  const candidate = error as Error & { code?: unknown; statusCode?: unknown; status?: unknown }
  for (const value of [candidate.code, candidate.statusCode, candidate.status]) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
    if (Number.isInteger(parsed) && parsed >= 100 && parsed <= 599) return parsed
  }
  // Vendors and transports phrase the same refusal as `HTTP error: 401`,
  // `status code 401` and `SSE error: 403 Forbidden`, and the SDK rethrows all three as
  // plain `Error`s with the response discarded. The status is the only thing that still
  // separates "sign in" from "unreachable", so it is read from wherever it survives.
  // A 3-digit run that is not a plausible HTTP status is ignored, which keeps ports and
  // version numbers in a message from being mistaken for one.
  const match = error.message.match(/(?:\bHTTP|\bstatus(?:\s*code)?|\berror)\D{0,24}?(\d{3})\b/i)
  return match && Number(match[1]) >= 100 && Number(match[1]) <= 599 ? Number(match[1]) : undefined
}

type MCPClient = Client

function createClient(directory: string) {
  const client = new Client({ name: "opencode", version: InstallationVersion }, CLIENT_OPTIONS)
  client.setRequestHandler(ListRootsRequestSchema, () =>
    Promise.resolve({ roots: [{ uri: pathToFileURL(directory).href }] }),
  )
  return client
}

const StatusConnected = Schema.Struct({ status: Schema.Literal("connected") }).annotate({
  identifier: "MCPStatusConnected",
})
const StatusDisabled = Schema.Struct({ status: Schema.Literal("disabled") }).annotate({
  identifier: "MCPStatusDisabled",
})
const StatusFailed = Schema.Struct({ status: Schema.Literal("failed"), error: Schema.String }).annotate({
  identifier: "MCPStatusFailed",
})
const StatusNeedsAuth = Schema.Struct({ status: Schema.Literal("needs_auth") }).annotate({
  identifier: "MCPStatusNeedsAuth",
})
const StatusNeedsClientRegistration = Schema.Struct({
  status: Schema.Literal("needs_client_registration"),
  error: Schema.String,
}).annotate({ identifier: "MCPStatusNeedsClientRegistration" })

export const Status = Schema.Union([
  StatusConnected,
  StatusDisabled,
  StatusFailed,
  StatusNeedsAuth,
  StatusNeedsClientRegistration,
]).annotate({ identifier: "MCPStatus", discriminator: "status" })
export type Status = Schema.Schema.Type<typeof Status>

/**
 * Does this server accept the credentials we just presented?
 *
 * Servers that need a token treat `initialize` as worthless: Google's answers 200
 * without looking at the credential at all, so the first thing that can actually
 * fail is a real request. The sequence below is the SDK's own — `initialize`,
 * `notifications/initialized`, then `tools/list` on the same session — and when the
 * list is not enough it goes one step further and makes the cheapest read-only tool
 * call it can name, because two servers in the catalogue prove a bad key only there:
 *
 *   - Gmail answers `tools/list` with 401, which is the easy case.
 *   - The JoJ proxy (YouTube, Telegram, LinkedIn, X) answers `tools/list` with 200
 *     for any key at all, then returns 200 from the tool call *with a message in the
 *     body* saying the call needs a key. Judged on status alone this reported a
 *     wrong key as working and moved the failure to the agent's first request.
 *
 * So both signals count: a 401/403 anywhere, or a body that says the credential was
 * not accepted. A server that cannot be asked at all proves nothing, and is left
 * alone rather than being reported as a bad key.
 */
async function credentialsAccepted(
  url: URL,
  headers: Record<string, string> | undefined,
): Promise<{ accepted: boolean; detail?: string }> {
  const rejected = {
    accepted: false,
    detail:
      "The server rejected this token. It is either expired, copied with extra spaces, or was issued for a different account.",
  }
  /** The shapes these servers use to say "that key is not valid", in 200 bodies. */
  const REFUSALS =
    /requires?\s+(?:a\s+)?(?:joj\s*)?api\s*key|missing\s+required\s+auth|invalid\s+api\s*key|unauthorized|authentication\s+(?:is\s+)?required|invalid\s+authentication\s+credentials|api[\s_-]?key\s+(?:is\s+)?(?:missing|required|invalid)|no\s+api\s*key/i
  /** GitHub rejects a malformed or wrong token with 400, not 401, and says so in the body. */
  const MALFORMED = /authorization\s+header\s+is\s+badly\s+formatted|bad\s+authorization|invalid\s+authorization|malformed\s+authorization/i
  /** A tool name the server does not have. Says nothing about the token either way. */
  const UNKNOWN_TOOL = /unknown\s+tool|tool\s+not\s+found|no\s+such\s+tool|method\s+not\s+found|-32601/i

  /**
 * Whether a status means "the server refused the credential".
 *
 * Only the codes that actually talk about the credential count. Every 4xx used to count,
 * which told a user their key was "expired, copied with extra spaces, or issued for a
 * different account" when the real answer was that the endpoint had moved (404), that the
 * method was not allowed (405), or that they had been rate limited (429). 429 in
 * particular arrives whenever somebody clicks connect twice, and it is the one status the
 * user can do nothing about but wait.
 *
 * Anything else is inconclusive, and inconclusive must not be dressed up as a verdict.
 */
const CREDENTIAL_STATUSES = new Set([400, 401, 403])

const refused = (status: number, body: string) => CREDENTIAL_STATUSES.has(status) || MALFORMED.test(body)

  const post = (body: unknown, session?: string) =>
    withTimeout(
      fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(session ? { "mcp-session-id": session } : {}),
          ...(headers ?? {}),
        },
        body: JSON.stringify(body),
      }),
      8_000,
    )

  // Not truncated. The tool list of a real server runs to tens of kilobytes, and
  // cutting it off meant the tool name was never seen, so the call went out under a
  // name the server did not recognise and its answer said nothing about the token.
  const bodyText = async (response: Response) =>
    response
      .text()
      .catch(() => "")

  /** Is this a JSON-RPC error rather than a result? */
  const rpcError = (text: string) => {
    if (!text) return false
    if (/"error"\s*:/.test(text) && !/"result"\s*:/.test(text)) return true
    if (/"code"\s*:\s*(?:-?32\d\d|-?4\d\d)\b/.test(text)) return true
    return false
  }

  let session: string | undefined
  try {
    const initialized = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "zyraxon", version: "1" },
      },
    })
    if (refused(initialized.status, await bodyText(initialized))) return rejected
    session = initialized.headers.get("mcp-session-id") ?? undefined

    // Awaited, not fired and forgotten. `initialize` has to be followed by
    // `notifications/initialized` before the session will serve anything else, and a
    // server that enforces that answers a `tools/list` that overtakes the notification
    // with "server not initialized" — which this function then read as a bad credential.
    // The notification expects no reply, so waiting on it costs only the write.
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, session).catch(() => {})

    const listed = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, session)
    const listedBody = await bodyText(listed)
    if (refused(listed.status, listedBody)) return rejected
    if (rpcError(listedBody) && !/"tools"\s*:/.test(listedBody)) return rejected

    // Pick a tool that is safe to call and needs no arguments of consequence, then
    // actually call it. This is the only request that reliably exercises the
    // credential on a stateless server, so its verdict is awaited, not assumed.
    for (const tool of pickReadOnlyTools(listedBody).slice(0, 3)) {
      const called = await post(
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: tool, arguments: {} } },
        session,
      )
      const calledBody = await bodyText(called)
      if (refused(called.status, calledBody)) return rejected
      if (REFUSALS.test(calledBody)) return rejected
      // The server did not recognise the name, so it never tested anything. Move to
      // the next candidate instead of reading that silence as a working key.
      if (UNKNOWN_TOOL.test(calledBody)) continue
      return { accepted: true }
    }

    // Nothing conclusive to go on: either no tools were offered, or every name we
    // tried was refused for some other reason. Not evidence of a bad token.
    return { accepted: true }
  } catch {
    // A server that cannot be asked at all is not evidence of a bad token. Reporting
    // one here would turn a transient network problem into "your key is wrong".
    return { accepted: true }
  } finally {
    if (session) {
      // Nothing is done with the throwaway session, so close it instead of leaving
      // the server to hold it until it times out.
      fetch(url, { method: "DELETE", headers: { "mcp-session-id": session, ...(headers ?? {}) } }).catch(
        () => {},
      )
    }
  }
}

/**
 * The least intrusive tools a server offers, best first, from its own tools/list.
 *
 * Read-only, and nothing that writes — create, send, post, delete, update — is ever
 * returned, because this runs against the user's real account during a connect.
 *
 * The last `...names` that used to be appended here is the reason a connect could destroy
 * something. It was there so the caller would always have another name to try, but it also
 * put every excluded name back on the list: a server offering nothing but `create_issue`
 * and `delete_repo` produced two safe names, zero results, and then handed the probe the
 * write tools it had just been written to refuse. A connect that deletes a repository is
 * not a failed connect. Excluded names stay excluded; when there is nothing safe to call,
 * there is nothing to call and the caller says so.
 */
function pickReadOnlyTools(toolsListBody: string): string[] {
  let names: string[] = []
  try {
    const doc = JSON.parse(toolsListBody) as { result?: { tools?: { name?: string }[] } }
    names = (doc.result?.tools ?? [])
      .map((t) => t.name)
      .filter((n): n is string => typeof n === "string")
  } catch {
    // Streamable HTTP servers answer in SSE frames rather than bare JSON.
    names = [...toolsListBody.matchAll(/"name"\s*:\s*"([A-Za-z0-9_.-]{2,64})"/g)]
      .map((m) => m[1])
      .filter(
        (n) =>
          !/^(tools|jsonrpc|result|content|text|type|error|code|message|data|id|description|inputSchema|outputSchema|annotations|title|properties)$/.test(
            n,
          ),
      )
  }

  const EXCLUDED =
    /create|write|send|post|put|update|delete|remove|destroy|patch|insert|add|set|upload|download|execute|run|deploy|pay|buy|order|invite|share|merge|close|open|start|stop|cancel|approve|reject|import|export|move|copy|rename/i
  const PREFERRED = /^(get|list|search|read|fetch|find|query|describe|status|whoami|me|info|about|help|ping|check|view|show|lookup)/i

  const safe = names.filter((n) => !EXCLUDED.test(n))
  return [...new Set([...safe.filter((n) => PREFERRED.test(n)), ...safe])]
}

// Cache transports for OAuth servers to allow finishing auth
type TransportWithAuth = StreamableHTTPClientTransport | SSEClientTransport
const pendingOAuthTransports = new Map<string, { transport: TransportWithAuth; provider?: McpOAuthPendingProvider }>()

/**
 * Who, if anyone, is driving the consent page for a server right now.
 *
 * `connect` builds a provider of its own, and the SDK asks it to redirect whenever the
 * server turns out to want consent. With nothing registered here that request went
 * nowhere, so a connect that needed a fresh token produced no browser and no error. A
 * live `authenticate` registers itself for the duration of the handshake, which is what
 * turns that redirect into a page the user can actually approve.
 */
const liveConsent = new Map<string, (url: string) => Effect.Effect<void>>()

/**
 * Everything the code-for-token exchange needs, captured while the consent URL was
 * being built. Keeping it here means the exchange never has to rediscover it.
 */
const pendingOAuthTargets = new Map<
  string,
  {
    tokenEndpoint: string
    clientId: string
    clientSecret?: string
    redirectUri: string
    verifier: string
  }
>()

interface OAuthTokenResponse {
  access_token: string
  token_type?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

/** Trade an authorization code for tokens at the endpoint discovery already found. */
async function exchangeAuthorizationCode(
  target: { tokenEndpoint: string; clientId: string; clientSecret?: string; redirectUri: string; verifier: string },
  code: string,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: target.redirectUri,
    client_id: target.clientId,
    code_verifier: target.verifier,
  })

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  }

  // A public client authenticates with nothing beyond PKCE. One that has a secret
  // sends it as a basic credential, which is what the spec's default asks for and
  // what several servers require.
  if (target.clientSecret) {
    headers["authorization"] = `Basic ${Buffer.from(`${target.clientId}:${target.clientSecret}`).toString("base64")}`
  }

  const response = await fetch(target.tokenEndpoint, { method: "POST", headers, body })
  const text = await response.text()
  if (!response.ok) {
    // Several servers answer a malformed request with 200 and an `error` field
    // instead of a status code, so both are checked.
    let detail = text.slice(0, 200)
    try {
      const parsed = JSON.parse(text) as { error_description?: string; error?: string }
      if (parsed.error_description || parsed.error) detail = parsed.error_description ?? parsed.error
    } catch {}
    throw new Error(`token endpoint returned HTTP ${response.status}${detail ? ` — ${detail}` : ""}`)
  }

  const tokens = safeParseJson<OAuthTokenResponse>(text)
  if (!tokens?.access_token) throw new Error("token endpoint returned no access token")
  return tokens
}

function safeParseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

/** Base64url without padding, as PKCE requires. */
function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

/** The S256 PKCE challenge for a verifier. */
async function sha256Base64Url(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

// Prompt cache types
type PromptInfo = Awaited<ReturnType<MCPClient["listPrompts"]>>["prompts"][number]
type ResourceInfo = Awaited<ReturnType<MCPClient["listResources"]>>["resources"][number]
type ResourceTemplateInfo = Awaited<ReturnType<MCPClient["listResourceTemplates"]>>["resourceTemplates"][number]
type McpEntry = NonNullable<ConfigV1.Info["mcp"]>[string]

function isMcpConfigured(entry: McpEntry): entry is ConfigMCPV1.Info {
  return typeof entry === "object" && entry !== null && "type" in entry
}

function remoteURL(value: string) {
  if (URL.canParse(value)) return new URL(value)
}

interface CreateResult {
  mcpClient?: MCPClient
  status: Status
  defs?: MCPToolDef[]
  instructions?: string
}

interface AuthResult {
  authorizationUrl: string
  oauthState: string
  client?: MCPClient
}

// --- Effect Service ---

interface State {
  config: Record<string, ConfigMCPV1.Info>
  status: Record<string, Status>
  clients: Record<string, MCPClient>
  defs: Record<string, MCPToolDef[]>
  instructions: Record<string, string>
}

export interface ServerInstructions {
  name: string
  instructions: string
  tools: string[]
}

/** An MCP tool in its native shape; consumers adapt it to their own tool format. */
export interface McpTool {
  /** Shared cached definition; consumers must copy rather than mutate it. */
  readonly def: MCPToolDef
  readonly client: MCPClient
  readonly timeout?: number
}

export interface Interface {
  readonly status: () => Effect.Effect<Record<string, Status>>
  readonly clients: () => Effect.Effect<Record<string, MCPClient>>
  readonly instructions: () => Effect.Effect<ServerInstructions[]>
  readonly tools: () => Effect.Effect<Record<string, McpTool>>
  readonly prompts: () => Effect.Effect<Record<string, PromptInfo & { client: string }>>
  readonly resources: (clientName?: string) => Effect.Effect<Record<string, ResourceInfo & { client: string }>>
  readonly resourceTemplates: (
    clientName?: string,
  ) => Effect.Effect<Record<string, ResourceTemplateInfo & { client: string }>>
  readonly add: (name: string, mcp: ConfigMCPV1.Info) => Effect.Effect<{ status: Record<string, Status> | Status }>
  readonly connect: (name: string) => Effect.Effect<void, NotFoundError>
  readonly disconnect: (name: string) => Effect.Effect<void, NotFoundError>
  readonly getPrompt: (
    clientName: string,
    name: string,
    args?: Record<string, string>,
  ) => Effect.Effect<Awaited<ReturnType<MCPClient["getPrompt"]>> | undefined>
  readonly readResource: (
    clientName: string,
    resourceUri: string,
  ) => Effect.Effect<Awaited<ReturnType<MCPClient["readResource"]>> | undefined>
  readonly startAuth: (
    mcpName: string,
  ) => Effect.Effect<{ authorizationUrl: string; oauthState: string }, NotFoundError>
  readonly authenticate: (
    mcpName: string,
    onAuthorization?: (authorizationUrl: string) => void,
  ) => Effect.Effect<Status, NotFoundError>
  readonly finishAuth: (mcpName: string, authorizationCode: string) => Effect.Effect<Status, NotFoundError>
  readonly removeAuth: (mcpName: string) => Effect.Effect<void>
  readonly supportsOAuth: (mcpName: string) => Effect.Effect<boolean, NotFoundError>
  readonly hasStoredTokens: (mcpName: string) => Effect.Effect<boolean>
  readonly getAuthStatus: (mcpName: string) => Effect.Effect<AuthStatus>
  /**
   * Open a URL in the person's browser.
   *
   * Shared by the consent flow and by the agent's own MCP tools, so both go through the
   * same browser discovery — including a path the user set by hand in the MCP page.
   */
  readonly openUrl: (url: string) => Effect.Effect<void, Error>
}

export class Service extends Context.Service<Service, Interface>()("@zyraxon/MCP") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const auth = yield* McpAuth.Service
    const events = yield* EventV2Bridge.Service
    const browser = yield* McpBrowser.Service

    type Transport = StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport

    /**
     * Connect a client via the given transport with resource safety:
     * on failure the transport is closed; on success the caller owns it.
     */
    const connectTransport = Effect.fn("MCP.connectTransport")(function* (transport: Transport, timeout: number) {
      const directory = yield* InstanceState.directory
      return yield* Effect.acquireUseRelease(
        Effect.succeed(transport),
        (t) =>
          Effect.tryPromise({
            try: () => {
              const client = createClient(directory)
              return withTimeout(client.connect(t), timeout).then(() => client)
            },
            catch: (e) => (e instanceof Error ? e : new Error(String(e))),
          }),
        (t, exit) => (Exit.isFailure(exit) ? Effect.tryPromise(() => t.close()).pipe(Effect.ignore) : Effect.void),
      )
    })

    const DISABLED_RESULT: CreateResult = { status: { status: "disabled" } }

    const connectRemote = Effect.fn("MCP.connectRemote")(function* (
      key: string,
      mcp: ConfigMCPV1.Info & { type: "remote" },
    ) {
      const oauthDisabled = mcp.oauth === false
      const oauthConfig = typeof mcp.oauth === "object" ? mcp.oauth : undefined
      const url = remoteURL(mcp.url)
      if (!url) {
        return {
          client: undefined as MCPClient | undefined,
          status: { status: "failed" as const, error: `Invalid MCP URL for "${key}"` },
        }
      }

      // A static token has to be checked before anything is declared connected.
      // Reporting "connected" for a token that the server will reject on first use
      // moved the failure to the agent's first call, where it looks like a broken tool
      // rather than a bad key.
      if (mcp.headers && !mcp.oauth) {
        const verdict = yield* Effect.promise(() => credentialsAccepted(url, mcp.headers))
        if (!verdict.accepted) {
          return {
            client: undefined as MCPClient | undefined,
            status: { status: "failed" as const, error: verdict.detail ?? "The server rejected this token." },
          }
        }
      }
      let authProvider: McpOAuthProvider | undefined

      if (!oauthDisabled) {
        authProvider = new McpOAuthProvider(
          key,
          mcp.url,
          {
            clientId: oauthConfig?.clientId,
            clientSecret: oauthConfig?.clientSecret,
            scope: oauthConfig?.scope,
            callbackPort: oauthConfig?.callbackPort,
            redirectUri: oauthConfig?.redirectUri,
          },
          {
            // The SDK asks the provider to redirect when it meets a server that wants
            // consent. That request was being dropped on the floor, so a reconnect that
            // needed a fresh token sat there instead of showing the sign-in page. The
            // browser belongs to whoever is driving the connect, so the live handshake
            // takes over; outside one there is nobody to hand it to and the page is not
            // opened behind the user's back.
            onRedirect: async (url: URL) => {
              const open = liveConsent.get(key)
              if (!open) return
              // A plain async callback has no generator to yield into, so the page is
              // opened the same way the handshake opens it: run the effect on the already
              // available runtime and report a failure rather than rejecting into the SDK.
              await Effect.runPromise(
                Effect.logInfo("oauth redirect during connect", { server: key, url: url.toString() }).pipe(
                  Effect.andThen(open(url.toString())),
                  Effect.catchCause((cause) =>
                    Effect.logWarning("oauth redirect could not open a page", {
                      server: key,
                      reason: Cause.pretty(cause),
                    }).pipe(Effect.ignore),
                  ),
                ),
              )
            },
          },
          auth,
        )
      }

      // Streamable HTTP is the current MCP transport. SSE is tried afterwards only
      // as a genuine fallback: most modern servers answer SSE with a non-200 (405 or
      // 404), and letting that error replace the real one is how a card ended up
      // saying "SSE error: Non-200 status code" when the actual problem was an
      // OAuth handshake that never started. The first transport's error is kept when
      // the fallback adds nothing.
      const transports: Array<{ name: string; transport: TransportWithAuth }> = [
        {
          name: "StreamableHTTP",
          transport: new StreamableHTTPClientTransport(url, {
            authProvider,
            requestInit: mcp.headers ? { headers: mcp.headers } : undefined,
          }),
        },
        {
          name: "SSE",
          transport: new SSEClientTransport(url, {
            authProvider,
            requestInit: mcp.headers ? { headers: mcp.headers } : undefined,
          }),
        },
      ]

      const connectTimeout = mcp.timeout ?? DEFAULT_TIMEOUT
      let lastStatus: Status | undefined
      // The first transport's failure, kept so the SSE fallback cannot overwrite it.
      let firstStatus: Status | undefined

      for (const { name, transport } of transports) {
        const result = yield* connectTransport(transport, connectTimeout).pipe(
          Effect.map((client) => ({ client, transportName: name })),
          Effect.catch((error) => {
            const lastError = error instanceof Error ? error : new Error(String(error))
            // A 401 or 403 from the server always means "sign in", whatever shape the
            // transport happened to throw it in. Canva answers 401 with the SDK's
            // generic `Streamable HTTP error: 401` — no `UnauthorizedError`, and no
            // "OAuth" in the message — which read as `failed`, so the connect call
            // stopped there and never reached `authenticate()`. That left every
            // standards-compliant remote server (the ones that answer 401 with a
            // `WWW-Authenticate` challenge) unable to open a browser at all, while the
            // handful of vendors that name OAuth in their error kept working.
            //
            // So the status codes are what decide this, and the message is only a
            // fallback for servers that name OAuth without saying 401.
            const status = httpStatus(lastError)
            const isAuthError =
              status === 401 ||
              status === 403 ||
              error instanceof UnauthorizedError ||
              (authProvider && lastError.message.includes("OAuth"))

            if (isAuthError) {
              if (lastError.message.includes("registration") || lastError.message.includes("client_id")) {
                lastStatus = {
                  status: "needs_client_registration" as const,
                  error: "Server does not support dynamic client registration. Please provide clientId in config.",
                }
                return events
                  .publish(TuiEvent.ToastShow, {
                    title: "MCP Authentication Required",
                    message: `Server "${key}" requires a pre-registered client ID. Add clientId to your config.`,
                    variant: "warning",
                    duration: 8000,
                  })
                  .pipe(Effect.ignore, Effect.as(undefined))
              } else {
                pendingOAuthTransports.set(key, { transport })
                lastStatus = { status: "needs_auth" as const }
                return events
                  .publish(TuiEvent.ToastShow, {
                    title: "MCP Authentication Required",
                    message: `Server "${key}" requires authentication. Run: zyraxon mcp auth ${key}`,
                    variant: "warning",
                    duration: 8000,
                  })
                  .pipe(Effect.ignore, Effect.as(undefined))
              }
            }

            lastStatus = { status: "failed" as const, error: lastError.message }
            return Effect.void
          }),
        )
        if (result) return { client: result.client, status: { status: "connected" } as Status }
        // If this was an auth error, stop trying other transports
        if (lastStatus?.status === "needs_auth" || lastStatus?.status === "needs_client_registration") break
        // Remember the first transport's failure so the SSE fallback cannot replace a
        // meaningful error with its own "Non-200 status code".
        if (transports.length > 1 && lastStatus?.status === "failed" && !firstStatus) firstStatus = lastStatus
      }

      return {
        client: undefined as MCPClient | undefined,
        // Prefer whichever failure is actually informative. A bare SSE refusal tells
        // the user nothing; the first transport's error usually names the real cause.
        status: (firstStatus ?? lastStatus ?? { status: "failed", error: "Unknown error" }) as Status,
      }
    })

    const connectLocal = Effect.fn("MCP.connectLocal")(function* (
      key: string,
      mcp: ConfigMCPV1.Info & { type: "local" },
    ) {
      const [cmd, ...args] = mcp.command
      const baseDir = yield* InstanceState.directory
      const fs = require("fs") as typeof import("fs")
      let cwd = mcp.cwd ? path.resolve(baseDir, mcp.cwd) : baseDir
      // Invalid session directories (deleted/moved projects) must not break spawn
      if (!fs.existsSync(cwd)) {
        cwd = require("os").homedir()
      }

      // Resolve __RESOURCES_PATH__ placeholder in command/args (for bundled MCP servers)
      // Try multiple paths: env var, packaged Electron resourcesPath, then dev fallbacks
      const findResourcesPath = (): string => {
        // Score each candidate by how many bundled servers it actually holds instead
        // of requiring all of them. Requiring every marker meant one server missing
        // from a checkout sent all four down the same wrong path, so a healthy
        // server failed for a sibling's reasons.
        const markerFiles = ["jarvis-browser-mcp.cjs", "nuphus-mcp/nuphus-mcp.cjs", "touchpoint-mcp/touchpoint-mcp.cjs", "desktop-commander/desktop-commander.cjs"]
        const score = (p: string) => markerFiles.filter((m) => fs.existsSync(path.join(p, m))).length
        const candidates: string[] = []
        if (process.env.ZYRAXON_RESOURCES_PATH) candidates.push(process.env.ZYRAXON_RESOURCES_PATH)
        if (typeof process !== "undefined" && (process as any).resourcesPath) {
          candidates.push((process as any).resourcesPath as string)
        }
        try {
          const { fileURLToPath } = require("url") as typeof import("url")
          const here = path.dirname(fileURLToPath(import.meta.url))
          candidates.push(path.resolve(here, "../../../desktop/resources"))
        } catch {}
        candidates.push(path.resolve(baseDir, "packages/desktop/resources"))

        const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a), candidates[0] ?? baseDir)
        if (score(best) === 0) {
          console.error(`[mcp] no bundled MCP server found; looked in: ${candidates.join(", ")}`)
          return baseDir
        }
        return best
      }
      const resourcesPath = findResourcesPath()
      const resolvePath = (p: string) => p.replace(/__RESOURCES_PATH__/g, resourcesPath)
      let resolvedCmd = resolvePath(cmd)
      const resolvedArgs = args.map(resolvePath)
      const resolvedEnv = Object.fromEntries(
        Object.entries(mcp.environment ?? {}).map(([name, value]) => [name, resolvePath(value)]),
      )

      // Resolve "node" to full path if bare command not found (cached, async)
      let dotenv: Record<string, string> = {}
      if (resolvedCmd === "node" || resolvedCmd === "node.exe") {
        resolvedCmd = yield* Effect.promise(() => resolveNodePath())
        const { execPath } = process as { execPath?: string }
        // When falling back to the Electron binary, run it as plain Node.
        if (execPath && resolvedCmd === execPath) {
          dotenv = { ELECTRON_RUN_AS_NODE: "1" }
        }
      }

      const transport = new StdioClientTransport({
        stderr: "pipe",
        command: resolvedCmd,
        args: resolvedArgs,
        cwd,
        // A stdio MCP server is a child process, and on Windows a console app
        // spawned without this flashes a black console window for every server on
        // every reconnect. The child's stdio is piped, so the window served no
        // purpose; hiding it keeps the app from strobing while it starts up.
        windowsHide: true,
        env: {
          ...process.env,
          ...(cmd === "opencode" ? { BUN_BE_BUN: "1" } : {}),
          ...dotenv,
          ...resolvedEnv,
        },
      })

      const connectTimeout = mcp.timeout ?? DEFAULT_TIMEOUT
      return yield* connectTransport(transport, connectTimeout).pipe(
        Effect.map((client): { client: MCPClient | undefined; status: Status } => ({
          client,
          status: { status: "connected" },
        })),
        Effect.catch((error): Effect.Effect<{ client: MCPClient | undefined; status: Status }> => {
          const msg = error instanceof Error ? error.message : String(error)
          return Effect.succeed({ client: undefined, status: { status: "failed", error: msg } })
        }),
      )
    })

    const create = Effect.fn("MCP.create")(
      function* (key: string, mcp: ConfigMCPV1.Info) {
        if (mcp.enabled === false) {
          return DISABLED_RESULT
        }

        const { client: mcpClient, status } =
          mcp.type === "remote"
            ? yield* connectRemote(key, mcp as ConfigMCPV1.Info & { type: "remote" })
            : yield* connectLocal(key, mcp as ConfigMCPV1.Info & { type: "local" })

        if (!mcpClient) {
          if (status.status !== "connected" && status.status !== "disabled") {
            // The endpoint, the transport that was tried, and the exact status are what
            // turn "server unavailable" into an answer. Without the url a log line cannot
            // be matched to a card in the panel, and without the reason a 401 that means
            // "sign in" is indistinguishable from a host that is simply down.
            yield* Effect.logWarning("server unavailable", {
              key,
              type: mcp.type,
              status: status.status,
              url: mcp.type === "remote" ? mcp.url : undefined,
              reason: status.status === "failed" ? status.error : undefined,
            })
          }
          return { status } satisfies CreateResult
        }

        return yield* Effect.gen(function* () {
          const listed = mcpClient.getServerCapabilities()?.tools ? yield* McpCatalog.defs(mcpClient, mcp.timeout) : []
          if (!listed) {
            return yield* Effect.fail(new Error("Failed to get tools"))
          }
          return {
            mcpClient,
            status,
            defs: listed,
            instructions: mcpClient.getInstructions()?.trim(),
          } satisfies CreateResult
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.tryPromise(() => mcpClient.close()).pipe(Effect.ignore, Effect.andThen(Effect.failCause(cause))),
          ),
        )
      },
      Effect.map((result): CreateResult => result),
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt
        const error = Cause.squash(cause)
        return Effect.succeed<CreateResult>({
          status: { status: "failed", error: error instanceof Error ? error.message : String(error) },
        })
      }),
    )
    const cfgSvc = yield* Config.Service

    const descendants = Effect.fnUntraced(
      function* (pid: number) {
        if (process.platform === "win32") return [] as number[]
        const pids: number[] = []
        const queue = [pid]
        for (let index = 0; index < queue.length; index++) {
          const current = queue[index]
          const handle = yield* spawner.spawn(ChildProcess.make("pgrep", ["-P", String(current)], { stdin: "ignore" }))
          const text = yield* Stream.mkString(Stream.decodeText(handle.stdout))
          yield* handle.exitCode
          for (const tok of text.split("\n")) {
            const cpid = parseInt(tok, 10)
            if (!isNaN(cpid) && !pids.includes(cpid)) {
              pids.push(cpid)
              queue.push(cpid)
            }
          }
        }
        return pids
      },
      Effect.scoped,
      Effect.catch(() => Effect.succeed([] as number[])),
    )

    function watch(s: State, name: string, client: MCPClient, bridge: EffectBridge.Shape, timeout?: number, cfgMcp: State["config"] = {}) {
      // A server that drops out is ours to bring back, not the user's problem. Count
      // attempts per server and restart with a capped backoff, giving up only after
      // several consecutive failures so a permanently broken server does not spin.
      const attempts = new Map<string, number>()

      function restart() {
        const attempt = (attempts.get(name) ?? 0) + 1
        if (attempt > 5) return
        attempts.set(name, attempt)
        const delay = Math.min(30_000, 1_000 * 2 ** (attempt - 1))
        const config = s.config[name]
        bridge.fork(
          Effect.sleep(delay).pipe(
            Effect.andThen(
              Effect.gen(function* () {
                // Someone already brought it back; nothing to do.
                if (s.clients[name]) return attempts.set(name, 0)
                const info = config ?? cfgMcp[name]
                if (!info || info.enabled === false) return
                const result = yield* create(name, info)
                s.status[name] = result.status
                if (result.mcpClient) {
                  s.clients[name] = result.mcpClient
                  s.defs[name] = result.defs!
                  if (result.instructions) s.instructions[name] = result.instructions
                  watch(s, name, result.mcpClient, bridge, info.timeout, cfgMcp)
                  attempts.set(name, 0)
                  yield* events.publish(ToolsChanged, { server: name }).pipe(Effect.ignore)
                  return
                }
                yield* events.publish(ToolsChanged, { server: name }).pipe(Effect.ignore)
                if (result.status.status !== "needs_auth") restart()
              }),
            ),
            Effect.ignore,
          ),
        )
      }

      client.onclose = () => {
        if (s.clients[name] !== client) return
        delete s.clients[name]
        delete s.defs[name]
        delete s.instructions[name]
        s.status[name] = { status: "failed", error: "Connection closed" }
        bridge.fork(
          Effect.logWarning("MCP connection closed", { server: name }).pipe(
            Effect.andThen(events.publish(ToolsChanged, { server: name })),
            Effect.ignore,
          ),
        )
        restart()
      }

      client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) =>
        bridge.promise(serverLog(name, notification.params)),
      )

      if (!client.getServerCapabilities()?.tools) return
      client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
        if (s.clients[name] !== client || s.status[name]?.status !== "connected") return

        const listed = await bridge.promise(McpCatalog.defs(client, timeout))
        if (!listed) return
        if (s.clients[name] !== client || s.status[name]?.status !== "connected") return

        s.defs[name] = listed
        await bridge.promise(events.publish(ToolsChanged, { server: name }).pipe(Effect.ignore))
      })
    }

    function serverLog(name: string, params: LoggingMessageNotification["params"]) {
      const fields = { server: name, logger: params.logger, level: params.level, data: params.data }
      switch (params.level) {
        case "debug":
          return Effect.logDebug("MCP server log", fields)
        case "info":
        case "notice":
          return Effect.logInfo("MCP server log", fields)
        case "warning":
          return Effect.logWarning("MCP server log", fields)
        case "error":
        case "critical":
        case "alert":
        case "emergency":
          return Effect.logError("MCP server log", fields)
      }
    }

    const state = yield* InstanceState.make<State>(
      Effect.fn("MCP.state")(function* () {
        const cfg = yield* cfgSvc.get()
        const bridge = yield* EffectBridge.make()
        const config = cfg.mcp ?? {}
        const s: State = {
          config: {},
          status: {},
          clients: {},
          defs: {},
          instructions: {},
        }

        yield* Effect.forEach(
          Object.entries(config),
          ([key, mcp]) =>
            Effect.gen(function* () {
              if (!isMcpConfigured(mcp)) {
                yield* Effect.logError("Ignoring MCP config entry without type", { key })
                return
              }

              if (mcp.enabled === false) {
                s.status[key] = { status: "disabled" }
                return
              }

              const result = yield* create(key, mcp)
              // Record the entry so the close handler can rebuild this exact server.
              s.config[key] = mcp
              s.status[key] = result.status
              if (result.mcpClient) {
                s.clients[key] = result.mcpClient
                s.defs[key] = result.defs!
                if (result.instructions) s.instructions[key] = result.instructions
                watch(s, key, result.mcpClient, bridge, mcp.timeout, s.config)
              }
            }),
          { concurrency: "unbounded" },
        )

        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            const clients = Object.values(s.clients)
            s.clients = {}
            s.defs = {}
            s.instructions = {}
            yield* Effect.forEach(
              clients,
              (client) =>
                Effect.gen(function* () {
                  const pid = client.transport instanceof StdioClientTransport ? client.transport.pid : null
                  if (typeof pid === "number") {
                    const pids = yield* descendants(pid)
                    for (const dpid of pids) {
                      try {
                        process.kill(dpid, "SIGTERM")
                      } catch {}
                    }
                  }
                  yield* Effect.tryPromise(() => client.close()).pipe(Effect.ignore)
                }),
              { concurrency: "unbounded" },
            )
            pendingOAuthTransports.clear()
          }),
        )

        return s
      }),
    )

    function closeClient(s: State, name: string) {
      const client = s.clients[name]
      delete s.clients[name]
      delete s.defs[name]
      delete s.instructions[name]
      if (!client) return Effect.void
      return Effect.tryPromise(() => client.close()).pipe(Effect.ignore)
    }

    const storeClient = Effect.fnUntraced(function* (
      s: State,
      name: string,
      client: MCPClient,
      listed: MCPToolDef[],
      instructions: string | undefined,
      timeout?: number,
    ) {
      const bridge = yield* EffectBridge.make()
      const previous = s.clients[name]
      s.status[name] = { status: "connected" }
      s.clients[name] = client
      s.defs[name] = listed
      if (instructions) s.instructions[name] = instructions
      else delete s.instructions[name]
      watch(s, name, client, bridge, timeout, s.config)
      if (previous) yield* Effect.tryPromise(() => previous.close()).pipe(Effect.ignore)
      return s.status[name]
    })

    const status = Effect.fn("MCP.status")(function* () {
      const s = yield* InstanceState.get(state)

      const cfg = yield* cfgSvc.get()
      const config = cfg.mcp ?? {}
      const result: Record<string, Status> = {}

      for (const [key, mcp] of Object.entries(config)) {
        if (!isMcpConfigured(mcp)) continue
        result[key] = s.status[key] ?? { status: "disabled" }
      }

      for (const key of Object.keys(s.config)) {
        result[key] = s.status[key] ?? { status: "disabled" }
      }

      return result
    })

    const clients = Effect.fn("MCP.clients")(function* () {
      const s = yield* InstanceState.get(state)
      return s.clients
    })

    const instructions = Effect.fn("MCP.instructions")(function* () {
      const s = yield* InstanceState.get(state)
      return Object.entries(s.instructions)
        .filter(([name]) => s.status[name]?.status === "connected")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, item]) => ({
          name,
          instructions: item,
          tools: (s.defs[name] ?? []).map((tool) => McpCatalog.toolName(name, tool.name)),
        }))
    })

    const createAndStore = Effect.fn("MCP.createAndStore")(function* (name: string, mcp: ConfigMCPV1.Info) {
      const s = yield* InstanceState.get(state)
      const result = yield* create(name, mcp)

      s.status[name] = result.status
      if (!result.mcpClient) {
        yield* closeClient(s, name)
        delete s.clients[name]
        return result.status
      }

      return yield* storeClient(s, name, result.mcpClient, result.defs!, result.instructions, mcp.timeout)
    })

    const add = Effect.fn("MCP.add")(function* (name: string, mcp: ConfigMCPV1.Info) {
      const s = yield* InstanceState.get(state)
      s.config[name] = mcp
      yield* createAndStore(name, mcp)
      return { status: s.status }
    })

    const connect = Effect.fn("MCP.connect")(function* (name: string) {
      const mcp = yield* requireMcpConfig(name)
      yield* createAndStore(name, { ...mcp, enabled: true })
    })

    const disconnect = Effect.fn("MCP.disconnect")(function* (name: string) {
      yield* requireMcpConfig(name)
      const s = yield* InstanceState.get(state)
      yield* closeClient(s, name)
      delete s.clients[name]
      s.status[name] = { status: "disabled" }
    })

    function requestTimeout(s: State, name: string, configured: McpEntry | undefined, fallback?: number) {
      const staticTimeout = configured && isMcpConfigured(configured) ? configured.timeout : undefined
      return s.config[name]?.timeout ?? staticTimeout ?? fallback
    }

    const tools = Effect.fn("MCP.tools")(function* () {
      const result: Record<string, McpTool> = {}
      const s = yield* InstanceState.get(state)

      const cfg = yield* cfgSvc.get()
      const config = cfg.mcp ?? {}
      const defaultTimeout = cfg.experimental?.mcp_timeout

      for (const [clientName, client] of Object.entries(s.clients)) {
        if (s.status[clientName]?.status !== "connected") continue
        const mcpConfig = config[clientName]
        const listed = s.defs[clientName]
        if (!listed) {
          yield* Effect.logWarning("missing cached tools for connected server", { clientName })
          continue
        }
        const timeout = requestTimeout(s, clientName, mcpConfig, defaultTimeout)
        for (const def of listed) {
          result[McpCatalog.toolName(clientName, def.name)] = { def, client, timeout }
        }
      }
      return result
    })

    function collectFromConnected<T extends { name: string }>(
      s: State,
      listFn: (c: Client, timeout?: number) => Promise<T[]>,
      label: string,
      key?: (item: T) => string,
      targetClientName?: string,
    ) {
      return Effect.gen(function* () {
        const cfg = yield* cfgSvc.get()
        return yield* Effect.forEach(
          Object.entries(s.clients).filter(
            ([name]) => s.status[name]?.status === "connected" && (!targetClientName || name === targetClientName),
          ),
          ([clientName, client]) =>
            McpCatalog.fetch(
              clientName,
              client,
              (c) => listFn(c, requestTimeout(s, clientName, cfg.mcp?.[clientName], cfg.experimental?.mcp_timeout)),
              label,
              key,
            ).pipe(Effect.map((items) => Object.entries(items ?? {}))),
          { concurrency: "unbounded" },
        ).pipe(Effect.map((results) => Object.fromEntries<T & { client: string }>(results.flat())))
      })
    }

    const prompts = Effect.fn("MCP.prompts")(function* () {
      return yield* collectFromConnected(yield* InstanceState.get(state), McpCatalog.prompts, "prompts")
    })

    const resources = Effect.fn("MCP.resources")(function* (clientName?: string) {
      return yield* collectFromConnected(
        yield* InstanceState.get(state),
        McpCatalog.resources,
        "resources",
        (resource) => resource.uri,
        clientName,
      )
    })

    const resourceTemplates = Effect.fn("MCP.resourceTemplates")(function* (clientName?: string) {
      return yield* collectFromConnected(
        yield* InstanceState.get(state),
        McpCatalog.resourceTemplates,
        "resource templates",
        (template) => template.uriTemplate,
        clientName,
      )
    })

    const withClient = Effect.fnUntraced(function* <A>(
      clientName: string,
      fn: (client: MCPClient, timeout?: number) => Promise<A>,
      label: string,
      meta?: Record<string, unknown>,
    ) {
      const s = yield* InstanceState.get(state)
      const client = s.clients[clientName]
      if (!client) {
        yield* Effect.logWarning(`client not found for ${label}`, { clientName })
        return undefined
      }
      const cfg = yield* cfgSvc.get()
      return yield* Effect.tryPromise({
        try: () => fn(client, requestTimeout(s, clientName, cfg.mcp?.[clientName], cfg.experimental?.mcp_timeout)),
        catch: (error) => error,
      }).pipe(
        Effect.tapError((error) =>
          Effect.logError(`failed to ${label}`, {
            clientName,
            ...meta,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
        Effect.orElseSucceed(() => undefined),
      )
    })

    const getPrompt = Effect.fn("MCP.getPrompt")(function* (
      clientName: string,
      name: string,
      args?: Record<string, string>,
    ) {
      return yield* withClient(
        clientName,
        (client, timeout) => client.getPrompt({ name, arguments: args }, { timeout }),
        "getPrompt",
        { promptName: name },
      )
    })

    const readResource = Effect.fn("MCP.readResource")(function* (clientName: string, resourceUri: string) {
      return yield* withClient(
        clientName,
        (client, timeout) => client.readResource({ uri: resourceUri }, { timeout }),
        "readResource",
        { resourceUri },
      )
    })

    const getMcpConfig = Effect.fnUntraced(function* (mcpName: string) {
      const s = yield* InstanceState.get(state)
      if (s.config[mcpName]) return s.config[mcpName]

      const cfg = yield* cfgSvc.get()
      const mcpConfig = cfg.mcp?.[mcpName]
      if (!mcpConfig || !isMcpConfigured(mcpConfig)) return undefined
      return mcpConfig
    })

    const requireMcpConfig = Effect.fnUntraced(function* (mcpName: string) {
      const mcpConfig = yield* getMcpConfig(mcpName)
      if (!mcpConfig) return yield* new NotFoundError({ name: mcpName })
      return mcpConfig
    })

    const startAuth = Effect.fn("MCP.startAuth")(function* (
      mcpName: string,
      // Reports the consent URL the moment the server produces it, together with the
      // state that callback will carry. Waiting for startAuth to return before acting
      // on this is what put a two to three minute gap between the click and Chrome.
      onAuthorization?: (authorizationUrl: string, oauthState: string) => void,
    ) {
      const mcpConfig = yield* requireMcpConfig(mcpName)
      if (mcpConfig.type !== "remote") throw new Error(`MCP server ${mcpName} is not a remote server`)
      if (mcpConfig.oauth === false) throw new Error(`MCP server ${mcpName} has OAuth explicitly disabled`)
      const url = remoteURL(mcpConfig.url)
      if (!url) throw new Error(`Invalid MCP URL for "${mcpName}"`)
      const connectTimeout = mcpConfig.timeout ?? DEFAULT_TIMEOUT

      // OAuth config is optional - if not provided, we'll use auto-discovery
      const oauthConfig = typeof mcpConfig.oauth === "object" ? mcpConfig.oauth : undefined

      // Resolve effective redirect URI: explicit redirectUri > callbackPort shorthand > default
      const effectiveRedirectUri =
        oauthConfig?.redirectUri ??
        (oauthConfig?.callbackPort ? `http://127.0.0.1:${oauthConfig.callbackPort}${OAUTH_CALLBACK_PATH}` : undefined)

      // Start the callback server with custom redirectUri if configured
      yield* Effect.promise(() => McpOAuthCallback.ensureRunning(effectiveRedirectUri))

      const oauthState = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
      yield* auth.updateOAuthState(mcpName, oauthState)

      // Discovery happens here rather than inside the SDK, and the consent URL is
      // built from it directly. Relying on the SDK meant one of two things happened:
      // its discovery rejected a server that is perfectly reachable (trailing slash on
      // the issuer, a resource identifier that differs from the request URL), or it
      // threw before `capturedUrl` was ever set — in which case no browser opened at
      // all and the card sat on "connecting" until the connect timed out.
      //
      // Doing it here means the URL exists within a couple of hundred milliseconds,
      // and a discovery failure is reported as itself instead of surfacing as a
      // connect failure.
      const redirectUri = effectiveRedirectUri ?? `http://127.0.0.1:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`
      const verifier = randomUUID().replace(/-/g, "")
      const challenge = yield* Effect.promise(() => Effect.runPromise(sha256Base64Url(verifier)))

      // Discovery is skipped entirely when the endpoints were recorded for this server.
// Fifteen vendors document their sign-in URL but serve no discovery document at all,
// so insisting on discovery rejected apps that are perfectly reachable.
const discovered =
  oauthConfig?.authorizationUrl && oauthConfig?.tokenUrl
    ? Effect.succeed({
        endpoints: {
          authorizationEndpoint: oauthConfig.authorizationUrl,
          tokenEndpoint: oauthConfig.tokenUrl,
        } as McpOAuthDiscovery.DiscoveryEndpoints,
        error: undefined as string | undefined,
      })
    : yield* Effect.tryPromise({
        try: () => McpOAuthDiscovery.discoverOAuthEndpoints(mcpConfig.url),
        catch: (error) => error,
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed({
            endpoints: undefined as McpOAuthDiscovery.DiscoveryEndpoints | undefined,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      )

      if (!discovered.endpoints) {
        yield* Effect.logWarning("oauth discovery found no endpoints", {
          server: mcpName,
          url: mcpConfig.url,
          reason: discovered.error,
        })
        return {
          authorizationUrl: "",
          oauthState,
          error: discovered.error,
        } satisfies AuthResult & { error?: string }
      }

      yield* Effect.logDebug("oauth discovery", {
        server: mcpName,
        url: mcpConfig.url,
        authorizationEndpoint: discovered.endpoints.authorizationEndpoint,
        tokenEndpoint: discovered.endpoints.tokenEndpoint,
        registrationEndpoint: discovered.endpoints.registrationEndpoint,
        source: discovered.endpoints.source,
      })

      // A configured client ID wins. Otherwise register dynamically, which is what
      // makes the whole flow a single browser press for most apps.
      let clientId = oauthConfig?.clientId
      let clientSecret = oauthConfig?.clientSecret
      if (!clientId && discovered.endpoints.registrationEndpoint) {
        const registered = yield* Effect.tryPromise({
          try: () =>
            McpOAuthDiscovery.registerClient(discovered.endpoints!, {
              client_name: "ZYRAXON",
              client_uri: "https://zyraxonai.lovable.app",
              redirect_uris: [redirectUri],
              grant_types: ["authorization_code", "refresh_token"],
              response_types: ["code"],
              token_endpoint_auth_method: oauthConfig?.clientSecret ? "client_secret_post" : "none",
              ...(oauthConfig?.scope ? { scope: oauthConfig.scope } : {}),
            }),
          catch: (error) => error,
        }).pipe(
          Effect.catch((error) =>
            Effect.succeed({
              registered: undefined as { client_id: string; client_secret?: string } | undefined,
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        )
        if (!registered.registered) {
          yield* Effect.logWarning("client registration refused", {
            server: mcpName,
            registrationEndpoint: discovered.endpoints.registrationEndpoint,
            reason: registered.error,
          })
          return {
            authorizationUrl: "",
            oauthState,
            error:
              registered.error ??
              "This server does not offer dynamic client registration, so a client ID and secret must be configured for it.",
          } satisfies AuthResult & { error?: string }
        }
        yield* Effect.logDebug("client registered", { server: mcpName, clientId: registered.registered.client_id })
        clientId = registered.registered.client_id
        clientSecret = registered.registered.client_secret ?? oauthConfig?.clientSecret
      }

      if (!clientId) {
        return {
          authorizationUrl: "",
          oauthState,
          error:
            "This server needs a client ID and secret before it will issue a sign-in link. Configure them under this app's OAuth settings.",
        } satisfies AuthResult & { error?: string }
      }

      // Persist the registration so the next connect does not repeat it.
      yield* Effect.promise(() =>
        auth.set(mcpName, { clientInfo: { clientId, clientSecret, clientIdIssuedAt: Date.now() }, oauthState }, mcpConfig.url),
      ).pipe(Effect.ignore)
      yield* auth.updateCodeVerifier(mcpName, verifier)

      const authorizationUrl = new URL(discovered.endpoints.authorizationEndpoint)
      authorizationUrl.searchParams.set("response_type", "code")
      authorizationUrl.searchParams.set("client_id", clientId)
      authorizationUrl.searchParams.set("redirect_uri", redirectUri)
      authorizationUrl.searchParams.set("state", oauthState)
      authorizationUrl.searchParams.set("code_challenge", challenge)
      authorizationUrl.searchParams.set("code_challenge_method", "S256")
      if (oauthConfig?.scope) authorizationUrl.searchParams.set("scope", oauthConfig.scope)

      const consentUrl = authorizationUrl.toString()

      // Hand the consent page over the moment it exists.
      //
      // This was the missing link in every OAuth connect. `startAuth` takes an
      // `onAuthorization` callback and the provider takes an `onRedirect`, and both were
      // wired to nothing: the provider's was an empty `async () => {}` and the callback
      // was simply never invoked. So no browser ever opened, `authenticate` sat waiting on
      // a loopback callback that could not be sent because nobody was ever sent to approve
      // it, and the connect died on its timeout as `Unknown error: undefined` — for all
      // sixty-odd apps, not for one vendor. Nothing here is app-specific; the sign-in page
      // was built correctly and then never shown to anybody.
      //
      // Both routes now open the browser: the direct hand-off for the page just built, and
      // the provider's redirect for the case where a later refresh is what needs consent.
      const openConsent = Effect.fn("MCP.openConsent")(function* (url: string) {
        yield* Effect.logInfo("oauth consent url ready", { server: mcpName, url })
        onAuthorization?.(url, oauthState)
      })
      yield* openConsent(consentUrl)

      // A provider that only has to hold the tokens for the pending transport: the
      // consent URL is already built, so nothing here needs to discover anything.
      const authProvider = new McpOAuthPendingProvider(
        mcpName,
        mcpConfig.url,
        {
          clientId,
          clientSecret,
          scope: oauthConfig?.scope,
          redirectUri: effectiveRedirectUri,
        },
        {
          // Plain async callback, so the page is opened by running the effect rather than
          // by yielding: a redirect arriving here means this handshake still wants
          // consent, and the browser belongs to whoever is driving it.
          onRedirect: async (url: URL) => {
            await Effect.runPromise(
              Effect.logInfo("oauth redirect during handshake", { server: mcpName, url: url.toString() }).pipe(
                Effect.andThen(openConsent(url.toString())),
                Effect.catchCause((cause) =>
                  Effect.logWarning("oauth redirect could not open a page", {
                    server: mcpName,
                    reason: Cause.pretty(cause),
                  }).pipe(Effect.ignore),
                ),
              ),
            )
          },
        },
        auth,
      )

      const transport = new StreamableHTTPClientTransport(url, {
        authProvider,
        requestInit: mcpConfig.headers ? { headers: mcpConfig.headers } : undefined,
      })
      pendingOAuthTransports.set(mcpName, { transport, provider: authProvider })
      pendingOAuthTargets.set(mcpName, {
        tokenEndpoint: discovered.endpoints.tokenEndpoint,
        clientId,
        clientSecret,
        redirectUri,
        verifier,
      })

      const directory = yield* InstanceState.directory

      // The consent URL is known now, so the browser can open immediately. The
      // transport is not brought up until the callback arrives.
      return yield* Effect.tryPromise({
        try: () => {
          const client = createClient(directory)
          void directory
          return { authorizationUrl: authorizationUrl.toString(), oauthState, client } satisfies AuthResult
        },
        catch: (error) => error,
      }).pipe(
        Effect.catch((error) => {
          // A remote server can refuse for any number of ordinary reasons: a bad
          // path, a TLS failure, a proxy, an endpoint that is simply down. Dying here
          // took the whole service down with it, so the UI showed "Unexpected server
          // error" and the browser was never even asked to open. Report it as a
          // connect failure instead, which is what it is.
          return Effect.succeed({
            authorizationUrl: "",
            oauthState,
            client: undefined,
            error: error instanceof Error ? error.message : String(error),
          } satisfies AuthResult & { error?: string })
        }),
      )
    })

    const authenticate = Effect.fn("MCP.authenticate")(function* (
      mcpName: string,
      onAuthorization?: (authorizationUrl: string) => void,
    ) {
      // startAuth reports the consent URL the instant the server produces it, so the
      // browser can open while the handshake is still unwinding.
      // Register the callback waiter and open the browser the instant the consent URL
      // exists, rather than after the whole handshake has unwound. Waiting until then is
      // what made the browser take minutes to appear, and registering the waiter late
      // risks a fast sign-in landing on a callback nobody is listening for yet.
      let callback: Promise<string> | undefined
      const openConsentPage = (authorizationUrl: string, oauthState: string) => {
        callback ??= McpOAuthCallback.waitForCallback(oauthState, mcpName)
        onAuthorization?.(authorizationUrl)
        // McpBrowser is an already-resolved Layer.succeed, so these effects need no
        // surrounding runtime and can be launched straight from the redirect callback
        // that fires while the failed handshake is still unwinding. Logging is what
        // makes a consent page that never appears answerable: the line before this
        // proves the URL was built, and the lines here say whether the browser took it.
        const open = (url: string) =>
          Effect.logInfo("opening consent page", { server: mcpName, url }).pipe(
            Effect.andThen(browser.open(url)),
            Effect.tap(() => Effect.logInfo("consent page opened", { server: mcpName })),
            Effect.catch((error) =>
              Effect.logError("consent page did not open", {
                server: mcpName,
                url,
                reason: error instanceof Error ? error.message : String(error),
              }).pipe(
                Effect.andThen(events.publish(BrowserOpenFailed, { mcpName, url }).pipe(Effect.ignore)),
                Effect.as(error),
              ),
            ),
          )
        // Registered before the launch so the SDK's own redirect lands on the same page
        // rather than being dropped, which is what left a reconnect waiting for a browser
        // that was never asked for.
        liveConsent.set(mcpName, (url: string) => open(url).pipe(Effect.ignore))
        Effect.runPromise(open(authorizationUrl)).catch(() => {})
      }
      const result = yield* startAuth(mcpName, openConsentPage)
      if (!result.authorizationUrl) {
        const client = "client" in result ? result.client : undefined
        if ("error" in result) {
          const _probe: null = result.error
          void _probe
        }
        // startAuth reports an unreachable endpoint by returning a client-less
        // result with the reason attached. Closing anything we managed to build and
        // answering with that reason is what lets the card show what actually went
        // wrong instead of claiming the sign-in was never completed.
        if ("error" in result && result.error) {
          yield* Effect.tryPromise(() => client?.close() ?? Promise.resolve()).pipe(Effect.ignore)
          return { status: "failed", error: result.error } satisfies Status
        }
        const mcpConfig = yield* requireMcpConfig(mcpName).pipe(
          Effect.tapError(() => Effect.tryPromise(() => client?.close() ?? Promise.resolve()).pipe(Effect.ignore)),
        )

        const listed = client
          ? client.getServerCapabilities()?.tools
            ? yield* McpCatalog.defs(client, mcpConfig.timeout)
            : []
          : undefined
        if (!client || !listed) {
          yield* Effect.tryPromise(() => client?.close() ?? Promise.resolve()).pipe(Effect.ignore)
          return { status: "failed", error: "Failed to get tools" } satisfies Status
        }

        const s = yield* InstanceState.get(state)
        yield* auth.clearOAuthState(mcpName)
        return yield* storeClient(s, mcpName, client, listed, client.getInstructions()?.trim(), mcpConfig.timeout)
      }

      // The consent page already opened from the redirect callback, and the callback
      // waiter was registered alongside it. Re-registering here would orphan the first
      // promise, and opening again would show the user two consent tabs.
      //
      // The handshake owns the registration for its whole length: the SDK can ask for a
      // redirect at any point while it is still unwinding, and clearing it before the
      // waiter resolves is what used to leave a reconnect with no way to show consent.
      // `ensuring` releases it on every exit, including a timeout or an interruption, so
      // a dead attempt never becomes the next connect's owner of the browser.
      return yield* Effect.gen(function* () {
        const code = yield* Effect.promise(
          () => callback ?? McpOAuthCallback.waitForCallback(result.oauthState, mcpName),
        )

        const storedState = yield* auth.getOAuthState(mcpName)
        if (storedState !== result.oauthState) {
          yield* auth.clearOAuthState(mcpName)
          throw new Error("OAuth state mismatch - potential CSRF attack")
        }
        yield* auth.clearOAuthState(mcpName)
        return yield* finishAuth(mcpName, code)
      }).pipe(Effect.ensuring(Effect.sync(() => liveConsent.delete(mcpName))))
    })

    const finishAuth = Effect.fn("MCP.finishAuth")(function* (mcpName: string, authorizationCode: string) {
      const mcpConfig = yield* requireMcpConfig(mcpName)
      const target = pendingOAuthTargets.get(mcpName)

      // The code is spent here rather than through the transport. The transport's own
      // finishAuth re-runs the SDK's discovery to find the token endpoint, which is
      // the step that rejected servers this handshake already resolved: the endpoints
      // are known, so the exchange is a plain POST.
      const exchanged = target
        ? yield* Effect.tryPromise({
            try: () => exchangeAuthorizationCode(target, authorizationCode),
            catch: (error) => error,
          }).pipe(
            Effect.match({
              onFailure: (error) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
              onSuccess: (tokens) => ({ ok: true as const, tokens }),
            }),
          )
        : undefined

      if (exchanged && !exchanged.ok) {
        pendingOAuthTargets.delete(mcpName)
        pendingOAuthTransports.delete(mcpName)
        return { status: "failed", error: `OAuth completion failed: ${exchanged.error}` } satisfies Status
      }

      if (exchanged?.ok && exchanged.tokens) {
        yield* auth.updateTokens(
          mcpName,
          {
            accessToken: exchanged.tokens.access_token,
            refreshToken: exchanged.tokens.refresh_token,
            expiresAt: exchanged.tokens.expires_in ? Date.now() / 1000 + exchanged.tokens.expires_in : undefined,
            scope: exchanged.tokens.scope,
          },
          mcpConfig.url,
        )
      } else {
        const pending = pendingOAuthTransports.get(mcpName)
        if (!pending) throw new Error(`No pending OAuth flow for MCP server: ${mcpName}`)
        const error = yield* Effect.tryPromise({
          try: () => pending.transport.finishAuth(authorizationCode),
          catch: (error) => error,
        }).pipe(
          Effect.match({
            onFailure: (error) => (error instanceof Error ? error.message : String(error)),
            onSuccess: () => undefined,
          }),
        )
        if (error) return { status: "failed", error: `OAuth completion failed: ${error}` } satisfies Status
        yield* Effect.promise(() => pending.provider?.commit() ?? Promise.resolve())
      }

      yield* auth.clearCodeVerifier(mcpName)
      pendingOAuthTargets.delete(mcpName)
      pendingOAuthTransports.delete(mcpName)

      return yield* createAndStore(mcpName, { ...mcpConfig, enabled: true })
    })

    const removeAuth = Effect.fn("MCP.removeAuth")(function* (mcpName: string) {
      yield* auth.remove(mcpName)
      McpOAuthCallback.cancelPending(mcpName)
      pendingOAuthTransports.delete(mcpName)
      liveConsent.delete(mcpName)
    })

    const supportsOAuth = Effect.fn("MCP.supportsOAuth")(function* (mcpName: string) {
      const mcpConfig = yield* requireMcpConfig(mcpName)
      return mcpConfig.type === "remote" && mcpConfig.oauth !== false
    })

    const hasStoredTokens = Effect.fn("MCP.hasStoredTokens")(function* (mcpName: string) {
      const entry = yield* auth.get(mcpName)
      return !!entry?.tokens
    })

    const getAuthStatus = Effect.fn("MCP.getAuthStatus")(function* (mcpName: string) {
      const runtimeConfig = (yield* InstanceState.has(state))
        ? (yield* InstanceState.get(state)).config[mcpName]
        : undefined
      const mcpConfig = runtimeConfig ?? (yield* cfgSvc.get()).mcp?.[mcpName]
      if (!mcpConfig || !isMcpConfigured(mcpConfig) || mcpConfig.type !== "remote") return "not_authenticated"
      const entry = yield* auth.getForUrl(mcpName, mcpConfig.url)
      if (!entry?.tokens) return "not_authenticated"
      if (entry.tokens.expiresAt && entry.tokens.expiresAt < Date.now() / 1000) return "expired"
      return "authenticated"
    })

    const openUrl = Effect.fn("MCP.openUrl")(function* (url: string) {
      yield* browser.open(url)
    })

    return Service.of({
      status,
      clients,
      instructions,
      tools,
      prompts,
      resources,
      resourceTemplates,
      add,
      connect,
      disconnect,
      getPrompt,
      readResource,
      startAuth,
      authenticate,
      finishAuth,
      removeAuth,
      supportsOAuth,
      hasStoredTokens,
      getAuthStatus,
      openUrl,
    })
  }),
)

export type AuthStatus = "authenticated" | "expired" | "not_authenticated"

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [CrossSpawnSpawner.node, McpAuth.node, EventV2Bridge.node, Config.node, McpBrowser.node],
})

export * as MCP from "."
