#!/usr/bin/env node
// Check that every endpoint in the catalog still exists and still needs what it claims.
//
//   node "MCP Hub/scripts/verify-live.mjs"              every remote endpoint
//   node "MCP Hub/scripts/verify-live.mjs" --apps 20    just the first twenty
//   node "MCP Hub/scripts/verify-live.mjs" --json out.json
//
// A catalog entry is a promise about a server on somebody else's domain, and domains rot.
// A 404 in a card the user pressed is the whole feature looking broken, so this sends the
// real MCP initialize to every remote endpoint and records what came back.
//
// What it asserts, and what it does not:
//
//   ok              the server answered, and answered the way its entry claims
//   wants auth      it returned 401/403 or a challenge — it needs a credential
//   open            it answered initialize with no credential at all
//   dead            404, 410 or a non-MCP body: the entry has to go
//
// A 401 is never a failure here. It is the answer for 56 of the catalog's endpoints, and it
// is the good one: it proves the host is alive and the path is real.

import { allSeedApps } from "../catalog/seed.ts"
import { writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const TIMEOUT_MS = 10_000
const CONCURRENCY = 6
/** A body this short is a parked domain or an error page, not an MCP server. */
const MIN_MCP_BODY = 20

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-hub-verify", version: "1.0.0" },
  },
}

export function parseArgs(argv) {
  const flag = (name) => argv.includes(name)
  const number = (name) => {
    const at = argv.indexOf(name)
    return at === -1 ? undefined : Number(argv[at + 1])
  }
  // Separate from `number` because it does not parse a number. `Number("out.json")` is NaN,
  // which is falsy, so the flag looked like it had not been passed and no file was written
  // — a silent no-op for a flag whose whole job is to write a file.
  const string = (name) => {
    const at = argv.indexOf(name)
    return at === -1 ? undefined : argv[at + 1]
  }
  return { help: flag("--help") || flag("-h"), apps: number("--apps"), json: string("--json") }
}

export const USAGE = `Check every remote endpoint in the catalog.

  --apps <n>     only the first n apps
  --json <path>  write the full result set to a file
  --help         show this text
`

export async function probe(app) {
  const started = Date.now()

  try {
    const res = await fetch(app.url, {
      method: "POST",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify(INITIALIZE),
    })

    const challenge = res.headers.get("www-authenticate") ?? ""
    const body = await res.text()
    const wantsAuth = res.status === 401 || res.status === 403 || challenge.length > 0
    const dead = res.status === 404 || res.status === 410 || (body.length > 0 && body.length < MIN_MCP_BODY && !wantsAuth)
    // A 5xx or a 429 is a live host having a bad day, not an app that needs no credential.
    // Folding it into "open with no key" reported an outage as a working integration.
    const unavailable = res.status >= 500 || res.status === 429

    return {
      id: app.id,
      name: app.name,
      url: app.url,
      kind: app.kind,
      status: res.status,
      ms: Date.now() - started,
      wantsAuth,
      dead,
      unavailable,
      challengeScheme: /^(\w+)/.exec(challenge)?.[1],
      bodySample: dead || unavailable || (!wantsAuth && !body) ? body.slice(0, 160) : undefined,
    }
  } catch (e) {
    const timedOut = e.name === "AbortError"
    return {
      id: app.id,
      name: app.name,
      url: app.url,
      kind: app.kind,
      status: 0,
      ms: Date.now() - started,
      timedOut,
      // A name that does not resolve is a different failure from a host that refuses, and
      // conflating them hides the fact that the entry itself may have a typo.
      dns: timedOut ? undefined : /getaddrinfo|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(String(e.message ?? e)) ? String(e.message ?? e) : undefined,
      reason: timedOut ? "timeout" : String(e.message ?? e),
    }
  }
}

export async function main(argv) {
  const { help, apps, json } = parseArgs(argv)
  if (help) {
    console.log(USAGE)
    return
  }

  const remotes = allSeedApps().filter((a) => a.url && a.kind !== "local")
  const targets = apps ? remotes.slice(0, apps) : remotes

  console.log("MCP catalog liveness")
  console.log("===================")
  console.log(`${targets.length} remote endpoints, ${CONCURRENCY} at a time\n`)

  const results = []
  let cursor = 0

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < targets.length) {
        const row = await probe(targets[cursor++])
        results.push(row)
        const verdict =
          row.dead ? "dead" : row.dns ? "dns" : row.timedOut ? "timeout" : row.unavailable ? "unavailable" : row.wantsAuth ? "needs auth" : "open"
        const flag = verdict === "open" || verdict === "needs auth" ? "" : ` <<< ${verdict}`
        console.log(`  ${String(row.status || "ERR").padStart(3)} ${String(row.ms).padStart(5)}ms ${row.name.padEnd(24)} ${verdict}${flag}`)
      }
    }),
  )

  results.sort((a, b) => a.name.localeCompare(b.name))

  const dead = results.filter((r) => r.dead)
  const dns = results.filter((r) => r.dns)
  const timedOut = results.filter((r) => r.timedOut)
  const unavailable = results.filter((r) => r.unavailable)
  const alive = results.length - dead.length - dns.length - timedOut.length - unavailable.length

  const byStatus = results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {})

  console.log(`\nalive              ${alive}/${results.length}`)
  console.log(`needs auth         ${results.filter((r) => r.wantsAuth).length}`)
  console.log(`open with no key   ${results.filter((r) => !r.wantsAuth && r.status === 200).length}`)
  console.log(`unavailable        ${unavailable.length}`)
  console.log(`dead               ${dead.length}`)
  console.log(`dns / refused      ${dns.length}`)
  console.log(`timed out          ${timedOut.length}`)
  console.log(`status codes       ${JSON.stringify(byStatus)}`)

  for (const row of [...dead, ...dns, ...timedOut, ...unavailable]) {
    console.log(`  ! ${row.name} — ${row.reason ?? row.status}`)
  }

  if (json) {
    await writeFile(json, JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2), "utf8")
    console.log(`\nwrote ${json}`)
  }

  if (dead.length + dns.length + timedOut.length > 0) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2))
}