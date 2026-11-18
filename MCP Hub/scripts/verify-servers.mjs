#!/usr/bin/env node
// Copyright (c) 2026 onelpawarai. All rights reserved.

// Verify MCP servers for real, and keep only the ones that answered.
//
//   node "MCP Hub/scripts/verify-servers.mjs" --kind remote --target 2500 --concurrency 24
//   node "MCP Hub/scripts/verify-servers.mjs" --kind npx    --target 2000 --concurrency 6
//   node "MCP Hub/scripts/verify-servers.mjs" --report
//
// "Verified" is not a claim, it is a transcript:
//
//   1. `initialize` must answer with a JSON-RPC result. A 404, an HTML page, a socket
//      error or a timeout is a fail, not a maybe.
//   2. `tools/list` must return at least one tool. A server that handshakes and then
//      offers nothing is a fail — there is nothing for the agent to call.
//   3. For a remote server with a read-only tool, one `tools/call` must succeed.
//   4. A 401 is not a fail on its own: it is the signal that the server wants a browser
//      sign-in or a key, and the discovery documents decide which. The discovery must
//      answer before the card is allowed to promise a login it cannot open.
//
// Results append to data/verified.jsonl one line at a time, so a run that dies halfway
// resumes at the next unverified server instead of starting over. Failures land in
// data/failed.json with the reason the wire gave.

import { createWriteStream } from "node:fs"
import { mkdir, readFile, writeFile, appendFile, access } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const DATA = join(ROOT, "data")
const SERVERS = join(DATA, "servers.json")
const VERIFIED = join(DATA, "verified.jsonl")
/** Working log of failures; aggregated into failed.json by build-catalog.mjs. */
const FAILED = join(DATA, "failed")

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const value = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)

/** `remote` is the friendly name for `remote_http`; both are accepted on the command line. */
const ALIAS = { remote: "remote_http", http: "remote_http", npm: "npx", pypi: "uvx", oci: "docker" }
const KINDS = (value("--kind") ?? "remote")
  .split(",")
  .map((k) => ALIAS[k.trim()] ?? k.trim())
const TARGET = value("--target") ? Number(value("--target")) : 2500
const CONCURRENCY = value("--concurrency") ? Number(value("--concurrency")) : 16
const RPC_TIMEOUT_MS = value("--timeout") ? Number(value("--timeout")) : 12_000
const SPAWN_TIMEOUT_MS = value("--spawn-timeout") ? Number(value("--spawn-timeout")) : 45_000
const OFFSET = value("--offset") ? Number(value("--offset")) : 0

const PROTOCOL_VERSION = "2025-06-18"
/**
 * Protocol versions to offer, newest first.
 *
 * The spec says a server answers with the version it supports, and most do. A minority
 * instead reject the handshake outright with "Unsupported protocol version", and those are
 * perfectly good servers built against an older revision — 41 of them were thrown away
 * before this list existed. Trying the previous revisions costs one extra round trip on a
 * server that was going to fail anyway.
 */
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]
const CLIENT_INFO = { name: "zyraxon-mcp-hub-verifier", version: "1.0.0" }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Classify a server the way the catalog will: remotes win, then package registries. */
export function installKindOf(server) {
  if (server.remotes?.length) return "remote_http"
  const types = new Set((server.packages ?? []).map((p) => p.registryType))
  if (types.has("npm")) return "npx"
  if (types.has("pypi")) return "uvx"
  if (types.has("oci")) return "docker"
  if (types.has("mcpb")) return "mcpb"
  if (types.has("nuget")) return "nuget"
  return "unknown"
}

/**
 * Does this server need a value only the user has?
 *
 * Two shapes mean yes: a declared required environment variable, or a remote whose URL
 * still carries a `{placeholder}` the caller must fill. Everything else can be reached
 * with nothing in hand, which is what the no_auth card promises.
 */
export function needsInput(server) {
  for (const p of server.packages ?? []) {
    if ((p.environmentVariables ?? []).some((e) => e.isRequired)) return "api_key"
  }
  for (const r of server.remotes ?? []) {
    if (/\{[^}]+\}/.test(r.url ?? "")) return "url_input"
  }
  return undefined
}

/** A JSON-RPC request body. `id` is always 1 — one call in flight per transport here. */
function rpcBody(method, params) {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
}

/**
 * The package a local server launches from, in the order the launcher prefers.
 *
 * Recorded so the panel can write the same command the verifier proved. The registry
 * lists a server's packages as an array and the first npm/pypi/oci entry is the one
 * installKindOf picked, so the same precedence is applied here rather than taking [0],
 * which can be an mcpb bundle that this launcher does not run.
 */
function packageOf(server) {
  const order = ["npm", "pypi", "oci", "mcpb", "nuget"]
  for (const type of order) {
    const found = (server.packages ?? []).find((p) => p.registryType === type)
    if (found) return { registry_type: type, identifier: found.identifier, version: found.version }
  }
  return undefined
}

/**
 * Parse an MCP HTTP answer.
 *
 * A streamable-http server may answer either as plain JSON or as a one-shot SSE stream
 * whose `data:` line holds the JSON-RPC envelope. Both are read; an HTML body is
 * recognised and rejected with that fact, because "got HTML" is a different failure from
 * "got nothing" and the difference matters when reading the failed list.
 */
function parseRpcAnswer(text, contentType) {
  const trimmed = text.trim()
  if (!trimmed) return { error: "empty body" }
  if (contentType?.includes("text/event-stream") || trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
    for (const line of trimmed.split("\n")) {
      const line2 = line.trim()
      if (!line2.startsWith("data:")) continue
      const payload = line2.slice(5).trim()
      if (!payload) continue
      try {
        return { json: JSON.parse(payload) }
      } catch {
        // keep reading: a stream may open with comments or pings before the payload
      }
    }
    return { error: "sse stream with no JSON payload" }
  }
  if (trimmed.startsWith("<")) return { error: "answered with HTML, not JSON-RPC" }
  try {
    return { json: JSON.parse(trimmed) }
  } catch {
    return { error: `unparseable body: ${trimmed.slice(0, 80)}` }
  }
}

/** One JSON-RPC call over streamable HTTP, with the session header carried across calls. */
async function httpRpc(url, method, params, session, version = PROTOCOL_VERSION) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": version,
  }
  if (session) headers["mcp-session-id"] = session

  const body = rpcBody(method, params)

  /**
   * Retry a transient network failure.
   *
   * `fetch failed` on a machine running many sockets at once is usually a resolver or
   * socket-pool hiccup, not a dead server: api.averray.com answered 200 by hand moments
   * after the verifier recorded "fetch failed" for it. Two retries with a short backoff
   * separate "this server is gone" from "this box was busy", which is the difference
   * between a true catalog and one that drops working servers.
   */
  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      })

      const text = await res.text().catch(() => "")
      const contentType = res.headers.get("content-type") ?? ""
      const nextSession = res.headers.get("mcp-session-id") ?? session
      return { status: res.status, headers: res.headers, contentType, text, nextSession }
    } catch (error) {
      lastError = error
      const transient = /fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN|EPIPE|socket hang up|UND_ERR/i.test(
        `${error?.message ?? ""} ${error?.cause?.code ?? ""}`,
      )
      if (!transient || attempt === 2) throw error
      await sleep(400 * (attempt + 1))
    }
  }
  throw lastError
}

/**
 * Verify one remote server.
 *
 * The order is the MCP order: initialize, then tools/list, then one read-only call. A 401
 * anywhere is passed back as `needs_auth` together with whatever the discovery documents
 * said, so the card can show the right step rather than a generic failure.
 */
async function verifyRemote(server) {
  const remote = server.remotes[0]
  const url = remote.url
  if (/\{[^}]+\}/.test(url)) {
    return { ok: true, connect_kind: "url_input", verification: "declared", reason: "endpoint needs a user-supplied value" }
  }

  let session
  let version = PROTOCOL_VERSION
  try {
    let init = await httpRpc(url, "initialize", {
      protocolVersion: version,
      capabilities: { roots: { listChanged: false } },
      clientInfo: CLIENT_INFO,
    }, session, version)

    // A server may refuse the newest revision with "Unsupported protocol version" and still
    // be a working server. Walk the older revisions before calling it dead, and remember the
    // one that answered so the rest of the session speaks it.
    if (init.status < 400) {
      const firstParse = parseRpcAnswer(init.text, init.contentType)
      const versionError = firstParse.json?.error?.message ?? ""
      if (/unsupported protocol version/i.test(versionError)) {
        for (const candidate of PROTOCOL_VERSIONS.slice(1)) {
          const retry = await httpRpc(url, "initialize", {
            protocolVersion: candidate,
            capabilities: { roots: { listChanged: false } },
            clientInfo: CLIENT_INFO,
          }, session, candidate)
          const retryParse = parseRpcAnswer(retry.text, retry.contentType)
          const retryError = retryParse.json?.error?.message ?? ""
          if (retry.status < 400 && !/unsupported protocol version/i.test(retryError)) {
            init = retry
            version = candidate
            break
          }
        }
      }
    }

    if (init.status === 401 || init.status === 403) {
      const discovery = await discoverAuth(url, init.headers)
      // A challenge or a discovery document is proof the server is real and speaks MCP
      // auth; it is what makes the login step openable. With neither, the 401 is a dead
      // end and the card would promise a sign-in nobody can complete.
      if (discovery.kind === "oauth_browser") {
        return { ok: true, connect_kind: "oauth_browser", verification: "auth_discovery", needs_login: true, auth: discovery }
      }
      return { ok: false, connect_kind: discovery.kind, reason: discovery.note }
    }
    if (init.status === 404) return { ok: false, connect_kind: "no_auth", reason: "404 on initialize" }
    if (init.status >= 400) return { ok: false, connect_kind: "no_auth", reason: `initialize answered ${init.status}` }

    const parsed = parseRpcAnswer(init.text, init.contentType)
    if (!parsed.json) return { ok: false, connect_kind: "no_auth", reason: parsed.error }
    if (parsed.json.error) return { ok: false, connect_kind: "no_auth", reason: `initialize error: ${parsed.json.error.message ?? JSON.stringify(parsed.json.error).slice(0, 120)}` }
    session = init.nextSession

    // Speak back the revision the server chose, not the one we offered. A server that
    // negotiates down to an older revision rejects the next call if it still carries the
    // newer header, which read as "Unsupported protocol version" on tools/list and threw
    // away working servers.
    if (typeof parsed.json.result?.protocolVersion === "string") version = parsed.json.result.protocolVersion

    const listed = await httpRpc(url, "tools/list", {}, session, version)
    if (listed.status === 401 || listed.status === 403) {
      const discovery = await discoverAuth(url, listed.headers)
      if (discovery.kind === "oauth_browser") {
        return { ok: true, connect_kind: "oauth_browser", verification: "auth_discovery", needs_login: true, auth: discovery }
      }
      return { ok: false, connect_kind: discovery.kind, reason: discovery.note }
    }
    const listParsed = parseRpcAnswer(listed.text, listed.contentType)
    if (!listParsed.json) return { ok: false, connect_kind: "no_auth", reason: `tools/list: ${listParsed.error}` }
    if (listParsed.json.error) return { ok: false, connect_kind: "no_auth", reason: `tools/list error: ${listParsed.json.error.message ?? ""}`.trim() }

    const tools = listParsed.json.result?.tools ?? []
    if (tools.length === 0) return { ok: false, connect_kind: "no_auth", reason: "tools/list returned no tools" }

    // One read-only call decides whether the tools are real. A server that lists them and
    // refuses every call is the exact case a handshake alone would have passed.
    const readOnly = tools.find((t) => /^(list|get|search|read|fetch|query|status|info|describe)/i.test(t.name ?? ""))
    let callOk = false
    let callNote
    if (readOnly) {
      const called = await httpRpc(url, "tools/call", { name: readOnly.name, arguments: {} }, session)
      const callParsed = parseRpcAnswer(called.text, called.contentType)
      if (callParsed.json?.result) callOk = true
      else callNote = callParsed.json?.error?.message ?? callParsed.error ?? `status ${called.status}`
    }

    return {
      ok: true,
      connect_kind: "no_auth",
      verification: readOnly ? "full" : "tools_list",
      tool_count: tools.length,
      tool_names: tools.slice(0, 20).map((t) => t.name),
      read_only_call: readOnly ? { tool: readOnly.name, ok: callOk, note: callNote } : undefined,
    }
  } catch (error) {
    return { ok: false, connect_kind: "no_auth", reason: error?.name === "TimeoutError" ? "timeout" : (error?.message ?? String(error)).slice(0, 140) }
  }
}

/**
 * Ask a 401'ing server where its auth lives.
 *
 * The `resource_metadata` link inside `WWW-Authenticate` is the primary answer, because it
 * names the exact document this server publishes; `/.well-known/oauth-protected-resource`
 * and `/.well-known/oauth-authorization-server` at the origin are the fallbacks the spec
 * defines. A challenge header on its own is already evidence of a browser sign-in per the
 * catalog's own rule, but a document that actually answers is stronger, so it is preferred
 * and its contents are kept for the card.
 */
async function discoverAuth(baseUrl, headers) {
  const challenge = headers.get("www-authenticate") ?? ""
  const notes = []
  if (challenge) notes.push(`challenge: ${challenge.slice(0, 100)}`)

  // The header may point straight at the protected-resource document.
  const fromHeader = /resource_metadata="([^"]+)"/.exec(challenge)?.[1]

  const origin = (() => {
    try {
      return new URL(baseUrl).origin
    } catch {
      return undefined
    }
  })()

  const candidates = []
  if (fromHeader) candidates.push(fromHeader)
  if (origin) {
    candidates.push(`${origin}/.well-known/oauth-protected-resource`)
    candidates.push(`${origin}/.well-known/oauth-authorization-server`)
  }

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const body = await res.json().catch(() => undefined)
      if (body && typeof body === "object") {
        return {
          kind: "oauth_browser",
          metadata_url: url,
          authorization_servers: body.authorization_servers ?? (body.issuer ? [body.issuer] : undefined),
          registration_endpoint: body.registration_endpoint,
          note: notes.join("; ") || `discovery at ${url}`,
        }
      }
    } catch {
      // try the next candidate
    }
  }

  // No document, but the server did challenge us: that is still a browser sign-in, and the
  // card will open the authorization endpoint the challenge advertised.
  if (challenge) return { kind: "oauth_browser", note: notes.join("; ") }
  return { kind: "unknown", note: "401 with no discovery document and no challenge" }
}

/**
 * Verify a local server by actually running it.
 *
 * The package is fetched and started with the registry's own arguments, then spoken to
 * over stdio with the same three calls the remote path uses. A package that will not
 * install, will not start, or starts and never answers is a fail with that reason
 * recorded — this is a real launch, not a simulation.
 */
async function verifyLocal(server) {
  const kind = installKindOf(server)
  const pkg = server.packages.find((p) =>
    kind === "npx" ? p.registryType === "npm" : kind === "uvx" ? p.registryType === "pypi" : kind === "docker" ? p.registryType === "oci" : false,
  )
  if (!pkg) return { ok: false, connect_kind: "no_auth", reason: `no package for ${kind}` }

  const version = pkg.version ? `@${pkg.version}` : ""
  let command
  let commandArgs
  if (kind === "npx") {
    command = "npx"
    commandArgs = ["-y", `${pkg.identifier}${version}`, ...argStrings(pkg)]
  } else if (kind === "uvx") {
    command = "uvx"
    commandArgs = [`${pkg.identifier}${pkg.version ? `==${pkg.version}` : ""}`, ...argStrings(pkg)]
  } else if (kind === "docker") {
    command = "docker"
    commandArgs = ["run", "-i", "--rm", pkg.identifier, ...argStrings(pkg)]
  } else {
    return { ok: false, connect_kind: "no_auth", reason: `${kind} is not launchable here` }
  }

  const requiredEnv = (pkg.environmentVariables ?? []).filter((e) => e.isRequired)
  if (requiredEnv.length) {
    // The secret is not ours to have, so the full call cannot be made here. What can be
    // proven is that the package resolves and starts — the half of the card that would
    // otherwise fail on the user's machine with "not found". If it will not even launch,
    // this is a fail; if it launches and then asks for its key, that is the honest
    // api_key result.
    const launched = await proveLaunch(command, commandArgs)
    if (!launched.ok) {
      return { ok: false, connect_kind: "api_key", reason: launched.reason }
    }
    return {
      ok: true,
      connect_kind: "api_key",
      verification: "launched",
      needs_login: true,
      env_schema: requiredEnv.map((e) => ({ name: e.name, description: e.description, isSecret: e.isSecret })),
      launched: launched.command,
    }
  }

  return await speakStdio(command, commandArgs, server)
}

/**
 * Start a package and see whether it stays up.
 *
 * Used for servers that need a secret we do not have. Resolving and starting is the part
 * that fails on a user's machine when a package name is wrong, so it is the part worth
 * checking without the key.
 */
function proveLaunch(command, commandArgs) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, commandArgs, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, npm_config_yes: "true", NO_COLOR: "1" } })
    } catch (error) {
      resolve({ ok: false, reason: `could not start ${command}: ${error.message}` })
      return
    }
    let stderr = ""
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill("SIGKILL")
      } catch {
        // already gone
      }
      resolve(result)
    }
    const timer = setTimeout(() => done({ ok: true, command: `${command} ${commandArgs.slice(0, 3).join(" ")}` }), 25_000)
    child.stderr.on("data", (d) => {
      stderr += d.toString()
      if (stderr.length > 4000) stderr = stderr.slice(-4000)
    })
    child.on("error", (error) => done({ ok: false, reason: `could not start ${command}: ${error.message}` }))
    child.on("exit", (code) => {
      // A package that exits non-zero straight away did not resolve. One that exits after
      // complaining about a missing key did resolve and start, which is what we asked.
      const looksLikeMissingSecret = /api[_ -]?key|token|credential|unauthor|environment variable/i.test(stderr)
      if (code !== 0 && !looksLikeMissingSecret) {
        done({ ok: false, reason: `package exited ${code}${stderr ? `; stderr: ${stderr.slice(0, 120)}` : ""}` })
      } else {
        done({ ok: true, command: `${command} ${commandArgs.slice(0, 3).join(" ")}` })
      }
    })
    // Ask for a handshake; a package needing a key usually refuses here and says so.
    try {
      child.stdin.write(rpcBody("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO }) + "\n")
    } catch {
      // stdin may already be closed; the exit handler decides
    }
  })
}

/** Flatten the registry's argument records into the argv the launcher expects. */
function argStrings(pkg) {
  const out = []
  for (const group of [pkg.runtimeArguments ?? [], pkg.packageArguments ?? []]) {
    for (const a of group) {
      if (!a) continue
      if (a.type === "named" && a.name) out.push(`--${a.name}`, ...(a.valueHint ? [a.valueHint] : []))
      else if (a.value) out.push(a.value)
    }
  }
  return out
}

/**
 * Start a process and drive one MCP session over its stdio.
 *
 * A single deadline covers the whole exchange: install, start, initialize, tools/list.
 * Without it a package that hangs during install would hold a worker forever.
 */
function speakStdio(command, commandArgs, server) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, npm_config_yes: "true", NO_COLOR: "1" },
    })

    let buffer = ""
    let stderr = ""
    let settled = false
    const tools = []
    let phase = "initialize"

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill("SIGKILL")
      } catch {
        // already gone
      }
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish({ ok: false, connect_kind: "no_auth", reason: `timed out during ${phase}${stderr ? `; stderr: ${stderr.slice(0, 120)}` : ""}` })
    }, SPAWN_TIMEOUT_MS)

    const send = (method, params) => {
      child.stdin.write(rpcBody(method, params) + "\n")
    }

    child.on("error", (error) => {
      finish({ ok: false, connect_kind: "no_auth", reason: `could not start ${command}: ${error.message}` })
    })

    child.on("exit", (code) => {
      if (!settled) {
        finish({ ok: false, connect_kind: "no_auth", reason: `process exited (code ${code}) during ${phase}${stderr ? `; stderr: ${stderr.slice(0, 120)}` : ""}` })
      }
    })

    child.stderr.on("data", (d) => {
      stderr += d.toString()
      if (stderr.length > 4000) stderr = stderr.slice(-4000)
    })

    child.stdout.on("data", (d) => {
      buffer += d.toString()
      let idx
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line.startsWith("{")) continue
        let msg
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        if (msg.id !== 1) continue

        if (phase === "initialize") {
          if (msg.error) {
            finish({ ok: false, connect_kind: "no_auth", reason: `initialize error: ${msg.error.message ?? ""}` })
            return
          }
          phase = "tools/list"
          send("tools/list", {})
        } else if (phase === "tools/list") {
          if (msg.error) {
            finish({ ok: false, connect_kind: "no_auth", reason: `tools/list error: ${msg.error.message ?? ""}` })
            return
          }
          for (const t of msg.result?.tools ?? []) tools.push(t)
          if (tools.length === 0) {
            finish({ ok: false, connect_kind: "no_auth", reason: "tools/list returned no tools" })
            return
          }
          finish({
            ok: true,
            connect_kind: "no_auth",
            tool_count: tools.length,
            tool_names: tools.slice(0, 20).map((t) => t.name),
            launched: `${command} ${commandArgs.slice(0, 4).join(" ")}`,
          })
        }
      }
    })

    send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { roots: { listChanged: false } },
      clientInfo: CLIENT_INFO,
    })
  })
}

/** Servers already recorded in verified.jsonl, so a restart does not redo them. */
async function loadDone() {
  const done = new Set()
  try {
    const text = await readFile(VERIFIED, "utf8")
    for (const line of text.split("\n")) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line)
        if (row.id) done.add(row.id)
      } catch {
        // a torn last line from a killed run — ignore it, it will be rewritten
      }
    }
  } catch {
    // nothing verified yet
  }
  return done
}

async function main() {
  if (flag("--report")) {
    const text = await readFile(VERIFIED, "utf8").catch(() => "")
    const rows = text.split("\n").filter(Boolean).map((l) => JSON.parse(l))
    const byKind = {}
    const byConnect = {}
    for (const r of rows) {
      byKind[r.install_kind] = (byKind[r.install_kind] ?? 0) + 1
      byConnect[r.connect_kind] = (byConnect[r.connect_kind] ?? 0) + 1
    }
    process.stdout.write(JSON.stringify({ verified: rows.length, byInstallKind: byKind, byConnectKind: byConnect }, null, 2) + "\n")
    return
  }

  await mkdir(DATA, { recursive: true })
  const bundle = JSON.parse(await readFile(SERVERS, "utf8"))
  const all = bundle.servers
  const done = await loadDone()

  const wanted = all.filter((s) => KINDS.includes(installKindOf(s)) && !done.has(s.id))
  const batch = wanted.slice(OFFSET, OFFSET + TARGET * 4)

  process.stderr.write(`verified so far: ${done.size}; candidates in this batch: ${batch.length}; target ${TARGET} more\n`)

  let passed = 0
  let failed = 0
  let index = 0
  const failures = []

  const worker = async () => {
    while (index < batch.length && passed < TARGET) {
      const server = batch[index++]
      const kind = installKindOf(server)
      const result = kind === "remote_http" ? await verifyRemote(server) : await verifyLocal(server)
      const row = {
        id: server.id,
        title: server.title,
        description: server.description,
        install_kind: kind,
        connect_kind: result.connect_kind,
        /** how far the proof went: full | tools_list | auth_discovery | launched | declared */
        verification: result.verification,
        needs_login: result.needs_login ?? false,
        /**
         * What the panel needs to write a real config entry.
         *
         * The verifier already had the server in hand, so the endpoint it actually
         * reached and the package it actually launched are recorded here. Without them
         * the catalog could only show a card and not connect it, which is the difference
         * between a list and a working hub.
         */
        url: server.remotes?.[0]?.url,
        package: packageOf(server),
        repository: server.repository,
        website: server.website,
        version: server.version,
        last_verified: new Date().toISOString(),
        tool_count: result.tool_count ?? 0,
        tool_names: result.tool_names,
        env_schema: result.env_schema,
        auth: result.auth,
      }
      if (result.ok) {
        passed++
        await appendFile(VERIFIED, JSON.stringify(row) + "\n")
      } else {
        failed++
        failures.push({ id: server.id, install_kind: kind, connect_kind: result.connect_kind, reason: result.reason })
        await appendFile(FAILED + ".jsonl", JSON.stringify(failures[failures.length - 1]) + "\n")
      }
      if ((passed + failed) % 25 === 0) {
        process.stderr.write(`  pass ${passed} / fail ${failed} (${passed + failed} tried)\n`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  process.stderr.write(`batch done: pass ${passed}, fail ${failed}\n`)
}

main().catch((error) => {
  process.stderr.write(`verify failed: ${error?.message ?? error}\n`)
  process.exit(1)
})
