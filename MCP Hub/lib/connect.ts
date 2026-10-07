// MCP Hub — connect an app and hand its tools to the agent.
//
// The transport, OAuth handshake, client registration and token storage all live in
// ZYRAXON under packages/zyraxon/src/mcp. This is the layer the Hub UI talks to, so
// nothing outside "MCP Hub/" has to change for a connect to work.
//
// One press of Connect shares a single three-minute deadline, retries included. The
// per-request budget inside the transport is a minute, because a real connect also runs
// discovery and client registration on top of the handshake, and ten seconds is what
// produced "Operation timed out after 10000ms". A healthy server still answers in under
// five seconds; the ceiling only exists so a broken endpoint cannot watch a spinner
// forever.

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
 * The ZYRAXON runtime exposes MCP through the app context.
 *
 * The Hub receives it as a dependency, which keeps this module testable without a
 * running app behind it. Every member here is implemented by bindRuntime in
 * ./runtime, so a card can rely on all of them.
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
   * The server owns the browser: it opens the consent page in the real profile that
   * already holds the session, then blocks on its own loopback callback. So this only
   * settles once the user has clicked Allow.
   */
  authenticate: (name: string) => Promise<void>
  /**
   * Detach a server for good.
*
   * This stops the live transport and marks the config entry disabled, and - with
   * `forgetCredentials` - clears the stored tokens and any client registration. That
   * last part is what a user means by "disconnect my GitHub": leaving credentials
   * behind would silently sign the app back in on the next start.
   *
   * The config write is a deep merge, so the entry is disabled rather than deleted. A
   * key left out of a merge survives it, and this interface has no way to express a
   * delete; the runtime documents the same thing where it does the write.
   */
  disconnect: (name: string, options?: { forgetCredentials?: boolean }) => Promise<void>
  /**
   * The browser used for MCP sign-in, when the user picked one by hand.
   *
   * Empty string means nobody chose one and the server discovers installed browsers.
   * This is the same setting the agent's mcp_connect respects, so fixing it here fixes
   * the consent pages the model opens too.
   */
  getBrowserPath: () => Promise<string>
  /** Set (or clear, with an empty string) the browser used for MCP sign-in. */
  setBrowserPath: (path: string) => Promise<void>
  /**
   * Whether a sign-in already exists for this server.
   *
   * This is what separates "the server refused because nobody is signed in" from "the
   * credential we hold was rejected", and only the first is worth opening a browser for.
   */
  hasTokens: (name: string) => Promise<boolean>
}

/**
 * The per-request budget inside the transport.
 *
 * A first connect has to negotiate a session and list every tool before it can report
 * anything. Ten seconds was measured against a direct `initialize` and held for a public
 * server, but a real connect also runs discovery and client registration on top, and that
 * is where "Operation timed out after 10000ms" came from. A minute is the ceiling for one
 * request; the whole press is governed by CONNECT_TIMEOUT_MS below.
 */
const REQUEST_TIMEOUT_MS = 60_000

/**
 * How long one press of Connect may take in total, retry included.
 *
 * Three minutes, which is what a person is willing to wait while a browser tab asks them
 * to approve something. It is a ceiling for a broken endpoint rather than an expected
 * wait: a healthy server still answers in under five seconds. Every retry shares this one
 * deadline, so a second attempt can never double the wait the user was promised.
 */
const CONNECT_TIMEOUT_MS = 180_000

/**
 * How long an anonymous connect is given before sign-in is assumed.
 *
 * Short on purpose. The common case by far is an OAuth app refusing an anonymous
 * request, and that refusal is exactly what is being waited for — but a public server is
 * usually live inside this window too, so the trade costs a genuinely ready server very
 * little and saves every OAuth app the full connect budget.
 */
const NEEDS_AUTH_PROBE_MS = 1_200

/**
 * How long the sign-in itself is given.
 *
 * Matches the connect budget: three minutes from the moment the consent page opens.
 */
const AUTH_TIMEOUT_MS = 180_000

/** How often the status is read while waiting. */
const POLL_MS = 250

/**
 * Attempts before a connect is called unreachable.
 *
 * Two, not four. Every server in the catalog answers inside five seconds, so a second
 * failure is a real failure and three more attempts only multiplied the wait without
 * ever changing the outcome. Whatever is worth retrying — a cold DNS lookup, a TLS
 * handshake — succeeds on the first retry.
 */
const MAX_ATTEMPTS = 2
const RETRY_BASE_MS = 800

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** statuses that mean the server has stopped moving */
const SETTLED = new Set(["connected", "failed", "needs_auth", "needs_client_registration"])

/** The answer after sign-in: live, or a refusal. Nothing else counts. */
const afterAuth = (status: McpStatusEntry["status"]) =>
  status === "connected" || status === "failed" || status === "needs_client_registration"

/**
 * The answer before sign-in.
 *
 * `needs_auth` is the expected result here rather than a dead end, so it counts at
 * once instead of being waited out for the full budget — which is what left every
 * OAuth card spinning with no browser ever offered.
 */
const isSettledEarly = (status: McpStatusEntry["status"]) =>
  afterAuth(status) || status === "needs_auth"

/** Build the ZYRAXON config entry for an app. */
export function toServerConfig(app: AppEntry, token?: string): Record<string, unknown> {
  if (app.kind === "local") {
    // Bundled local servers are declared by ZYRAXON's own defaults and need nothing.
    // One that ships its own launch command has to be declared here or it can never
    // start, so it becomes a normal local entry pointing at that command.
    if (!app.command) return {}
    return { type: "local", command: [app.command.command, ...app.command.args], enabled: true, timeout: REQUEST_TIMEOUT_MS }
  }

  if (!app.url) return {}

  const config: Record<string, unknown> = { type: "remote", url: app.url, enabled: true, timeout: REQUEST_TIMEOUT_MS }

  if (token) {
    config.headers = { Authorization: `Bearer ${token}` }
    return config
  }

  if (app.kind === "oauth") {
    // Recorded endpoints come first; the scope is only meaningful alongside them, and
    // a server that publishes discovery gets scope from there instead.
    config.oauth = app.oauth
      ? {
          authorizationUrl: app.oauth.authorizationUrl,
          tokenUrl: app.oauth.tokenUrl,
          ...(app.scope ? { scope: app.scope } : {}),
        }
      : app.scope
        ? { scope: app.scope }
        : {}
  }

  return config
}

/**
 * Watch one server until it reaches a state worth acting on.
 *
 * A connect is asynchronous: the runtime opens the transport, negotiates a session,
 * and only then reports connected, needs_auth or failed. Reading the status on the
 * next tick sees nothing useful, which is what used to leave every card on
 * "Connecting…" forever with no sign-in ever offered.
 *
 * `until` exists because "settled" means different things at different moments.
 * Before sign-in, needs_auth is the interesting answer and waiting past it is wrong.
 * After sign-in has started it is the answer already held, so the only useful thing
 * left to wait for is a state that is no longer needs_auth.
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

export interface ConnectOptions {
  /** bearer token, for apps that do not speak OAuth */
  token?: string
  /** report intermediate states so a card can say "check your browser" */
  onProgress?: (state: ConnectionState) => void
}

/**
 * Connect an app and return the state its card should render.
 *
 * The browser is never opened from here. The server does it, in the user's real
 * profile, which is why signing in leaves the app already logged in.
 */
export async function connectApp(runtime: McpRuntime, app: AppEntry, options: ConnectOptions = {}) {
  // One deadline for the whole press, retries included, so the three minutes promised to
  // the user is a ceiling on the wait rather than a per-attempt budget.
  const deadline = Date.now() + CONNECT_TIMEOUT_MS
  return await attempt(runtime, app, options.token, options.onProgress, 0, deadline)
}

/** Milliseconds left on a deadline, never below zero — a poll that has run out stops. */
const remaining = (deadline: number) => Math.max(0, deadline - Date.now())

/**
 * One attempt, retried until it works or the budget is spent.
 *
 * Every failure worth retrying is temporary in practice: a cold DNS lookup, a slow TLS
 * handshake, a hosted endpoint mid-restart, a rate limit. Giving up on the first one
 * showed the user "failed" for something they did nothing wrong about.
 */
async function attempt(
  runtime: McpRuntime,
  app: AppEntry,
  token: string | undefined,
  onProgress: ((state: ConnectionState) => void) | undefined,
  retry: number,
  deadline: number,
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
      return await settle(runtime, app.id, await waitForStatus(runtime, app.id, remaining(deadline)))
    }

    // An OAuth app is *expected* to answer this first request with a 401 carrying its
    // own authorization details. Waiting for addServer to resolve before starting the
    // handshake therefore guaranteed a wait: the transport had to finish its own
    // connect attempt, and only then would anyone look at the status and notice it
    // needs auth. That is where the ten-to-fifty second wait came from — the browser
    // could not open before a connect that could not succeed without a browser.
    //
    // Both start together and neither is awaited before the other has had its chance.
    // Whichever reaches needs_auth first moves us on; the connect result is still
    // collected so a server that turns out to be live does not get abandoned.
    const addPromise = runtime.addServer(app.id, config).catch((error: unknown) => {
      reason = error instanceof Error ? error.message : String(error)
      return undefined
    })

    // A short head start, so a genuinely public server that is already up is not
    // dragged through a sign-in it does not need.
    const added = await Promise.race([addPromise, delay(NEEDS_AUTH_PROBE_MS).then(() => undefined)])

    if (added?.status === "connected") return await settle(runtime, app.id, added)

    const first = added ?? (await waitForStatus(runtime, app.id, remaining(deadline), isSettledEarly))
    if (first.status === "connected") {
      void addPromise
      return await settle(runtime, app.id, first)
    }

    // A remote OAuth server answers the first request with 401 by design, and the
    // transport reports that as `failed` rather than `needs_auth` unless the 401 arrives
    // as an `UnauthorizedError`. Treating that as the end meant the browser never opened
    // and the card showed the raw refusal — which is why sign-in did nothing for most
    // apps while the few vendors that name OAuth in their error still worked.
    //
    // So a first answer that is not `connected` and carries no stored token goes to the
    // browser regardless of how the transport dressed the 401 up. `authenticate` reports
    // the real error if the server turns out to be unreachable, so nothing is hidden by
    // trying. A server that already holds a token keeps its failure: that is a bad token,
    // and re-prompting would not fix it.
    const alreadySignedIn = signedIn || (await runtime.hasTokens(app.id).catch(() => false))
    if (first.status === "failed" && alreadySignedIn) {
      reason = first.error ?? reason
    } else {
      signedIn = true
      onProgress?.({ status: "needs_auth" })
      // addServer is deliberately not awaited: the handshake owns the outcome from
      // here, and waiting on the abandoned connect would re-introduce the delay.
      void addPromise
      const settled = await authenticate(runtime, app.id, deadline)
      if (settled.status !== "failed") return await settle(runtime, app.id, settled)
      reason = settled.error ?? reason
    }
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error)
  }

  // A retry is only worth starting while there is still part of the shared budget left.
  if (signedIn || retry >= MAX_ATTEMPTS - 1 || remaining(deadline) < RETRY_BASE_MS) {
    const failed: ConnectionState = { status: "failed", error: explain(app.id, reason) }
    onProgress?.(failed)
    return failed
  }

  // A brief, growing pause, so a struggling endpoint gets room without a frozen screen.
  onProgress?.({ status: "connecting" })
  await delay(RETRY_BASE_MS * (retry + 1))
  return await attempt(runtime, app, token, onProgress, retry + 1, deadline)
}

/**
 * Run the OAuth handshake, letting a rejection win the race against the poll.
 *
 * authenticate's *return* is not the answer. Resolving it means the browser flow
 * finished and the runtime still has to spend the new token and report connected, so a
 * successful resolve must never settle this function on its own — only the status poll
 * may do that.
 *
 * It previously mapped a successful resolve to `needs_auth` and raced it against the
 * poll. A resolved promise wins in a microtask while the poll sleeps, so every
 * completed sign-in returned instantly with `needs_auth` and the card reported "sign-in
 * was never completed" while Chrome sat on "Authorization successful".
 */
async function authenticate(runtime: McpRuntime, name: string, deadline: number): Promise<McpStatusEntry> {
  const rejection = runtime.authenticate(name).then(
    // Success hands the answer to the status poll and waits for it.
    () => new Promise<McpStatusEntry>(() => {}),
    (error: unknown): McpStatusEntry => ({
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  )

  // Whichever ends first: the sign-in budget, the shared connect deadline, or a refusal.
  const budget = Math.min(AUTH_TIMEOUT_MS, remaining(deadline))
  return await Promise.race([waitForStatus(runtime, name, budget, afterAuth), rejection])
}

/** Turn a server status into the state a card renders. */
async function settle(runtime: McpRuntime, name: string, status: McpStatusEntry): Promise<ConnectionState> {
  // countTools is async, so this has to await. Reading it synchronously handed the UI
  // a Promise, which rendered as an empty tool count and made a live server look like
  // it had contributed nothing to the agent.
  if (status.status === "connected") return { status: "connected", toolCount: await countTools(runtime, name) }
  if (status.status === "failed") return { status: "failed", error: explain(name, status.error) }
  if (status.status === "needs_auth" || status.status === "needs_client_registration")
    return { status: "failed", error: explain(name, status.error ?? "sign-in was never completed") }
  return { status: "failed", error: `never finished connecting (last status: ${status.status})` }
}

/**
 * Some servers refuse in a way that is really a missing setup step, and the raw status
 * does not say so.
 *
 * Atlassian is the clearest case: its remote MCP is scoped to a site, so a signed-in
 * account with no site — or one that is not an admin of the site it picked — gets
 * "Access denied" and no way to tell that from a real permission problem. Nine vendors
 * publish no client-registration endpoint, which is a refusal too and reads as nothing
 * in particular unless it is named.
 *
 * Naming the missing step is the difference between a user who can fix it and a user
 * who gives up on the app.
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

  // A server that will not register clients needs one made by hand, and says nothing
  // useful when it refuses to.
  if (/client[_ ]?id|registration/i.test(message) && /(not|no|does not|doesn't)/i.test(message)) {
    return (
      `${name} does not let a new client register itself, so it needs a client ID created in that vendor's own ` +
      "developer console before it can connect. The sign-in details were found; only the client ID is missing."
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