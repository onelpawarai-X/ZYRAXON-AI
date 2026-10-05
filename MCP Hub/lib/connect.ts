// MCP Hub - connect an app and hand its tools to the agent.
//
// The heavy lifting (transport, OAuth, dynamic client registration, token
// storage) already lives in ZYRAXON under packages/zyraxon/src/mcp. This module
// is the thin layer the Hub UI talks to, so nothing outside "MCP Hub/" changes.

import type { AppEntry } from "../catalog/seed"
import { McpClient } from "./client"
import { resolveApp, type Resolution } from "./resolve"

export { McpClient, resolveApp }
export type { Resolution }

export type ConnectionState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "needs_auth" }
  | { status: "connected"; toolCount: number }
  | { status: "failed"; error: string }

/** mirrors MCP.Status on the server, plus the message a failure carries */
export interface McpStatusEntry {
  status: "connected" | "failed" | "needs_auth" | "needs_client_registration" | "disabled"
  error?: string
}

/**
 * The ZYRAXON runtime exposes the MCP service through the app context.
 * The Hub receives it as a dependency so the module stays testable on its own.
 */
export interface McpRuntime {
  /** live status of every configured server, keyed by name */
  statuses: () => Promise<Record<string, McpStatusEntry>>
  /** every tool the agent can currently call */
  toolNames: () => Promise<string[]>
  /** connect a server that the config already declares */
  connect: (name: string) => Promise<void>
  /** declare a new server and bring it up, reporting whatever it settles on */
  addServer: (name: string, config: Record<string, unknown>) => Promise<McpStatusEntry | undefined>
  /**
   * Run the OAuth handshake to completion.
   *
   * The server owns the browser: it opens the app's consent page in the real
   * profile that already holds the session, then blocks on its own local
   * callback. So this only settles once the user has clicked Allow.
   */
  authenticate: (name: string) => Promise<void>
  /**
   * Detach a server.
   *
   * Separate from `connect` on purpose: a connected server keeps its tools callable
   * by the agent, so leaving one attached has to be possible without editing config
   * by hand. `forgetCredentials` also clears any stored tokens, which is what a user
   * means by "disconnect my GitHub".
   */
  disconnect?: (name: string, options?: { forgetCredentials?: boolean }) => Promise<void>
}

/** Build the ZYRAXON config entry for an app. */
export function toServerConfig(app: AppEntry, token?: string): Record<string, unknown> {
  if (app.kind === "local") {
    // Bundled local servers are declared by ZYRAXON's own defaults and need nothing.
    // One that ships its own launch command has to be declared here or it can never
    // start, so it becomes a normal local entry pointing at that command.
    if (!app.command) return {}
    return { type: "local", command: [app.command.command, ...app.command.args], enabled: true }
  }
  // The 5s default is a per-request budget, and a first connect has to negotiate
  // a session and list every tool before it can report anything. Give hosted
  // servers room, or a slow one just times out and looks like a hang.
  const config: Record<string, unknown> = { type: "remote", url: app.url, enabled: true, timeout: 30_000 }
  if (token) {
    config.headers = { Authorization: `Bearer ${token}` }
  } else if (app.kind === "oauth") {
    // Recorded endpoints come first; the scope is only meaningful alongside them,
    // and a server that publishes discovery gets scope from there instead.
    config.oauth = app.oauth
      ? { authorizationUrl: app.oauth.authorizationUrl, tokenUrl: app.oauth.tokenUrl, ...(app.scope ? { scope: app.scope } : {}) }
      : app.scope
        ? { scope: app.scope }
        : {}
  }
  return config
}

/** statuses that mean the server has stopped moving */
const SETTLED = new Set(["connected", "failed", "needs_auth", "needs_client_registration"])

/** how long a transport gets to answer before we call it unreachable */
const CONNECT_TIMEOUT_MS = 45_000
/**
 * How long a first connect is given to succeed on its own before sign-in is started.
 *
 * Short on purpose. The overwhelmingly common case is an OAuth app refusing an
 * anonymous request, and that refusal is what we are waiting for — but a public
 * server is usually live within this window too, so the trade costs a genuinely
 * ready server very little and saves every OAuth app the full connect timeout.
 */
const NEEDS_AUTH_PROBE_MS = 2_500
/** a person has to read a consent page and press Allow, so allow minutes */
const AUTH_TIMEOUT_MS = 240_000
const POLL_MS = 400

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Watch one server until it reaches a state worth acting on.
 *
 * A connect attempt is asynchronous: the runtime opens the transport, negotiates
 * a session, and only then reports connected, needs_auth or failed. Reading the
 * status on the very next tick sees nothing useful, which is what used to leave
 * every card on "Connecting…" forever with no sign-in ever offered.
 *
 * `until` exists because "settled" means different things at different moments.
 * Before sign-in, needs_auth is the interesting answer and waiting past it is
 * wrong. After sign-in starts it is the answer we already have, so the only
 * useful thing left to wait for is a state that is no longer needs_auth.
 */
export async function waitForStatus(
  runtime: McpRuntime,
  name: string,
  timeoutMs = CONNECT_TIMEOUT_MS,
  until: (status: McpStatusEntry["status"]) => boolean = (status) => SETTLED.has(status),
): Promise<McpStatusEntry> {
  const deadline = Date.now() + timeoutMs
  let last: McpStatusEntry = { status: "disabled" }
  while (Date.now() < deadline) {
    try {
      const entry = (await runtime.statuses())[name]
      if (entry) {
        last = entry
        if (until(entry.status)) return entry
      }
    } catch {
      /* the server may be restarting; keep watching */
    }
    await delay(POLL_MS)
  }
  return last
}

/** The answer after sign-in: live, or a refusal. Nothing else counts. */
const afterAuth = (status: McpStatusEntry["status"]) =>
  status === "connected" || status === "failed" || status === "needs_client_registration"

/**
 * The answer before sign-in. needs_auth is the expected result here rather than a
 * dead end, so it counts immediately instead of being waited out for the full
 * connect budget — which is what left every OAuth card spinning with no browser.
 */
const isSettledEarly = (status: McpStatusEntry["status"]) =>
  afterAuth(status) || status === "needs_auth"

export interface ConnectOptions {
  /** bearer token, for apps that do not speak OAuth */
  token?: string
  /** report intermediate states so a card can say "check your browser" */
  onProgress?: (state: ConnectionState) => void
}

/**
 * Connect an app and return the state the card should render.
 *
 * The browser is never opened from here. The server does it, in the user's real
 * profile, which is why signing in leaves the app already logged in.
 */
export async function connectApp(runtime: McpRuntime, app: AppEntry, options: ConnectOptions = {}) {
  const { token, onProgress } = options
  return await attempt(runtime, app, token, onProgress, 0)
}

/** how many times a connect is tried before it is called unreachable */
const MAX_ATTEMPTS = 4
const RETRY_BASE_MS = 1200

/**
 * One attempt, retried until it works.
 *
 * Every failure here is temporary in practice: a cold DNS lookup, a slow TLS
 * handshake, a hosted endpoint mid-restart, a rate limit. Giving up on the first
 * one showed the user "failed" for something they did nothing wrong about.
 */
async function attempt(
  runtime: McpRuntime,
  app: AppEntry,
  token: string | undefined,
  onProgress: ((state: ConnectionState) => void) | undefined,
  retry: number,
): Promise<ConnectionState> {
  let reason = "could not reach the server"
  // A retry re-opens the consent page from scratch, so it is only fair before the
  // browser ever appeared. Once a person has been through sign-in, another silent
  // round of attempts just stacks browser tabs and multiplies the wait.
  let signedIn = false
  try {
    const config = toServerConfig(app, token)
    onProgress?.({ status: "connecting" })

    // Local servers are already declared by ZYRAXON's own defaults, so there is
    // nothing to add; just wake the one that is configured.
    if (Object.keys(config).length === 0) {
      await runtime.connect(app.id)
      return await settle(runtime, app.id, await waitForStatus(runtime, app.id))
    }

    // An OAuth app is *expected* to answer this first request with a 401 carrying
    // the authorization URL. Waiting for addServer to resolve before starting the
    // handshake therefore guaranteed a wait: the transport had to finish its own
    // connect attempt, and only then would anyone look at the status and notice it
    // needs auth. That is where the ten to fifty second wait came from — the browser
    // could not open before a connect that could not succeed without a browser.
    //
    // Both are started together and neither is awaited before the other has had its
    // chance. Whichever reaches needs_auth first moves us on; the connect result is
    // still collected so a server that turns out to be live does not get abandoned.
    const addPromise = runtime.addServer(app.id, config).catch((error: unknown) => {
      reason = error instanceof Error ? error.message : String(error)
      return undefined
    })

    // Give the connect a short head start so a genuinely public server that is
    // already up is not dragged through a sign-in it does not need.
    const added = await Promise.race([
      addPromise,
      delay(NEEDS_AUTH_PROBE_MS).then(() => undefined),
    ])

    if (added?.status === "connected") return await settle(runtime, app.id, added)

    const first = added ?? (await waitForStatus(runtime, app.id, CONNECT_TIMEOUT_MS, isSettledEarly))
    if (first.status === "connected") {
      void addPromise
      return await settle(runtime, app.id, first)
    }

    if (first.status === "failed" && added) {
      reason = first.error ?? reason
    } else {
      signedIn = true
      onProgress?.({ status: "needs_auth" })
      // addServer is deliberately not awaited: the handshake owns the outcome from
      // here, and waiting on the abandoned connect would re-introduce the delay.
      void addPromise
      const settled = await authenticate(runtime, app.id)
      if (settled.status !== "failed") return await settle(runtime, app.id, settled)
      reason = settled.error ?? reason
    }
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error)
  }

  if (signedIn || retry >= MAX_ATTEMPTS - 1) {
    const failed: ConnectionState = { status: "failed", error: reason }
    onProgress?.(failed)
    return failed
  }

  // Brief, growing pause so a struggling endpoint gets room without the user
  // staring at a frozen screen.
  onProgress?.({ status: "connecting" })
  await delay(RETRY_BASE_MS * (retry + 1))
  return await attempt(runtime, app, token, onProgress, retry + 1)
}

/**
 * Run the OAuth handshake, letting a rejection win the race against the poll.
 *
 * authenticate's *return* is not the answer. Resolving it means the browser flow
 * finished and the runtime still has to spend the new token and report connected,
 * so a successful resolve must never settle this function on its own — only the
 * status poll may do that.
 *
 * It previously mapped a successful resolve to `needs_auth` and raced it against
 * the poll. A resolved promise wins in a microtask while the poll sleeps 400ms, so
 * every completed sign-in returned instantly with `needs_auth` and the card
 * reported "sign-in was never completed" while Chrome was sitting on
 * "Authorization successful".
 */
async function authenticate(runtime: McpRuntime, name: string): Promise<McpStatusEntry> {
  const rejection = runtime.authenticate(name).then(
    // Success hands the answer to the status poll and waits for it.
    () => new Promise<McpStatusEntry>(() => {}),
    (error: unknown): McpStatusEntry => ({
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  )

  return await Promise.race([waitForStatus(runtime, name, AUTH_TIMEOUT_MS, afterAuth), rejection])
}

/** Turn a server status into the state a card renders. */
async function settle(runtime: McpRuntime, name: string, status: McpStatusEntry): Promise<ConnectionState> {
  // countTools is async, so this has to await. Reading it synchronously handed the
  // UI a Promise, which rendered as an empty tool count and made a live server look
  // like it had contributed nothing to the agent.
  if (status.status === "connected") return { status: "connected", toolCount: await countTools(runtime, name) }
  if (status.status === "failed") return { status: "failed", error: explain(name, status.error) }
  if (status.status === "needs_auth" || status.status === "needs_client_registration")
    return { status: "failed", error: explain(name, status.error ?? "sign-in was never completed") }
  return { status: "failed", error: `never finished connecting (last status: ${status.status})` }
}

/**
 * Some servers refuse in a way that is really a missing setup step, and the raw
 * status does not say so. Atlassian is the clearest case: its remote MCP is scoped
 * to a site, so a signed-in account with no site — or one that is not an admin of
 * the site it picked — gets "Access denied" and no way to tell that from a real
 * permission problem.
 *
 * Naming the missing step is the difference between a user who can fix it and a
 * user who gives up on the app.
 */
function explain(name: string, error: string | undefined): string {
  const message = error ?? "the server refused the connection"

  if (/access denied|forbidden|403/i.test(message) && /atlassian|jira|confluence/i.test(name)) {
    return (
      "Atlassian refused this account. Its MCP is scoped to a single site, so an account that has not created one — " +
      "or is not an admin of the site it defaults to — is denied. Create a site or pick a different one at " +
      "https://id.atlassian.com/manage-sites, then try again."
    )
  }

  // An SSE refusal says nothing useful; the real cause is almost always the first
  // transport, which the server side now preserves.
  if (/^SSE error/i.test(message)) {
    return `The server did not accept the connection. ${message.replace(/^SSE error:?\s*/i, "").trim()}`
  }

  return message
}

/** How many of the agent's tools came from this server. */
export async function countTools(runtime: McpRuntime, serverName: string): Promise<number> {
  const prefix = serverName.replace(/[^a-zA-Z0-9_-]/g, "_") + "_"
  return (await runtime.toolNames()).filter((t) => t.startsWith(prefix)).length
}

/**
 * A friendly one-line summary of a connection, used by the UI cards.
 */
export function describe(state: ConnectionState): string {
  switch (state.status) {
    case "connected":
      return state.toolCount > 0
        ? `${state.toolCount} tools available to the agent`
        : "Connected and ready for the agent"
    case "needs_auth":
      return "Approve it in the browser that just opened"
    case "connecting":
      return "Connecting…"
    case "failed":
      return state.error
    default:
      return "Not connected"
  }
}
