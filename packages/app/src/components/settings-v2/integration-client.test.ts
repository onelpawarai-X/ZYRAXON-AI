// Copyright (c) 2026 onelpawarai. All rights reserved.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import {
  cancelIntegrationAttempt,
  completeIntegrationAttempt,
  connectIntegrationKey,
  disconnectIntegration,
  getIntegration,
  integrationAttemptStatus,
  integrationAuthHeaders,
  integrationQuery,
  isConnected,
  keyMethod,
  listIntegrations,
  oauthMethod,
  startIntegrationOAuth,
} from "./integration-client"
import type { AttemptID, Info, MethodID } from "@zyraxon-ai/schema/integration"
import type { Credential } from "@zyraxon-ai/schema/credential"

// The server's ids are branded strings, so a literal has to be cast before it can
// stand in for one. The cast is confined to the fixtures; the code under test
// receives real branded values from the server.
const id = (value: string) => value as Info["id"]
const methodID = (value: string) => value as MethodID
const attemptID = (value: string) => value as AttemptID
const credentialID = (value: string) => value as Credential.ID

/**
 * The panel is a browser: it cannot reach the registry directly, so every call it
 * makes is an HTTP request against the running server. These tests drive that
 * request path through a real HTTP listener rather than a stubbed `fetch`, so the
 * headers the server will actually see and the bodies it will actually parse are
 * what is asserted.
 *
 * The listener is a plain Node HTTP server and the client is the runtime's own
 * `fetch`, because happy-dom — which the app's unit runner loads for its DOM —
 * provides neither a faithful `Response` nor a faithful client `fetch`, and the
 * point of the test is the real request, not the DOM.
 */
const realFetch = globalThis.fetch
beforeAll(() => {
  // happy-dom, which the app's unit runner preloads, replaces `fetch` with a
  // browser fetch that enforces the same-origin policy and so refuses this suite's
  // real local listener. The preload keeps the runtime's own fetch aside before
  // happy-dom registers; Bun's fetch is used directly where the variable is absent.
  const native =
    (globalThis as { __zyraxonNativeFetch?: typeof fetch }).__zyraxonNativeFetch ??
    (globalThis.Bun?.fetch as typeof fetch | undefined) ??
    globalThis.fetch
  globalThis.fetch = native
})
afterAll(() => {
  globalThis.fetch = realFetch
})

const integration: Info = {
  id: id("swe-verify"),
  name: "SWE Verify",
  methods: [{ type: "key", label: "API key" }],
  connections: [],
}

const connected: Info = {
  id: id("swe-verify"),
  name: "SWE Verify",
  methods: [{ type: "key", label: "API key" }],
  connections: [{ type: "credential", id: credentialID("cred_1"), label: "main" }],
}

const oauthIntegration: Info = {
  id: id("remote-ci"),
  name: "Remote CI",
  methods: [{ id: methodID("oauth-default"), type: "oauth", label: "Sign in" }],
  connections: [],
}

const seen: Array<{ method: string; path: string; query: string; authorization?: string; body?: unknown }> = []

// The `location` half of every `Location.response` envelope. The client ignores
// it, but the real server sends it, so the stub does too.
const locationInfo = {
  directory: "/work/project",
  project: { id: "proj_1", directory: "/work/project" },
}

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  const chunks: Buffer[] = []
  request.on("data", (chunk: Buffer) => chunks.push(chunk))
  request.on("end", () => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    const body = request.method === "POST" ? JSON.parse(Buffer.concat(chunks).toString() || "null") : undefined
    seen.push({
      method: request.method ?? "",
      path: url.pathname,
      query: url.search,
      authorization: request.headers.authorization,
      body,
    })
    response.setHeader("content-type", "application/json")

    // List: one unconnected and one OAuth integration. `Location.response`
    // routes answer with `{ location, data }`, so the stub does too — a stub
    // that returned the bare array here would pass while the real server's
    // payload unwrapped to `undefined`.
    if (url.pathname === "/api/integration" && request.method === "GET") {
      response.end(JSON.stringify({ location: locationInfo, data: [integration, oauthIntegration] }))
      return
    }
    if (url.pathname === "/api/integration/swe-verify" && request.method === "GET") {
      response.end(JSON.stringify({ location: locationInfo, data: integration }))
      return
    }
    if (url.pathname === "/api/integration/ghost" && request.method === "GET") {
      response.statusCode = 404
      response.end(JSON.stringify({ message: "no such integration" }))
      return
    }
    if (url.pathname === "/api/integration/swe-verify/connect/key" && request.method === "POST") {
      if (body?.key === "bad") {
        response.statusCode = 400
        response.end(JSON.stringify({ message: "Authentication failed" }))
        return
      }
      response.statusCode = 204
      response.end()
      return
    }
    if (url.pathname === "/api/integration/remote-ci/connect/oauth" && request.method === "POST") {
      response.end(
        JSON.stringify({
          location: locationInfo,
          data: {
            attemptID: "con_1",
            url: "https://ci.example/authorize",
            instructions: "Open the link and approve",
            mode: "code",
            time: { created: 0, expires: 600_000 },
          },
        }),
      )
      return
    }
    if (url.pathname === "/api/integration/attempt/con_1" && request.method === "GET") {
      response.end(
        JSON.stringify({ location: locationInfo, data: { status: "pending", time: { created: 0, expires: 600_000 } } }),
      )
      return
    }
    if (url.pathname === "/api/integration/attempt/con_1/complete" && request.method === "POST") {
      response.statusCode = 204
      response.end()
      return
    }
    if (url.pathname === "/api/integration/attempt/con_1" && request.method === "DELETE") {
      response.statusCode = 204
      response.end()
      return
    }
    if (url.pathname === "/api/credential/cred_1" && request.method === "DELETE") {
      response.statusCode = 204
      response.end()
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ message: "not found" }))
  })
})

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
const address = server.address()
if (address === null || typeof address === "string") throw new Error("test server did not bind a port")
const connection = { url: `http://127.0.0.1:${address.port}`, username: "zyraxon", password: "secret" }

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe("integration auth and query", () => {
  test("credentials become a Basic authorization header", () => {
    expect(integrationAuthHeaders(connection).Authorization).toBe(
      `Basic ${Buffer.from("zyraxon:secret").toString("base64")}`,
    )
  })

  test("a server with no password sends no header", () => {
    expect(integrationAuthHeaders({ ...connection, password: "" })).toEqual({})
  })

  test("the location becomes a deep-object query", () => {
    expect(integrationQuery({ directory: "/work/project" })).toBe("?location%5Bdirectory%5D=%2Fwork%2Fproject")
    expect(integrationQuery()).toBe("")
  })
})

describe("list and get", () => {
  test("every integration comes back with its methods", async () => {
    seen.length = 0
    const result = await listIntegrations(connection, { directory: "/work/project" })
    expect(result.map((item) => item.id)).toEqual([id("swe-verify"), id("remote-ci")])
    expect(seen[0]?.path).toBe("/api/integration")
    expect(seen[0]?.method).toBe("GET")
    expect(seen[0]?.query).toBe("?location%5Bdirectory%5D=%2Fwork%2Fproject")
    expect(seen[0]?.authorization).toBe(`Basic ${Buffer.from("zyraxon:secret").toString("base64")}`)
  })

  test("one integration is fetched by id", async () => {
    const result = await getIntegration(connection, "swe-verify")
    expect(result?.name).toBe("SWE Verify")
  })

  test("a missing integration returns undefined rather than throwing", async () => {
    expect(await getIntegration(connection, "ghost")).toBeUndefined()
  })
})

describe("connecting", () => {
  test("a key is posted and a stored credential results", async () => {
    seen.length = 0
    await connectIntegrationKey({
      server: connection,
      integrationID: "swe-verify",
      key: "sk-live-123",
      label: "main",
    })
    expect(seen[0]?.path).toBe("/api/integration/swe-verify/connect/key")
    expect(seen[0]?.method).toBe("POST")
    expect(seen[0]?.body).toEqual({ key: "sk-live-123", label: "main" })
  })

  test("a refused key surfaces the server message", async () => {
    await expect(
      connectIntegrationKey({ server: connection, integrationID: "swe-verify", key: "bad" }),
    ).rejects.toThrow("Authentication failed")
  })

  test("an OAuth attempt comes back with the URL to open", async () => {
    seen.length = 0
    const attempt = await startIntegrationOAuth({
      server: connection,
      integrationID: "remote-ci",
      methodID: methodID("oauth-default"),
      inputs: {},
    })
    expect(attempt.attemptID).toBe(attemptID("con_1"))
    expect(attempt.url).toBe("https://ci.example/authorize")
    expect(attempt.mode).toBe("code")
    expect(seen[0]?.path).toBe("/api/integration/remote-ci/connect/oauth")
    expect(seen[0]?.body).toEqual({ methodID: methodID("oauth-default"), inputs: {} })
  })

  test("the attempt status is polled", async () => {
    const status = await integrationAttemptStatus(connection, "con_1" as AttemptID)
    expect(status.status).toBe("pending")
  })

  test("a code-mode attempt is completed with the code", async () => {
    seen.length = 0
    await completeIntegrationAttempt({ server: connection, attemptID: attemptID("con_1"), code: "abc123" })
    expect(seen[0]?.path).toBe("/api/integration/attempt/con_1/complete")
    expect(seen[0]?.body).toEqual({ code: "abc123" })
  })

  test("an abandoned attempt is cancelled", async () => {
    seen.length = 0
    await cancelIntegrationAttempt(connection, "con_1" as AttemptID)
    expect(seen[0]?.method).toBe("DELETE")
    expect(seen[0]?.path).toBe("/api/integration/attempt/con_1")
  })

  test("a stored connection is removed by its credential id", async () => {
    seen.length = 0
    await disconnectIntegration({ server: connection, credentialID: "cred_1" })
    expect(seen[0]?.method).toBe("DELETE")
    expect(seen[0]?.path).toBe("/api/credential/cred_1")
  })
})

describe("reading an integration", () => {
  test("an integration with a connection reads as connected", () => {
    expect(isConnected(connected)).toBe(true)
    expect(isConnected(integration)).toBe(false)
  })

  test("the key method is found when one is offered", () => {
    expect(keyMethod(integration)?.type).toBe("key")
    expect(keyMethod(oauthIntegration)).toBeUndefined()
  })

  test("the OAuth method is found when one is offered", () => {
    expect(oauthMethod(oauthIntegration)?.id).toBe(methodID("oauth-default"))
    expect(oauthMethod(integration)).toBeUndefined()
  })
})
