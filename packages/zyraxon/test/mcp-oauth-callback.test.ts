// Copyright (c) 2026 onelpawarai. All rights reserved.

// The loopback callback, exercised over real HTTP.
//
// Two bugs here each broke every remote OAuth sign-in while looking fine in isolation:
// a redirect from a provider's consent page arrives as `Sec-Fetch-Site: cross-site`, and
// the documented callback path is `/oauth/callback` while the listener was built for
// `/mcp/oauth/callback`. Neither is visible from the function signatures, so these tests
// start the real listener on the real loopback port and send the requests a browser sends.

import { afterEach, describe, expect, test } from "bun:test"
import { createServer } from "http"
import { OAUTH_CALLBACK_ALT_PATH, OAUTH_CALLBACK_PATH, OAUTH_CALLBACK_PORT } from "../src/mcp/oauth-provider"
import * as McpOAuthCallback from "../src/mcp/oauth-callback"

const PORT = OAUTH_CALLBACK_PORT
const BASE = `http://127.0.0.1:${PORT}`

/** Headers a browser adds when it follows a provider's redirect back to the loopback. */
const browserHeaders = { "sec-fetch-site": "cross-site" }

async function startCallbackServer(path = OAUTH_CALLBACK_PATH) {
  await McpOAuthCallback.ensureRunning(`${BASE}${path}`)
}

/** Send a callback and return the status and body without following anything. */
async function hit(path: string, headers: Record<string, string>, query = ""): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}${path}${query}`, { headers, redirect: "manual" })
  return { status: res.status, body: await res.text() }
}

afterEach(async () => {
  await McpOAuthCallback.stop()
})

describe("callback listener", () => {
  test("accepts the documented /oauth/callback path", async () => {
    await startCallbackServer()
    const pending = McpOAuthCallback.waitForCallback("state-documented")
    const { status } = await hit(OAUTH_CALLBACK_ALT_PATH, browserHeaders, "?code=abc&state=state-documented")
    expect(status).toBe(200)
    expect(await pending).toBe("abc")
  })

  test("accepts the internal /mcp/oauth/callback path", async () => {
    await startCallbackServer()
    const pending = McpOAuthCallback.waitForCallback("state-internal")
    const { status } = await hit(OAUTH_CALLBACK_PATH, browserHeaders, "?code=def&state=state-internal")
    expect(status).toBe(200)
    expect(await pending).toBe("def")
  })

  test("accepts a cross-site redirect, which is what a provider actually sends", async () => {
    await startCallbackServer()
    const pending = McpOAuthCallback.waitForCallback("state-cross")
    const { status } = await hit(OAUTH_CALLBACK_ALT_PATH, { "sec-fetch-site": "cross-site" }, "?code=ghi&state=state-cross")
    expect(status).toBe(200)
    expect(await pending).toBe("ghi")
  })

  test("rejects a request with no browser header", async () => {
    await startCallbackServer()
    // A non-browser client sends no Sec-Fetch-Site at all, so it must not be able to
    // hand over a code even when it knows a valid state.
    const { status } = await hit(OAUTH_CALLBACK_ALT_PATH, {}, "?code=xyz&state=whatever")
    expect(status).toBe(403)
  })

  test("rejects an unknown path", async () => {
    await startCallbackServer()
    const { status } = await hit("/not-the-callback", browserHeaders, "?code=xyz&state=whatever")
    expect(status).toBe(404)
  })

  test("rejects a callback with no state", async () => {
    await startCallbackServer()
    const { status } = await hit(OAUTH_CALLBACK_ALT_PATH, browserHeaders, "?code=xyz")
    expect(status).toBe(400)
  })

  test("frees the port once no handshake is waiting", async () => {
    await startCallbackServer()
    const pending = McpOAuthCallback.waitForCallback("state-free")
    await hit(OAUTH_CALLBACK_ALT_PATH, browserHeaders, "?code=code&state=state-free")
    await pending
    // stopIfIdle runs after the response, so the listener needs a moment to close.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(McpOAuthCallback.isRunning()).toBe(false)
  })

  test("reports a port already in use instead of silently doing nothing", async () => {
    // Something else holding the port is the failure that used to hang for five minutes:
    // the browser was redirected to whatever else held it. It has to be an error instead.
    const squatter = createServer()
    await new Promise<void>((resolve) => squatter.listen(PORT, "127.0.0.1", resolve))
    try {
      await expect(McpOAuthCallback.ensureRunning(`${BASE}${OAUTH_CALLBACK_PATH}`)).rejects.toThrow(/already in use/)
    } finally {
      await new Promise<void>((resolve) => squatter.close(() => resolve()))
    }
  })
})
