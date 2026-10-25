#!/usr/bin/env node
// Copyright (c) 2026 onelpawarai. All rights reserved.

// Find out, for every browser-sign-in server, whether it will register a client for us.
//
//   node "MCP Hub/scripts/verify-oauth-registration.mjs"              every oauth row
//   node "MCP Hub/scripts/verify-oauth-registration.mjs" --limit 25   a sample
//   node "MCP Hub/scripts/verify-oauth-registration.mjs" --report     summarise what is on disk
//
// Why this is a pass of its own, and why it is not the same question the verifier asks:
//
//   1. `verify-servers.mjs` reads the first discovery document it finds, which is almost
//      always `oauth-protected-resource`. That document names the *issuer* and nothing else
//      — the registration endpoint lives one hop further, in the issuer's own
//      `oauth-authorization-server` document. Reading only the first document found
//      `registration_endpoint` on 34 of 3,108 servers, which is why almost every browser app
//      was being reported as needing a hand-made client ID. The hop is the whole difference.
//
//   2. Publishing a registration endpoint is not the same as honouring it. Figma and Dropbox
//      both advertise one and then answer 403 — Dropbox with "Dynamic client registration is
//      not supported." A presence check marks both as one-click apps and then builds no
//      consent URL at all. So the registration is attempted for real, and a server counts as
//      self-registering only when it answers with a client ID.
//
// Results land in data/oauth-registration.jsonl, one line per server. build-catalog.mjs reads
// that file to decide whether a card may offer a plain press-and-go sign-in or has to ask for
// a client ID first, so the answer the user meets is the answer the server actually gave.

import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const DATA = join(ROOT, "data")
const VERIFIED = join(DATA, "verified.jsonl")
const OUT = join(DATA, "oauth-registration.jsonl")

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const value = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)

const LIMIT = value("--limit") ? Number(value("--limit")) : Infinity
const CONCURRENCY = value("--concurrency") ? Number(value("--concurrency")) : 24
const HOP_TIMEOUT_MS = value("--timeout") ? Number(value("--timeout")) : 6_000

/** The redirect the real handshake uses, so a server that checks it sees the true one. */
const REDIRECT = "http://127.0.0.1:19876/oauth/callback"

/** One request, bounded, and a miss treated as an ordinary answer rather than an error. */
async function fetchJson(url, init) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(HOP_TIMEOUT_MS), ...init })
    if (!res.ok) return { ok: false, status: res.status }
    const body = await res.json().catch(() => undefined)
    return { ok: true, status: res.status, body }
  } catch {
    return { ok: false, status: 0 }
  }
}

/** The document's own endpoints, when it names them outright. */
function endpointsOf(doc) {
  if (typeof doc?.registration_endpoint !== "string") return undefined
  return { registrationEndpoint: doc.registration_endpoint }
}

/** The issuers a document points at, in the order it lists them. */
function issuersOf(doc) {
  const list = doc?.authorization_servers
  if (Array.isArray(list) && list.length > 0) return list.filter((i) => typeof i === "string")
  if (typeof doc?.issuer === "string") return [doc.issuer]
  return []
}

/**
 * The well-known paths an issuer may publish its metadata at.
 *
 * Both layouts are in the catalog: some issuers put the MCP path inside the well-known URL
 * and some serve the bare origin, and a trailing slash has to be normalised or
 * `https://api.box.com/` becomes `https://api.box.com//.well-known/…`, which 404s.
 */
function issuerCandidates(issuer) {
  let root = issuer
  let path = ""
  try {
    const url = new URL(issuer)
    root = url.origin
    path = url.pathname.replace(/\/+$/, "")
  } catch {
    return []
  }
  return [
    `${root}/.well-known/oauth-authorization-server${path}`,
    `${root}/.well-known/oauth-authorization-server`,
    `${root}/.well-known/openid-configuration${path}`,
    `${root}/.well-known/openid-configuration`,
  ]
}

/** The well-known paths a server may publish its protected-resource document at. */
function resourceCandidates(serverUrl) {
  let root = ""
  let path = ""
  try {
    const url = new URL(serverUrl)
    root = url.origin
    path = url.pathname.replace(/\/+$/, "")
  } catch {
    return []
  }
  return [
    `${root}/.well-known/oauth-protected-resource${path}`,
    `${root}/.well-known/oauth-protected-resource`,
    `${root}${path}/.well-known/oauth-protected-resource`,
  ]
}

/**
 * Walk from a server to its registration endpoint, following the same hops the runtime does.
 *
 * Order matters and is not a preference: the server's own document is authoritative for which
 * issuer to ask, and asking the server itself before the issuer is what makes a vendor whose
 * authorization lives on another domain (ElevenLabs, Higgsfield) resolvable at all.
 */
async function findRegistration(serverUrl, seedIssuers, seedMetadataUrl, deadline) {
  const tried = []
  const seen = new Set()

  const fromIssuer = async (issuer) => {
    for (const candidate of issuerCandidates(issuer)) {
      if (seen.has(candidate) || Date.now() > deadline) continue
      seen.add(candidate)
      tried.push(candidate)
      const res = await fetchJson(candidate, { headers: { accept: "application/json" } })
      if (res.ok) {
        const found = endpointsOf(res.body)
        if (found) return found
      }
    }
    return undefined
  }

  // The document the verifier already read sometimes names the endpoint outright.
  if (seedMetadataUrl) {
    seen.add(seedMetadataUrl)
    const res = await fetchJson(seedMetadataUrl, { headers: { accept: "application/json" } })
    if (res.ok) {
      const found = endpointsOf(res.body)
      if (found) return { ...found, tried }
      // Its issuer list is the authoritative next hop.
      for (const issuer of issuersOf(res.body)) {
        const nested = await fromIssuer(issuer)
        if (nested) return { ...nested, tried }
      }
    }
  }

  for (const issuer of seedIssuers) {
    const found = await fromIssuer(issuer)
    if (found) return { ...found, tried }
  }

  // Fall back to the server as its own issuer, then to reading its resource document.
  const own = await fromIssuer(serverUrl)
  if (own) return { ...own, tried }

  for (const candidate of resourceCandidates(serverUrl)) {
    if (seen.has(candidate) || Date.now() > deadline) continue
    seen.add(candidate)
    tried.push(candidate)
    const res = await fetchJson(candidate, { headers: { accept: "application/json" } })
    if (!res.ok) continue
    const found = endpointsOf(res.body)
    if (found) return { ...found, tried }
    for (const issuer of issuersOf(res.body)) {
      const nested = await fromIssuer(issuer)
      if (nested) return { ...nested, tried }
    }
  }

  return { tried }
}

/**
 * Attempt the registration for real, and require a client ID back.
 *
 * A 2xx without one cannot produce a consent URL, so it is not a pass. The body is the same
 * one the handshake would send, so a server that inspects it sees a genuine client.
 */
async function attemptRegistration(registrationEndpoint) {
  const res = await fetchJson(registrationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "ZYRAXON",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  })
  if (!res.ok) return { selfRegisters: false, reason: `registration answered ${res.status || "no response"}` }
  const id = res.body?.client_id
  if (typeof id !== "string" || id.length === 0) {
    return { selfRegisters: false, reason: "registration answered 2xx with no client_id" }
  }
  return { selfRegisters: true, reason: "registration returned a client_id" }
}

/** Read the latest row per server, so a re-verification does not leave two answers behind. */
async function latestOauthRows() {
  const text = await readFile(VERIFIED, "utf8").catch(() => "")
  const byId = new Map()
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.connect_kind !== "oauth_browser") continue
    const previous = byId.get(row.id)
    if (!previous || (row.last_verified ?? "") > (previous.last_verified ?? "")) byId.set(row.id, row)
  }
  return [...byId.values()]
}

async function main() {
  await mkdir(DATA, { recursive: true })

  if (flag("--report")) {
    const text = await readFile(OUT, "utf8").catch(() => "")
    const rows = text.split("\n").filter(Boolean).map((l) => JSON.parse(l))
    const self = rows.filter((r) => r.selfRegisters).length
    process.stdout.write(JSON.stringify({ checked: rows.length, selfRegisters: self, needsClientId: rows.length - self }, null, 2) + "\n")
    return
  }

  const all = await latestOauthRows()
  const wanted = all.slice(0, LIMIT === Infinity ? undefined : LIMIT)
  process.stderr.write(`probing registration for ${wanted.length} browser-sign-in servers (concurrency ${CONCURRENCY})\n`)

  await writeFile(OUT, "")

  let self = 0
  let manual = 0
  let index = 0
  const started = Date.now()

  const worker = async () => {
    while (index < wanted.length) {
      const row = wanted[index++]
      const auth = row.auth ?? {}
      const deadline = Date.now() + 30_000
      const found = await findRegistration(row.url, auth.authorization_servers ?? [], auth.metadata_url, deadline)
      const result = found.registrationEndpoint
        ? await attemptRegistration(found.registrationEndpoint)
        : { selfRegisters: false, reason: "no registration endpoint published" }
      if (result.selfRegisters) self++
      else manual++
      await appendFile(
        OUT,
        JSON.stringify({
          id: row.id,
          selfRegisters: result.selfRegisters,
          registrationEndpoint: found.registrationEndpoint,
          reason: result.reason,
        }) + "\n",
      )
      const done = self + manual
      if (done % 50 === 0) {
        const rate = done / ((Date.now() - started) / 1000)
        process.stderr.write(`  ${done}/${wanted.length} self ${self} manual ${manual} (${rate.toFixed(1)}/s)\n`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  const seconds = ((Date.now() - started) / 1000).toFixed(0)
  process.stderr.write(`done in ${seconds}s: self-registering ${self}, needs a client ID ${manual}\n`)
  process.stdout.write(JSON.stringify({ checked: wanted.length, selfRegisters: self, needsClientId: manual, seconds: Number(seconds) }, null, 2) + "\n")
}

main().catch((error) => {
  process.stderr.write(`registration probe failed: ${error?.message ?? error}\n`)
  process.exit(1)
})
