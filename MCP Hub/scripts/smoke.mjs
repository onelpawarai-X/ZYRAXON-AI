#!/usr/bin/env node
// End-to-end smoke test for MCP Hub.
//
//   node scripts/smoke.mjs
//
// Checks, against the live internet:
//   1. every app in the catalog has a reachable endpoint or a token page
//   2. which apps support zero-setup OAuth (dynamic client registration)
//   3. the registry answers and how many servers it holds
//   4. a real MCP handshake against a hosted server

import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const CATALOG = join(HERE, "..", "catalog", "seed.ts")

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  PASS  ${m}`) }
const bad = (m) => { fail++; console.log(`  FAIL  ${m}`) }

/** pull the app entries straight out of the TypeScript source */
async function loadApps() {
  const src = await readFile(CATALOG, "utf8")
  const apps = []
  const re = /\{\s*id:\s*"([^"]+)"[\s\S]*?kind:\s*"([^"]+)"[\s\S]*?\}/g
  let m
  while ((m = re.exec(src))) {
    const block = m[0]
    const url = /url:\s*"([^"]+)"/.exec(block)?.[1]
    const tokenUrl = /tokenUrl:\s*"([^"]+)"/.exec(block)?.[1]
    apps.push({ id: m[1], kind: m[2], url, tokenUrl })
  }
  return apps
}

async function head(url, method = "GET") {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 12000)
    const res = await fetch(url, { method, signal: ctrl.signal, redirect: "manual" })
    clearTimeout(t)
    return res.status
  } catch {
    return 0
  }
}

async function zeroSetup(url) {
  try {
    const origin = new URL(url).origin
    const res = await fetch(`${origin}/.well-known/oauth-authorization-server`)
    if (!res.ok) return false
    const meta = await res.json()
    return typeof meta?.registration_endpoint === "string" && meta.registration_endpoint.length > 0
  } catch {
    return false
  }
}

async function mcpHandshake(url) {
  // a real JSON-RPC call to a hosted MCP server
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mcp-hub-smoke", version: "1.0.0" },
      } }),
    })
    return { status: res.status, ok: res.status === 200 || res.status === 401 || res.status === 406 }
  } catch (e) {
    return { status: 0, ok: false, error: e.message }
  }
}

async function main() {
  console.log("MCP Hub smoke test")
  console.log("==================")

  console.log("\n1. catalog")
  const apps = await loadApps()
  if (apps.length === 0) bad("catalog did not parse")
  else ok(`parsed ${apps.length} apps from the catalog`)

  console.log("\n2. endpoints reachable")
  for (const a of apps) {
    if (a.kind === "local") {
      ok(`${a.id}: local server, no endpoint to reach`)
      continue
    }
    const target = a.url ?? a.tokenUrl
    if (!target) { bad(`${a.id}: no url`); continue }
    const code = await head(target)
    if (code === 0) bad(`${a.id}: no response from ${target}`)
    else ok(`${a.id}: ${target} -> ${code}`)
  }

  console.log("\n3. zero-setup OAuth (nothing asked of the user)")
  for (const a of apps.filter((x) => x.kind === "oauth" && x.url)) {
    const yes = await zeroSetup(a.url)
    yes ? ok(`${a.id}: dynamic registration available`) : bad(`${a.id}: needs a client id`)
  }

  console.log("\n4. MCP handshake against a hosted server")
  const hosted = apps.find((a) => a.url && a.id === "notion") ?? apps.find((a) => a.url)
  if (hosted) {
    const r = await mcpHandshake(hosted.url)
    r.ok
      ? ok(`${hosted.id}: handshake answered with ${r.status} (401 means the endpoint is live and wants auth)`)
      : bad(`${hosted.id}: handshake failed ${r.status} ${r.error ?? ""}`)
  }

  console.log("\n5. registry")
  try {
    const res = await fetch("https://registry.modelcontextprotocol.io/v0/servers?limit=100")
    const d = await res.json()
    const n = (d?.servers ?? []).length
    n > 0 ? ok(`registry answered with ${n} servers on the first page`) : bad("registry returned nothing")
  } catch (e) {
    bad(`registry unreachable: ${e.message}`)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
