// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createConnection } from "net"
import { createServer } from "http"
import { OauthCallbackPage } from "@zyraxon-ai/core/oauth/page"
import { OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH, parseRedirectUri } from "./oauth-provider"

const OAUTH_CALLBACK_HOST = "127.0.0.1"

// Current callback server configuration (may differ from defaults if custom redirectUri is used)
let currentPort = OAUTH_CALLBACK_PORT
let currentPath = OAUTH_CALLBACK_PATH

interface PendingAuth {
  resolve: (code: string) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
  /** the state this handshake was started with, kept so it can be compared without a map walk */
  oauthState: string
}

let server: ReturnType<typeof createServer> | undefined
const pendingAuths = new Map<string, PendingAuth>()
// Reverse index: mcpName → oauthState, so cancelPending(mcpName) can
// find the right entry in pendingAuths (which is keyed by oauthState).
const mcpNameToState = new Map<string, string>()

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
/** A human walking through a consent page should not be cut off mid-click. */
const CLOSING_GRACE_MS = 30_000

/**
 * Does this request look like it came from a browser rather than a script?
 *
 * This is the only defence against a page on the internet posting to the loopback
 * listener. The state check stops an unrelated request from being treated as ours; it
 * does not stop a request that a malicious page supplies its own state for, which is
 * exactly what a browser can do to 127.0.0.1 without any user interaction. Requiring the
 * browser's own `Sec-Fetch-Site: same-origin` header does stop it, because a page is not
 * permitted to set that header at all — it is added by the browser and cannot be forged
 * from script or from a form post.
 *
 * Not a substitute for state. Both are required: state proves the callback belongs to a
 * handshake we started, and this header proves it was the browser that followed the
 * redirect rather than something else that knew the port.
 */
function isFromTheBrowser(req: import("http").IncomingMessage): boolean {
  const site = req.headers["sec-fetch-site"]
  if (typeof site !== "string") return false
  return site === "same-origin" || site === "none"
}

function cleanupStateIndex(oauthState: string) {
  for (const [name, state] of mcpNameToState) {
    if (state === oauthState) {
      mcpNameToState.delete(name)
      break
    }
  }
}

/**
 * Close the listener once no handshake is waiting on it.
 *
 * `close()` only stops the listener accepting new connections; it waits for the open ones
 * to finish. The browser holds the page it was redirected to, so every sign-in left the
 * socket open and this promise never settled — the previous version awaited it inline and
 * the whole callback path hung at the end of a successful sign-in.
 *
 * So the sockets are tracked and dropped after a grace period. Long enough that a person
 * reading the success page is never interrupted, short enough that the port is free long
 * before anybody reconnects.
 */
function stopIfIdle() {
  if (pendingAuths.size > 0 || !server) return

  const closing = server
  server = undefined

  closing.close()

  const sockets = new Set<import("net").Socket>()
  closing.on("connection", (socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
  })

  const force = setTimeout(() => {
    for (const socket of sockets) socket.destroy()
  }, CLOSING_GRACE_MS)

  // Nothing left to wait for: do not hold the process open for the grace period.
  force.unref?.()
  closing.on("close", () => clearTimeout(force))
}

function handleRequest(req: import("http").IncomingMessage, res: import("http").ServerResponse) {
  const url = new URL(req.url || "/", `http://localhost:${currentPort}`)

  if (url.pathname !== currentPath) {
    res.writeHead(404)
    res.end("Not found")
    return
  }

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  /**
   * Only the browser that followed the redirect may hand us a code.
   *
   * Checked before anything else because it is the one check a hostile page cannot pass:
   * `Sec-Fetch-Site` is added by the browser and a page is not allowed to set it. Without
   * it, any site could post to 127.0.0.1 with a state of its own choosing and be handed a
   * real authorization code, and the state check alone would pass because the attacker
   * supplied that state themselves.
   *
   * A rejected request never touches `pendingAuths`. Tearing down a handshake because a
   * stranger knocked on the door would let anyone cancel somebody else's sign-in.
   */
  if (!isFromTheBrowser(req)) {
    res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" })
    res.end(OauthCallbackPage.error("This sign-in link can only be completed by the browser that started it.", { provider: "MCP" }))
    return
  }

  // Enforce state parameter presence
  if (!state) {
    const errorMsg = "Missing required state parameter - potential CSRF attack"
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
    res.end(OauthCallbackPage.error(errorMsg, { provider: "MCP" }))
    return
  }

  if (error) {
    const errorMsg = errorDescription || error
    if (pendingAuths.has(state)) {
      const pending = pendingAuths.get(state)!
      clearTimeout(pending.timeout)
      pendingAuths.delete(state)
      cleanupStateIndex(state)
      pending.reject(new Error(errorMsg))
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(OauthCallbackPage.error(errorMsg, { provider: "MCP" }))
    stopIfIdle()
    return
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
    res.end(OauthCallbackPage.error("No authorization code provided", { provider: "MCP" }))
    return
  }

  // Validate state parameter
  if (!pendingAuths.has(state)) {
    /**
     * Nothing is rejected here, because nothing is holding a promise for this state.
     *
     * The waiting side is rejected when its own wait ends, so leaving it alone here is what
     * keeps a bad callback from being confused with the real one. But a stale state is
     * still removed when it names a server we are tracking, because otherwise that server's
     * entry outlives the attempt and the next sign-in for it inherits a stale reverse index.
     */
    if (mcpNameToState.has(state)) cleanupStateIndex(state)

    const errorMsg = "Invalid or expired state parameter - potential CSRF attack"
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
    res.end(OauthCallbackPage.error(errorMsg, { provider: "MCP" }))
    return
  }

  const pending = pendingAuths.get(state)!

  clearTimeout(pending.timeout)
  pendingAuths.delete(state)
  cleanupStateIndex(state)
  pending.resolve(code)

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
  res.end(OauthCallbackPage.success({ provider: "MCP" }))
  stopIfIdle()
}

export async function ensureRunning(redirectUri?: string): Promise<void> {
  // Parse the redirect URI to get port and path (uses defaults if not provided)
  const { port, path } = parseRedirectUri(redirectUri)

  // If server is running on a different port/path, stop it first
  if (server && (currentPort !== port || currentPath !== path)) {
    await stop()
  }

  if (server) return

  currentPort = port
  currentPath = path

  /**
   * Bind, and say so plainly when the port is taken.
   *
   * The old check here asked whether something was listening on the port and, if so,
   * returned as if the job was done. It was not: nothing had been registered, so the
   * redirect the provider was sent went to whatever else held the port, and the sign-in
   * then hung for the full five minutes with no error. That is the worst shape a failure
   * can have — the browser showed somebody else's site and the app just waited.
   */
  const created = createServer(handleRequest)

  try {
    await new Promise<void>((resolve, reject) => {
      created.once("error", reject)
      created.listen(port, OAUTH_CALLBACK_HOST, () => {
        created.removeListener("error", reject)
        resolve()
      })
    })
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === "EADDRINUSE") {
      throw new Error(
        `Cannot complete sign-in: local port ${port} is already in use, so the browser's reply cannot reach ZYRAXON. Close whatever is using it and try again.`,
      )
    }
    throw new Error(`Cannot start the sign-in listener on 127.0.0.1:${port} — ${(e as Error).message}`)
  }

  server = created
}

export function waitForCallback(oauthState: string, mcpName?: string): Promise<string> {
  if (mcpName) mcpNameToState.set(mcpName, oauthState)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (pendingAuths.has(oauthState)) {
        pendingAuths.delete(oauthState)
        if (mcpName) mcpNameToState.delete(mcpName)
        reject(new Error("OAuth callback timeout - authorization took too long"))
        stopIfIdle()
      }
    }, CALLBACK_TIMEOUT_MS)

    pendingAuths.set(oauthState, { resolve, reject, timeout })
  })
}

export function cancelPending(mcpName: string): void {
  // Look up the oauthState for this mcpName via the reverse index
  const oauthState = mcpNameToState.get(mcpName)
  const key = oauthState ?? mcpName
  const pending = pendingAuths.get(key)
  if (pending) {
    clearTimeout(pending.timeout)
    pendingAuths.delete(key)
    mcpNameToState.delete(mcpName)
    pending.reject(new Error("Authorization cancelled"))
    stopIfIdle()
  }
}

export async function isPortInUse(port: number = OAUTH_CALLBACK_PORT): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection(port, "127.0.0.1")
    socket.on("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.on("error", () => {
      resolve(false)
    })
  })
}

export async function stop(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = undefined
  }

  for (const [_name, pending] of pendingAuths) {
    clearTimeout(pending.timeout)
    pending.reject(new Error("OAuth callback server stopped"))
  }
  pendingAuths.clear()
  mcpNameToState.clear()
}

export function isRunning(): boolean {
  return server !== undefined
}

export * as McpOAuthCallback from "./oauth-callback"
