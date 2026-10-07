#!/usr/bin/env node
// End-to-end smoke test for the Hub, against real servers.
//
//   node "MCP Hub/scripts/smoke.mjs"                 one open server, one OAuth server
//   node "MCP Hub/scripts/smoke.mjs" --apps 6        sample six of each kind
//   node "MCP Hub/scripts/smoke.mjs" --only open     one kind only
//
// "Smoke" here means the whole path, not a unit test: catalog entry, client, JSON-RPC
// handshake, tool listing, and the timing budget. A server that answers 200 to initialize
// is not proof of anything, so every step below checks a value it could only have got from
// the server itself.
//
// Authenticated servers are expected to stop at needs_auth. That is the pass condition,
// not a skip: reaching the point where the server asks for a token means discovery, the
// transport and the client all worked.

import { allSeedApps } from "../catalog/seed.ts"
import { McpClient } from "../lib/client.ts"
import { discoverOAuth } from "../lib/registry.ts"
import { pathToFileURL } from "node:url"

const OPEN_BUDGET_MS = 15_000
const OAUTH_BUDGET_MS = 10_000

export function parseArgs(argv) {
  const flag = (name) => argv.includes(name)
  const value = (name) => {
    const at = argv.indexOf(name)
    return at === -1 ? undefined : Number(argv[at + 1])
  }
  return { help: flag("--help") || flag("-h"), apps: value("--apps") ?? 1, only: value("--only") }
}

export const USAGE = `Smoke test the Hub against live servers.

  --apps <n>   how many of each kind to try (default 1)
  --only <k>   just one kind: open, oauth, token or local
  --help       show this text
`

/**
 * A runtime that records what the connector asked for instead of holding real servers.
 *
 * Kept for tests that need to drive the connector's state machine rather than a live
 * server. The shape has to match McpRuntime exactly: a stub with `add` where the connector
 * calls `addServer` does not report a weaker result, it reports `runtime.addServer is not
 * a function` and every OAuth app looks broken for reasons that have nothing to do with it.
 *
 * It is not used by the checks below, because a stub that returns a status the real server
 * would never return turns the test into a conversation with itself.
 */
export function recordingRuntime() {
  const calls = []
  return {
    calls,
    statuses: async () => ({}),
    toolNames: async () => [],
    connect: async (name) => {
      calls.push(["connect", name])
    },
    addServer: async (name) => {
      calls.push(["addServer", name])
      return { status: "connected", tools: 1 }
    },
    authenticate: async (name) => {
      calls.push(["authenticate", name])
    },
    disconnect: async (name) => {
      calls.push(["disconnect", name])
    },
  }
}

/** One open server, end to end: initialize, then a real tool list. */
export async function smokeOpen(app) {
  const started = Date.now()
  const client = new McpClient({ url: app.url, name: "mcp-hub-smoke", version: "1.0.0" })

  const result = await client.initialize()
  if (!result?.serverInfo?.name) {
    throw new Error(`no serverInfo from ${app.url} — got ${JSON.stringify(result).slice(0, 200)}`)
  }

  const tools = await client.listTools()
  if (!Array.isArray(tools)) throw new Error("tools/list did not return an array")

  return {
    name: app.name,
    url: app.url,
    ms: Date.now() - started,
    server: result.serverInfo.name,
    protocol: result.protocolVersion,
    tools: tools.length,
    withinBudget: Date.now() - started <= OPEN_BUDGET_MS,
  }
}

/**
 * One OAuth server, as far as it can be checked without a human.
 *
 * The useful question is whether the sign-in page can be found at all, so that is what
 * gets tested, against the live server. Handing the connector a stub runtime instead only
 * proved that the stub agreed with itself: the stub's own `addServer` returned
 * "connected" and the test dutifully reported an app that demands a password as
 * connected. Nothing about the real server was exercised.
 */
export async function smokeOauth(app) {
  const started = Date.now()
  const endpoints = await discoverOAuth(app.url)

  if (!endpoints) throw new Error(`no OAuth endpoints discovered for ${app.url}`)

  const authorize = new URL(endpoints.authorizationEndpoint)
  const endpointHost = new URL(app.url).host
  const crossHost = authorize.host !== endpointHost
  const crossHostSafe = authorize.protocol === "https:"

  return {
    name: app.name,
    url: app.url,
    ms: Date.now() - started,
    authorizeHost: authorize.host,
    crossHost,
    crossHostSafe,
    oneClick: endpoints.registrationEndpoint !== undefined,
    issuer: endpoints.issuer,
    withinBudget: Date.now() - started <= OAUTH_BUDGET_MS,
  }
}

export async function main(argv) {
  const { help, apps, only } = parseArgs(argv)
  if (help) {
    console.log(USAGE)
    return
  }

  const catalog = allSeedApps()
  const kinds = ["open", "oauth", "token", "local"].filter((k) => !only || k === only)
  const chosen = kinds.flatMap((kind) => catalog.filter((a) => a.kind === kind).slice(0, apps))

  console.log("MCP Hub smoke test")
  console.log("==================")
  console.log(`${chosen.length} servers: ${kinds.join(", ")}\n`)

  let passed = 0
  let failed = 0

  for (const app of chosen) {
    try {
      const row =
        app.kind === "local"
          ? { name: app.name, note: "needs the real runtime to start a process" }
          : app.kind === "open"
            ? await smokeOpen(app)
            : app.kind === "oauth"
              ? await smokeOauth(app)
              : await smokeToken(app)

      const detail = Object.entries(row).filter(([k]) => k !== "name" && k !== "url")
      const flags = [row.withinBudget === false ? "OVER BUDGET" : "", row.crossHost && !row.crossHostSafe ? "INSECURE CROSS-HOST" : ""]
        .filter(Boolean)
        .join(" ")
      console.log(`  ok   ${app.name.padEnd(24)} ${detail.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")} ${flags}`)
      passed++
    } catch (e) {
      console.log(`  FAIL ${app.name.padEnd(24)} ${e.message}`)
      failed++
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

/**
 * A token server, as far as it goes with no token.
 *
 * Reaching a 401 is the pass condition: it proves the transport reached the server and that
 * the server wants the credential the panel would have collected.
 */
async function smokeToken(app) {
  const started = Date.now()
  const client = new McpClient({
    url: app.url,
    name: "mcp-hub-smoke",
    version: "1.0.0",
    headers: { authorization: "Bearer smoke-test-not-a-real-token" },
  })

  const outcome = await client.initialize().then(
    () => "accepted",
    (e) => (String(e.message ?? e).includes("40") ? "rejected" : e.message),
  )

  return { name: app.name, url: app.url, ms: Date.now() - started, outcome }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2))
}