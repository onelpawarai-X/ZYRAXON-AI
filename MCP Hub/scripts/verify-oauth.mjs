#!/usr/bin/env node
// Prove the OAuth discovery chain reaches a real sign-in page for every browser app.
//
//   node "MCP Hub/scripts/verify-oauth.mjs"              all browser apps
//   node "MCP Hub/scripts/verify-oauth.mjs" --apps 10    just the first ten
//   node "MCP Hub/scripts/verify-oauth.mjs" --strict     fail on any cross-host sign-in
//   node "MCP Hub/scripts/verify-oauth.mjs" --json out.json
//
// Discovery is the part of connecting that cannot be tested by reading code, because every
// vendor advertises its endpoints differently. This walks the same chain the panel uses —
// protected-resource metadata, then the authorization server, then the issuer, then the
// catalog's own record — against every browser app in the catalog and writes down what it
// actually found. An app that resolves is an app whose Connect button can work; an app that
// does not is a card that will hang.
//
// Two results matter and are easy to confuse. Finding the endpoints is necessary and is what
// this asserts. Finding a registration endpoint is what makes one click possible, and 9 of
// the apps have none, so they will ask for a client id. Those are reported, not hidden,
// because a number that is quietly optimistic is worse than one that is lower.

import { browserApps } from "../catalog/seed.ts"
import { discoverOAuth } from "../lib/registry.ts"
import { writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const TIMEOUT_MS = 12_000
const CONCURRENCY = 4

export function parseArgs(argv) {
  const flag = (name) => argv.includes(name)
  const number = (name) => {
    const at = argv.indexOf(name)
    return at === -1 ? undefined : Number(argv[at + 1])
  }
  // Not `Number`: that turns a path into NaN, and NaN is falsy, so `--json out.json`
  // looked like the flag had not been passed and silently wrote nothing.
  const string = (name) => {
    const at = argv.indexOf(name)
    return at === -1 ? undefined : argv[at + 1]
  }
  return { help: flag("--help") || flag("-h"), strict: flag("--strict"), apps: number("--apps"), json: string("--json") }
}

export const USAGE = `Verify OAuth discovery for the whole browser catalog.

  --apps <n>     only the first n apps
  --strict       fail when an app signs in on a different host
  --json <path>  write the full result set to a file
  --help         show this text
`

async function verify(app) {
  const started = Date.now()

  try {
    const endpoints = await discoverOAuth(app.url)
    if (!endpoints) {
      return { id: app.id, name: app.name, url: app.url, ok: false, reason: "no endpoints found", ms: Date.now() - started }
    }

    const authorizeHost = new URL(endpoints.authorizationEndpoint).host
    const endpointHost = new URL(app.url).host

    return {
      id: app.id,
      name: app.name,
      url: app.url,
      ok: true,
      ms: Date.now() - started,
      authorizeHost,
      tokenHost: new URL(endpoints.tokenEndpoint).host,
      issuer: endpoints.issuer,
      oneClick: endpoints.registrationEndpoint !== undefined,
      crossHost: authorizeHost !== endpointHost,
      // A cross-host consent page is fine over https and alarming over plain http, and the
      // distinction is the difference between a redirect and a credential handed over.
      insecureCrossHost: authorizeHost !== endpointHost && new URL(endpoints.authorizationEndpoint).protocol !== "https:",
      withinBudget: Date.now() - started <= TIMEOUT_MS,
    }
  } catch (e) {
    return { id: app.id, name: app.name, url: app.url, ok: false, reason: String(e.message ?? e), ms: Date.now() - started }
  }
}

export async function main(argv) {
  const { help, strict, apps, json } = parseArgs(argv)
  if (help) {
    console.log(USAGE)
    return
  }

  const targets = apps ? browserApps.slice(0, apps) : browserApps
  console.log("MCP OAuth discovery")
  console.log("===================")
  console.log(`${targets.length} browser apps, ${CONCURRENCY} at a time\n`)

  const results = []
  let cursor = 0

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < targets.length) {
        const row = await verify(targets[cursor++])
        results.push(row)
        if (row.ok) {
          console.log(
            `  ok   ${String(row.ms).padStart(5)}ms ${row.name.padEnd(22)} ${row.authorizeHost}` +
              `${row.crossHost ? " (cross-host)" : ""}${row.oneClick ? " · one click" : " · needs a client id"}` +
              `${row.insecureCrossHost ? " · INSECURE" : ""}${row.withinBudget ? "" : " · OVER BUDGET"}`,
          )
        } else {
          console.log(`  FAIL ${String(row.ms).padStart(5)}ms ${row.name.padEnd(22)} ${row.reason}`)
        }
      }
    }),
  )

  results.sort((a, b) => a.name.localeCompare(b.name))

  const found = results.filter((r) => r.ok)
  const crossHost = found.filter((r) => r.crossHost)
  const oneClick = found.filter((r) => r.oneClick)
  const needsClientId = found.filter((r) => !r.oneClick)
  const insecure = found.filter((r) => r.insecureCrossHost)
  const overBudget = found.filter((r) => !r.withinBudget)
  const slowest = [...found].sort((a, b) => b.ms - a.ms).slice(0, 5)

  console.log(`\nresolved            ${found.length}/${results.length}`)
  console.log(`one click           ${oneClick.length}`)
  console.log(`needs a client id   ${needsClientId.length}${needsClientId.length ? ` — ${needsClientId.map((r) => r.name).join(", ")}` : ""}`)
  console.log(`cross-host sign-in  ${crossHost.length}`)
  console.log(`insecure cross-host ${insecure.length}`)
  console.log(`over budget         ${overBudget.length}`)
  if (slowest.length) {
    console.log(`slowest             ${slowest.map((r) => `${r.name} ${r.ms}ms`).join(", ")}`)
  }

  if (json) {
    await writeFile(json, JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2), "utf8")
    console.log(`\nwrote ${json}`)
  }

  const failed = results.length - found.length
  if (failed > 0 || (strict && crossHost.length > 0)) {
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2))
}