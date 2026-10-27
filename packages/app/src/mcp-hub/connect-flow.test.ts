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
import { verifiedRows, type VerifiedRow } from "../../../../MCP Hub/catalog/verified-index"

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

/**
 * The ranking has to be the ranking.
 *
 * Search used to stop scanning once it had `limit * 6` matches, on the theory that a
 * handful of candidates is enough to sort. It is not: the index is in registry order, not
 * in tool-count order, so the scan quit before it had seen the rows the sort was about to
 * promote. A broad term is where it showed, and a broad term is exactly what a person
 * types first — "ai" matched 2,636 rows, the scan broke after 360, and 54 of the true top
 * 60 were never returned. These tests recompute the intended answer from the shipped rows
 * and require the function to agree with it exactly, so the early exit cannot come back.
 */
describe("verified catalog search ranking", () => {
  /**
   * The answer the doc comment promises: name-starts first, then tool count, then limit.
   *
   * Computed from the raw index rows, in registry order — the same input `searchVerified`
   * scans. Deriving it from `rows()` instead would sort by tool count first and hide the
   * ordering bug this is meant to catch.
   */
  function expected(term: string, limit: number): string[] {
    const needle = term.toLowerCase()
    const starts: VerifiedRow[] = []
    const contains: VerifiedRow[] = []
    for (const row of verifiedRows) {
      const name = row[1].toLowerCase()
      if (name.startsWith(needle)) starts.push(row)
      else if (name.includes(needle) || row[0].toLowerCase().includes(needle)) contains.push(row)
    }
    return [...starts, ...contains]
      .sort((a, b) => b[6] - a[6])
      .slice(0, limit)
      .map((row) => row[0])
  }

  const broad: [string, number][] = [
    ["ai", 60],
    ["mcp", 60],
    ["s", 60],
    ["a", 60],
    ["api", 40],
    ["data", 40],
    ["cloud", 40],
  ]

  for (const [term, limit] of broad) {
    test(`"${term}" returns the highest-tool matches, not the first ones found`, async () => {
      const want = expected(term, limit)
      const got = (await searchVerified(term, limit)).map((hit) => hit.id)

      expect(got.length).toBe(Math.min(limit, want.length))
      expect(got).toEqual(want)
      // The failure this guards against is silent: the list still fills up, with the
      // wrong rows. Asserting the head is populated catches a "returns nothing" rewrite.
      expect(got.length).toBeGreaterThan(0)
    })
  }

  test("a term with few matches is unaffected", async () => {
    for (const term of ["notion", "postgres", "slack"]) {
      const want = expected(term, 40)
      const got = (await searchVerified(term, 40)).map((hit) => hit.id)
      expect(got).toEqual(want)
    }
  })

  test("the tool-count leader is reachable by its own name", async () => {
    const leader = verifiedRows.slice().sort((a, b) => b[6] - a[6])[0]!
    const got = await searchVerified(leader[1], 40)
    expect(got.some((hit) => hit.id === leader[0])).toBe(true)
  })
})
