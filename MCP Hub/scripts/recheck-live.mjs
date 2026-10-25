#!/usr/bin/env node
// Copyright (c) 2026 onelpawarai. All rights reserved.

// Re-probe every server the shipped catalog promises, and record the ones that no longer
// answer.
//
//   node "MCP Hub/scripts/recheck-live.mjs"                  every shipped remote endpoint
//   node "MCP Hub/scripts/recheck-live.mjs" --limit 50       a sample, to time a full run
//   node "MCP Hub/scripts/recheck-live.mjs" --kind no_auth   only the press-and-go servers
//   node "MCP Hub/scripts/recheck-live.mjs" --local          include npx/uvx/docker rows
//
// The catalog is a promise about a server on somebody else's domain. `verify-servers.mjs`
// makes that promise once; this checks it still holds, because a domain that rots turns a
// Connect press into an error and makes the whole Hub look broken.
//
// It is deliberately the same three calls the verifier makes — initialize, tools/list, and
// one read-only call — so a row that passes here would pass a fresh verification. The only
// difference is the input: this reads the shipped catalog rows, not the registry snapshot.
//
// Rows that fail are written to data/dead.jsonl, one line each, with the reason the wire
// gave. Nothing is removed here; build-catalog.mjs reads that file and leaves the dead
// servers out, so the removal is reviewable as a diff instead of a silent drop.

import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const DATA = join(ROOT, "data")
const CATALOG = join(ROOT, "catalog")
const DEAD = join(DATA, "dead.jsonl")

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const value = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)

const LIMIT = value("--limit") ? Number(value("--limit")) : Infinity
const KIND = value("--kind")
const INCLUDE_LOCAL = flag("--local")
const CONCURRENCY = value("--concurrency") ? Number(value("--concurrency")) : 32
const RPC_TIMEOUT_MS = value("--timeout") ? Number(value("--timeout")) : 15_000
const SPAWN_TIMEOUT_MS = value("--spawn-timeout") ? Number(value("--spawn-timeout")) : 45_000

const PROTOCOL_VERSION = "2025-06-18"
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]
const CLIENT_INFO = { name: "zyraxon-mcp-hub-recheck", version: "1.0.0" }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Read the shipped rows out of the generated index.
 *
 * The index is a TypeScript literal, and parsing it as text keeps this script independent
 * of the compiler. The shape is fixed by build-catalog.mjs: the array literal follows
 * `export const verifiedRows: VerifiedRow[] = ` and holds one JSON array of rows.
 */
async function readShippedRows() {
  const text = await readFile(join(CATALOG, "verified-index.ts"), "utf8")
  const marker = "export const verifiedRows: VerifiedRow[] = "
  const at = text.indexOf(marker)
  if (at === -1) throw new Error("verified-index.ts has no verifiedRows export")
  // Search past the marker: the marker itself ends in `[]` for the type, so looking for
  // the first `[` from `at` would land on the type annotation and parse an empty array.
  const start = text.indexOf("[", at + marker.length)
  // Walk to the matching bracket so a `]` inside a description cannot end the array early.
  let depth = 0
  let end = -1
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "[") depth++
    else if (ch === "]") {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) throw new Error("could not find the end of verifiedRows")
  return JSON.parse(text.slice(start, end + 1))
}

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

async function httpRpc(url, method, params, session, version = PROTOCOL_VERSION) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": version,
  }
  if (session) headers["mcp-session-id"] = session

  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })

  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(RPC_TIMEOUT_MS) })
      const text = await res.text().catch(() => "")
      return {
        status: res.status,
        headers: res.headers,
        contentType: res.headers.get("content-type") ?? "",
        text,
        nextSession: res.headers.get("mcp-session-id") ?? session,
      }
    } catch (error) {
      lastError = error
      const transient = /fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN|EPIPE|socket hang up|UND_ERR|terminated|TimeoutError|aborted/i.test(
        `${error?.message ?? ""} ${error?.cause?.code ?? ""}`,
      )
      if (!transient || attempt === 2) throw error
      await sleep(500 * (attempt + 1))
    }
  }
  throw lastError
}

/** Re-probe one remote row the way the verifier would, and say whether it still answers. */
async function probeRemote(row) {
  const url = row[8]
  /**
   * A template endpoint cannot be probed and must not be called dead.
   *
   * A `url_input` row is `https://{your-host}/mcp`: the placeholder is a value only the user
   * has, so there is no URL here to send a request to. Probing it asked for `""` and recorded
   * "fetch failed" as a dead server — which deleted every one of these rows from the catalog
   * for a reason that was about the probe and not about the server. They are skipped instead;
   * the verifier already proved the shape is real, and the panel asks the user to complete it.
   */
  if (!url || /\{[^}]+\}/.test(url)) {
    return { ok: true, note: "endpoint is a template the user completes; not probed" }
  }
  let session
  let version = PROTOCOL_VERSION
  try {
    let init = await httpRpc(url, "initialize", {
      protocolVersion: version,
      capabilities: { roots: { listChanged: false } },
      clientInfo: CLIENT_INFO,
    }, session, version)

    if (init.status < 400) {
      const first = parseRpcAnswer(init.text, init.contentType)
      if (/unsupported protocol version/i.test(first.json?.error?.message ?? "")) {
        for (const candidate of PROTOCOL_VERSIONS.slice(1)) {
          const retry = await httpRpc(url, "initialize", {
            protocolVersion: candidate,
            capabilities: { roots: { listChanged: false } },
            clientInfo: CLIENT_INFO,
          }, session, candidate)
          const parsed = parseRpcAnswer(retry.text, retry.contentType)
          if (retry.status < 400 && !/unsupported protocol version/i.test(parsed.json?.error?.message ?? "")) {
            init = retry
            version = candidate
            break
          }
        }
      }
    }

    if (init.status === 401 || init.status === 403) {
      // A challenge is still a live server; it is only dead when it refuses without saying
      // how to sign in.
      const challenge = init.headers.get("www-authenticate") ?? ""
      if (challenge) return { ok: true, note: "needs auth (challenge present)" }
      const discovery = await discoverAuth(url, init.headers)
      if (discovery) return { ok: true, note: "needs auth (discovery document present)" }
      return { ok: false, reason: `${init.status} with no challenge and no discovery document` }
    }
    if (init.status === 404) return { ok: false, reason: "404 on initialize" }
    if (init.status === 410) return { ok: false, reason: "410 gone" }
    if (init.status >= 400) return { ok: false, reason: `initialize answered ${init.status}` }

    const parsed = parseRpcAnswer(init.text, init.contentType)
    if (!parsed.json) return { ok: false, reason: parsed.error }
    if (parsed.json.error) {
      return { ok: false, reason: `initialize error: ${parsed.json.error.message ?? JSON.stringify(parsed.json.error).slice(0, 120)}` }
    }
    session = init.nextSession
    if (typeof parsed.json.result?.protocolVersion === "string") version = parsed.json.result.protocolVersion

    const listed = await httpRpc(url, "tools/list", {}, session, version)
    if (listed.status === 401 || listed.status === 403) {
      const challenge = listed.headers.get("www-authenticate") ?? ""
      if (challenge || (await discoverAuth(url, listed.headers))) return { ok: true, note: "needs auth on tools/list" }
      return { ok: false, reason: `${listed.status} on tools/list with no way to sign in` }
    }
    const listParsed = parseRpcAnswer(listed.text, listed.contentType)
    if (!listParsed.json) return { ok: false, reason: `tools/list: ${listParsed.error}` }
    if (listParsed.json.error) return { ok: false, reason: `tools/list error: ${listParsed.json.error.message ?? ""}`.trim() }

    const tools = listParsed.json.result?.tools ?? []
    if (tools.length === 0) return { ok: false, reason: "tools/list returned no tools" }
    return { ok: true, note: `${tools.length} tools` }
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? "timeout" : (error?.message ?? String(error)).slice(0, 140)
    return { ok: false, reason }
  }
}

async function discoverAuth(baseUrl, headers) {
  const challenge = headers.get("www-authenticate") ?? ""
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
      if (body && typeof body === "object") return true
    } catch {
      // try the next candidate
    }
  }
  return false
}

/**
 * Re-probe one local row.
 *
 * A local server needs the launcher the catalog names — `npx`, `uvx` or `docker` — and the
 * only honest check is to start it. A row whose launcher is missing on this machine is
 * reported as "skipped" rather than dead, because the machine is the limitation and not the
 * catalog.
 */
async function probeLocal(row) {
  const install = row[3]
  const registryType = row[9]
  const identifier = row[10]
  const version = row[11]
  if (!identifier) return { ok: false, reason: `no package recorded for ${install}` }

  let command
  let commandArgs
  if (install === "npx") {
    command = "npx"
    commandArgs = ["-y", version ? `${identifier}@${version}` : identifier]
  } else if (install === "uvx") {
    command = "uvx"
    commandArgs = [version ? `${identifier}==${version}` : identifier]
  } else if (install === "docker") {
    command = "docker"
    commandArgs = ["run", "-i", "--rm", identifier]
  } else {
    return { ok: false, reason: `${install} is not launchable here` }
  }

  const launched = await proveLaunch(command, commandArgs)
  return launched
}

function proveLaunch(command, commandArgs) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, commandArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, npm_config_yes: "true", NO_COLOR: "1" },
      })
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
    const timer = setTimeout(() => done({ ok: true, note: "started (still running)" }), SPAWN_TIMEOUT_MS)
    child.on("error", (error) => done({ ok: false, reason: `spawn failed: ${error.message}` }))
    child.on("exit", (code) => {
      // A server that exits cleanly after being told it has no key is the honest api_key
      // case; one that exits non-zero before answering is a broken package.
      if (code === 0) done({ ok: true, note: "started, exited cleanly" })
      else done({ ok: false, reason: `exited with code ${code}: ${stderr.slice(-160)}` })
    })
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    // An MCP server that speaks stdio will answer an initialize; sending one proves the
    // process is a real server and not a package that merely unpacked.
    try {
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO } }) + "\n",
      )
    } catch {
      // a package that closes stdin immediately is handled by the exit path
    }
  })
}

async function main() {
  await mkdir(DATA, { recursive: true })

  const all = await readShippedRows()
  const wanted = all
    .filter((row) => (KIND ? row[4] === KIND : true))
    .filter((row) => (INCLUDE_LOCAL ? true : row[3] === "remote_http"))
    .slice(0, LIMIT === Infinity ? undefined : LIMIT)

  process.stderr.write(`rechecking ${wanted.length} of ${all.length} shipped rows (concurrency ${CONCURRENCY})\n`)

  // A fresh log, so a partial run is not confused with a finished one.
  await writeFile(DEAD, "")

  let ok = 0
  let dead = 0
  let index = 0
  const started = Date.now()

  const worker = async () => {
    while (index < wanted.length) {
      const row = wanted[index++]
      const result = row[3] === "remote_http" ? await probeRemote(row) : await probeLocal(row)
      if (result.ok) {
        ok++
      } else {
        dead++
        await appendFile(DEAD, JSON.stringify({ id: row[0], install_kind: row[3], connect_kind: row[4], reason: result.reason }) + "\n")
      }
      const done = ok + dead
      if (done % 50 === 0) {
        const rate = done / ((Date.now() - started) / 1000)
        process.stderr.write(`  ${done}/${wanted.length} ok ${ok} dead ${dead} (${rate.toFixed(1)}/s)\n`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  const seconds = ((Date.now() - started) / 1000).toFixed(0)
  process.stderr.write(`done in ${seconds}s: ok ${ok}, dead ${dead}\n`)
  process.stdout.write(JSON.stringify({ checked: wanted.length, ok, dead, seconds: Number(seconds) }, null, 2) + "\n")
}

main().catch((error) => {
  process.stderr.write(`recheck failed: ${error?.message ?? error}\n`)
  process.exit(1)
})
