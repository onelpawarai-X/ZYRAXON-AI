// Copyright (c) 2026 onelpawarai. All rights reserved.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import {
  downloadSessionBundle,
  fetchSessionBundle,
  importSessionBundle,
  sessionAuthHeaders,
} from "./session-port"
import type { Bundle } from "@zyraxon-ai/schema/session-port"

/**
 * The panel is a browser: it cannot open the database, so every call it makes is
 * an HTTP request against the running server. These tests drive that request path
 * through a real HTTP listener rather than a stubbed `fetch`, so the headers the
 * server will actually see and the bodies it will actually parse are what is
 * asserted.
 *
 * The listener is a plain Node HTTP server and the client is the runtime's own
 * `fetch`, because happy-dom — which the app's unit runner loads for its DOM —
 * provides neither a faithful `Response` nor a faithful client `fetch`, and the
 * point of the test is the real request, not the DOM. The module under test still
 * calls the global `fetch` exactly as a browser would; only the implementation
 * behind that name changes.
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

const bundle: Bundle = {
  kind: "zyraxon-session-port",
  version: 1,
  exportedAt: 0,
  session: {
    id: "ses_live",
    project_id: "prj_live",
    title: "Live session",
    cost: 0,
    tokens_input: 0,
    tokens_output: 0,
    tokens_reasoning: 0,
    tokens_cache_read: 0,
    tokens_cache_write: 0,
    time_created: 0,
    time_updated: 0,
  },
  messages: [],
}

const seen: Array<{ method: string; path: string; authorization?: string; body?: unknown }> = []

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  const chunks: Buffer[] = []
  request.on("data", (chunk: Buffer) => chunks.push(chunk))
  request.on("end", () => {
    const path = (request.url ?? "").split("?")[0] ?? ""
    const body = request.method === "POST" ? JSON.parse(Buffer.concat(chunks).toString() || "null") : undefined
    seen.push({
      method: request.method ?? "",
      path,
      authorization: request.headers.authorization,
      body,
    })
    response.setHeader("content-type", "application/json")
    if (path.endsWith("/export")) {
      if (path.includes("ses_missing")) {
        response.statusCode = 404
        response.end(JSON.stringify({ message: "gone" }))
        return
      }
      response.end(JSON.stringify(bundle))
      return
    }
    if (path === "/api/session/import") {
      response.end(JSON.stringify({ id: "ses_imported", restored: 2, skipped: 1 }))
      return
    }
    response.statusCode = 404
    response.end("not found")
  })
})

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
const address = server.address()
if (address === null || typeof address === "string") throw new Error("test server did not bind a port")
const connection = { url: `http://127.0.0.1:${address.port}`, username: "zyraxon", password: "secret" }

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe("session auth headers", () => {
  test("credentials become a Basic authorization header", () => {
    expect(sessionAuthHeaders(connection).Authorization).toBe(
      `Basic ${Buffer.from("zyraxon:secret").toString("base64")}`,
    )
  })

  test("a server with no password sends no header", () => {
    expect(sessionAuthHeaders({ ...connection, password: "" })).toEqual({})
  })
})

describe("session export over HTTP", () => {
  test("the bundled conversation comes back from the export route", async () => {
    seen.length = 0
    const result = await fetchSessionBundle(connection, "ses_live")
    expect(result.session.id).toBe("ses_live")
    expect(seen[0]?.path).toBe("/api/session/ses_live/export")
    expect(seen[0]?.method).toBe("GET")
    expect(seen[0]?.authorization).toBe(`Basic ${Buffer.from("zyraxon:secret").toString("base64")}`)
  })

  test("a session id is encoded so it cannot break out of the path", async () => {
    seen.length = 0
    await fetchSessionBundle(connection, "ses_a/b")
    expect(seen[0]?.path).toBe("/api/session/ses_a%2Fb/export")
  })

  test("a refused export surfaces the server message", async () => {
    await expect(fetchSessionBundle(connection, "ses_missing")).rejects.toThrow("gone")
  })
})

describe("session import over HTTP", () => {
  test("the bundle and location arrive at the import route", async () => {
    seen.length = 0
    const outcome = await importSessionBundle({
      server: connection,
      bundle,
      location: { directory: "/work/project" },
    })
    expect(outcome).toEqual({ id: "ses_imported", restored: 2, skipped: 1 })
    expect(seen[0]?.path).toBe("/api/session/import")
    expect(seen[0]?.method).toBe("POST")
    expect(seen[0]?.body).toEqual({ bundle, location: { directory: "/work/project" } })
    expect(seen[0]?.authorization).toBe(`Basic ${Buffer.from("zyraxon:secret").toString("base64")}`)
  })
})

describe("download", () => {
  test("the bundle reaches a real anchor and its object URL is released", () => {
    // A real document is used so the click path is exercised end to end rather
    // than stubbed: the anchor has to exist, carry the download name, and be
    // cleaned up, and the object URL has to be handed back afterwards.
    const doc = document.implementation.createHTMLDocument("export")
    const created: string[] = []
    const revoked: string[] = []
    const realCreate = URL.createObjectURL
    const realRevoke = URL.revokeObjectURL
    URL.createObjectURL = (blob: Blob) => {
      expect(blob.type).toBe("application/json")
      const url = `blob:test/${created.length}`
      created.push(url)
      return url
    }
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url)
    }

    try {
      let clicked = 0
      const realClick = HTMLAnchorElement.prototype.click
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        clicked += 1
        expect(this.download).toBe("live-session.zyraxon-session.json")
        expect(this.href).toContain("blob:test/")
        expect(doc.body.contains(this)).toBe(true)
      }

      try {
        downloadSessionBundle(bundle, "live-session.zyraxon-session.json", doc)
        expect(clicked).toBe(1)
      } finally {
        HTMLAnchorElement.prototype.click = realClick
      }
    } finally {
      URL.createObjectURL = realCreate
      URL.revokeObjectURL = realRevoke
    }

    expect(created).toHaveLength(1)
    expect(revoked).toEqual(created)
    expect(doc.body.querySelectorAll("a")).toHaveLength(0)
  })
})
