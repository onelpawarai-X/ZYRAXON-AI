#!/usr/bin/env node
// Prove that every app in the catalog resolves to a real, connectable MCP
// server, so no app is left half-done.
//
//   node scripts/verify-resolve.mjs
//
// For each app:
//   1. if the catalog knows a first-party endpoint, confirm it answers
//   2. otherwise search the official registry and pick the best hosted server
//   3. confirm the chosen endpoint is actually reachable
//
// An app that resolves to nothing is reported as a failure, because an app the
// panel cannot connect is not finished.

const { readFile } = await import("node:fs/promises")
const { dirname, join } = await import("node:path")
const { fileURLToPath } = await import("node:url")
const HUB = join(dirname(fileURLToPath(import.meta.url)), "..")

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  PASS  ${m}`) }
const bad = (m) => { fail++; console.log(`  FAIL  ${m}`) }
const note = (m) => console.log(`        ${m}`)

/** pull the catalog entries straight out of the TypeScript source */
function parseApps(src) {
  const apps = []
  const re = /\{\s*id:\s*"([^"]+)"[\s\S]*?name:\s*"([^"]+)"[\s\S]*?description:\s*"([^"]+)"[\s\S]*?category:\s*"([^"]+)"[\s\S]*?kind:\s*"([^"]+)"([\s\S]*?)\}/g
  let m
  while ((m = re.exec(src))) {
    const rest = m[6]
    apps.push({
      id: m[1], name: m[2], description: m[3], category: m[4], kind: m[5],
      url: /url:\s*"([^"]+)"/.exec(rest)?.[1],
      tokenUrl: /tokenUrl:\s*"([^"]+)"/.exec(rest)?.[1],
    })
  }
  return apps
}

async function reachable(url, method = "GET") {
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

function score(server, term) {
  const name = server.name.toLowerCase()
  const title = (server.title ?? "").toLowerCase()
  const desc = (server.description ?? "").toLowerCase()
  let s = 0
  if (!server.remote) s -= 40
  if (name.includes(term)) s += 20
  if (title.includes(term)) s += 14
  if (desc.includes(term)) s += 6
  for (const w of ["official", "mcp", "server", "api"]) if (name.includes(w)) s += 2
  for (const w of ["demo", "test", "sample", "example", "deprecated"]) if (name.includes(w) || desc.includes(w)) s -= 8
  s -= Math.min(name.length / 8, 6)
  return s
}

async function search(term) {
  const url = `https://registry.modelcontextprotocol.io/v0/servers?limit=30&search=${encodeURIComponent(term)}`
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) throw new Error(`registry ${res.status}`)
  const data = await res.json()
  return (data.servers ?? [])
    .map((e) => {
      const s = e.server ?? e
      const remotes = Array.isArray(s.remotes) ? s.remotes.filter((r) => r?.url).map((r) => r.url) : []
      return { name: s.name, title: s.title, description: s.description, remote: remotes.length > 0, remotes }
    })
    .filter((s) => s.name)
}

async function main() {
  console.log("MCP Hub - app resolution proof")
  console.log("==============================")
  console.log("Every app in the catalog must resolve to a real server, otherwise the")
  console.log("panel would show a card that cannot connect.\n")

  const src = await readFile(join(HUB, "catalog", "seed.ts"), "utf8")
  const apps = parseApps(src)
  console.log(`catalog: ${apps.length} apps\n`)

  for (const app of apps) {
    if (app.kind === "local") {
      ok(`${app.id}: local server shipped with ZYRAXON`)
      continue
    }

    // first-party endpoint known
    if (app.url) {
      const code = await reachable(app.url, "POST")
      if (code === 0) bad(`${app.id}: first-party endpoint unreachable`)
      else ok(`${app.id}: first-party endpoint answers (${code})`)
      continue
    }

    // resolve through the registry
    try {
      const term = app.id.includes("-") ? app.id.split("-")[0] : app.id
      const hits = await search(term)
      if (hits.length === 0) {
        bad(`${app.id}: no server in the registry for "${term}"`)
        continue
      }
      const ranked = hits.map((s) => ({ s, v: score(s, term) })).sort((a, b) => b.v - a.v).map((x) => x.s)
      const hosted = ranked.filter((s) => s.remote)
      const best = hosted[0] ?? ranked[0]
      if (!best.remote) {
        bad(`${app.id}: best match "${best.name}" is not hosted`)
        note(`candidates: ${ranked.slice(0, 3).map((s) => s.name).join(", ")}`)
        continue
      }
      const code = await reachable(best.remotes[0], "POST")
      if (code === 0) {
        bad(`${app.id}: resolved to ${best.name} but it did not answer`)
      } else {
        ok(`${app.id}: resolved to ${best.name} (${hits.length} candidates, endpoint answers ${code})`)
      }
    } catch (e) {
      bad(`${app.id}: registry search failed (${e.message})`)
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
