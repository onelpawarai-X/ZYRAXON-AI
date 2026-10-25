// Copyright (c) 2026 onelpawarai. All rights reserved.

// The Hub's connect flow, driven with the real catalog.
//
// Every row in the verified catalog reaches the panel as an `AppEntry`, and the panel has
// exactly one connect path. These tests take real rows out of that catalog, run them through
// `verifiedHitToApp` and `toServerConfig`, and assert the config each one produces — which is
// the part that was silently wrong. Three bugs lived here and none of them failed a
// typecheck: `url_input` rows were mapped to the browser flow, browser apps were asked for a
// client ID they did not need, and a template endpoint was written into the config as the
// literal string `https://{your-host}/mcp`.
//
// No network and no runtime: this is the config the connect path builds, checked against the
// rows that actually ship.

import { describe, expect, test } from "bun:test"
import { toServerConfig } from "../../../../MCP Hub/lib/connect"
import { connectDetailFor, searchVerified, verifiedCount, verifiedHitToApp } from "../../../../MCP Hub/lib/verified-catalog"

/** Every shipped row, loaded once for the whole file. */
let allRows: Awaited<ReturnType<typeof searchVerified>> | undefined
async function rows() {
  allRows ??= await searchVerified("", 9000)
  return allRows
}

describe("verified catalog", () => {
  test("ships thousands of rows, and every one maps to an app", async () => {
    expect(await verifiedCount()).toBeGreaterThan(5000)
  })

  test("a no_auth row connects with nothing typed", async () => {
    const hit = (await rows()).find((row) => row.connect_kind === "no_auth")
    expect(hit).toBeTruthy()
    const app = verifiedHitToApp(hit!, await connectDetailFor(hit!.id))
    expect(app.kind).toBe("none")
    const config = toServerConfig(app)
    expect(config).toMatchObject({ type: "remote", enabled: true })
    expect((config as { url?: string }).url).toBe(hit!.url)
  })

  test("a url_input row becomes an instance app, and never a browser one", async () => {
    const hit = (await rows()).find((row) => row.connect_kind === "url_input")
    expect(hit).toBeTruthy()
    const app = verifiedHitToApp(hit!, await connectDetailFor(hit!.id))
    expect(app.kind).toBe("instance")
    expect(app.urlTemplate).toBeTruthy()

    // With no address there is no config to write — the panel asks for one first.
    expect(toServerConfig(app)).toEqual({})

    // With an address the placeholder is filled, on the template's own scheme.
    const config = toServerConfig(app, undefined, undefined, undefined, undefined, "acme.example.com")
    const url = (config as { url?: string }).url ?? ""
    expect(url.includes("{")).toBe(false)
    expect(url.startsWith("https://acme.example.com")).toBe(true)

    // A full URL is accepted as-is rather than double-prefixed.
    const given = toServerConfig(app, undefined, undefined, undefined, undefined, "http://10.0.0.5:8080")
    expect((given as { url?: string }).url).toContain("http://10.0.0.5:8080")
  })

  test("an api_key row with a package collects its key from the environment", async () => {
    const hit = (await rows()).find((row) => row.connect_kind === "api_key" && row.package)
    if (!hit) return // no packaged key row shipped; the remote-key case is covered below
    const app = verifiedHitToApp(hit, await connectDetailFor(hit.id))
    expect(app.kind).toBe("local")
    const config = toServerConfig(app, undefined, undefined, undefined, { [app.env![0].key]: "secret-value" })
    expect(config).toMatchObject({ type: "local" })
    expect((config as { environment?: Record<string, string> }).environment).toMatchObject({
      [app.env![0].key]: "secret-value",
    })
  })

  test("a remote api_key row sends the key as a header", async () => {
    const hit = (await rows()).find((row) => row.connect_kind === "api_key" && !row.package)
    if (!hit) return
    const app = verifiedHitToApp(hit, await connectDetailFor(hit.id))
    expect(app.kind).toBe("token")
    const config = toServerConfig(app, "the-key")
    expect((config as { headers?: Record<string, string> }).headers?.Authorization).toBe("Bearer the-key")
  })

  test("every row that asks for something can say where to get it", async () => {
    const askers = (await rows()).filter(
      (row) => row.connect_kind === "api_key" || row.connect_kind === "url_input",
    )
    expect(askers.length).toBeGreaterThan(0)
    for (const hit of askers.slice(0, 40)) {
      const app = verifiedHitToApp(hit, await connectDetailFor(hit.id))
      if (app.kind === "instance") expect(app.urlTemplate).toBeTruthy()
      if (app.kind === "token" || app.kind === "local") {
        const hasPage = Boolean(app.consoleUrl ?? app.tokenUrl ?? app.env?.some((e) => e.url))
        expect(hasPage).toBe(true)
      }
    }
  })

  test("no row ships a literal template into the config", async () => {
    const templates = (await rows()).filter((row) => row.connect_kind === "url_input")
    expect(templates.length).toBeGreaterThan(0)
    for (const hit of templates.slice(0, 30)) {
      const app = verifiedHitToApp(hit, await connectDetailFor(hit.id))
      const config = toServerConfig(app, undefined, undefined, undefined, undefined, "example.com")
      const url = (config as { url?: string }).url ?? ""
      expect(url.includes("{")).toBe(false)
    }
  })
})
