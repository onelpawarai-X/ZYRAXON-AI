#!/usr/bin/env node
// Check that apps the catalog cannot reach can still be resolved through the registry.
//
//   node "MCP Hub/scripts/verify-resolve.mjs"               every catalog app
//   node "MCP Hub/scripts/verify-resolve.mjs" --terms slack,notion,postgres
//   node "MCP Hub/scripts/verify-resolve.mjs" --only-unresolved
//
// The catalog carries a first-party endpoint for the apps people actually use. The rest of
// the registry is where everything else comes from, and a resolver that hands back a
// plausible-looking URL nobody can connect to is worse than one that admits it found
// nothing: the user presses Connect and waits.
//
// So each resolution is checked the only way that means anything — the URL is asked for a
// real MCP initialize. A resolver result that does not answer is reported as unresolvable
// even though it was technically found.

import { allSeedApps } from "../catalog/seed.ts"
import { resolveApp } from "../lib/resolve.ts"
import { searchRegistry } from "../lib/registry.ts"
import { pathToFileURL } from "node:url"

const TIMEOUT_MS = 10_000

export function parseArgs(argv) {
  const flag = (name) => argv.includes(name)
  const list = (name) => {
    const i = argv.indexOf(name)
    return i === -1 ? undefined : argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean)
  }
  return { help: flag("--help") || flag("-h"), terms: list("--terms"), onlyUnresolved: flag("--only-unresolved") }
}

export const USAGE = `Resolve catalog apps through the official registry.

  --terms <a,b>    search for these words instead of using the catalog
  --only-unresolved  skip apps that already have a first-party endpoint
  --help           show this text
`

/** Does this URL answer a real MCP initialize? */
export async function answers(url) {
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-hub-verify", version: "1.0.0" } },
      }),
    })

    // 401 and 403 are the good answer: the host is live and wants a credential.
    return { answered: res.status < 500, status: res.status, challenged: res.status === 401 || res.status === 403 }
  } catch (e) {
    return { answered: false, status: 0, error: e.name === "AbortError" ? "timeout" : String(e.message ?? e) }
  }
}

export async function main(argv) {
  const { help, terms, onlyUnresolved } = parseArgs(argv)
  if (help) {
    console.log(USAGE)
    return
  }

  console.log("MCP registry resolution")
  console.log("=======================")

  if (terms) {
    for (const term of terms) {
      const hits = await searchRegistry(term, 5)
      console.log(`\n"${term}" -> ${hits.length} hits`)
      for (const hit of hits) {
        const remote = hit.remotes?.[0]?.url
        const verdict = remote ? await answers(remote) : { answered: false, status: 0 }
        console.log(`  ${hit.name}${hit.version ? ` ${hit.version}` : ""}`)
        console.log(`    ${remote ?? "(no remote endpoint)"}`)
        console.log(`    ${verdict.answered ? `answers ${verdict.status}${verdict.challenged ? " (wants a credential)" : ""}` : `DEAD — ${verdict.error ?? verdict.status}`}`)
      }
    }
    return
  }

  const targets = allSeedApps().filter((a) => a.kind !== "local").filter((a) => !onlyUnresolved || !a.url)
  if (onlyUnresolved && targets.length === 0) {
    console.log("Every remote app already has a first-party endpoint.")
    return
  }

  console.log(`${targets.length} apps\n`)

  let resolvedAndLive = 0
  let catalogDirect = 0
  let foundButDead = 0
  let notFound = 0

  for (const app of targets) {
    // An app with its own endpoint skips the registry entirely, which is the point of
    // having one: no search, no third party, no guess.
    if (app.url) {
      catalogDirect++
      continue
    }

    const resolution = await resolveApp(app)
    if (!resolution.url) {
      notFound++
      console.log(`  MISS ${app.name.padEnd(22)} ${resolution.reason ?? "nothing in the registry"}`)
      continue
    }

    const verdict = await answers(resolution.url)
    if (!verdict.answered) {
      foundButDead++
      console.log(`  DEAD ${app.name.padEnd(22)} ${resolution.url} — ${verdict.error ?? verdict.status}`)
      continue
    }

    resolvedAndLive++
    console.log(
      `  ok   ${app.name.padEnd(22)} ${resolution.server?.name ?? resolution.url}` +
        `${resolution.server?.name ? ` -> ${resolution.url}` : ""} (${verdict.status})`,
    )
  }

  console.log(`\nalready first-party  ${catalogDirect}`)
  console.log(`resolved and live    ${resolvedAndLive}`)
  console.log(`found but dead       ${foundButDead}`)
  console.log(`nothing found        ${notFound}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2))
}