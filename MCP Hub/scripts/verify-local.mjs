// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Prove every process-based catalog entry actually starts.
 *
 *   bun run "MCP Hub/scripts/verify-local.mjs"
 *
 * A card that says "Runs on your machine" is a promise that a command exists and
 * answers an MCP initialize. Nothing else in the suite checks that: verify-live only
 * looks at remote URLs, so a typo in a package name or an environment variable would
 * ship silently and the user would press Connect and see a failure.
 *
 * The list is read from the catalog, not typed here, so a new local entry is covered
 * the moment it is added. Each server is started with placeholder credentials — enough
 * for it to reach its handshake, since a server that reads its config at startup is
 * exactly what this is checking.
 *
 * Run it on Linux, macOS and Windows; the launcher resolution and the shell it needs
 * differ per platform, which is the whole reason this exists as a script.
 */

import { spawn } from "cross-spawn"
import { allSeedApps } from "../catalog/seed.ts"

const START_TIMEOUT_MS = 90_000

/** A value that satisfies "not empty" without pretending to be a real credential. */
function placeholderFor(key) {
  if (/SECRET|PASSWORD/i.test(key)) return "dummy-secret"
  if (/REFRESH/i.test(key)) return "dummy-refresh"
  if (/CLIENT_ID/i.test(key)) return "dummy-client-id"
  if (/USERNAME|EMAIL/i.test(key)) return "dummy-user"
  if (/ACCOUNT|_ID$|WABA/i.test(key)) return "123456789012345"
  return "dummy-token"
}

function start(app) {
  const [command, ...args] = app.command.command === undefined ? [] : [app.command.command, ...app.command.args]
  const env = { ...process.env }
  for (const entry of app.env ?? []) env[entry.key] = placeholderFor(entry.key)

  return new Promise((resolve) => {
    // cross-spawn is what the runtime itself uses, so a command that starts here starts
    // in the product: it resolves `npx`/`uvx` on Windows through the shim and passes the
    // stdio through untouched on every platform.
    const child = spawn(command, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    })
    let out = ""
    let err = ""
    let settled = false
    const finish = (ok, detail) => {
      if (settled) return
      settled = true
      try {
        child.kill("SIGKILL")
      } catch {}
      resolve({ ok, detail: (detail || "").replace(/\s+/g, " ").slice(0, 160) })
    }
    const timer = setTimeout(() => finish(false, err || "no initialize within 90s"), START_TIMEOUT_MS)
    child.stdout.on("data", (chunk) => {
      out += chunk.toString()
      if (out.includes("protocolVersion") || out.includes("serverInfo")) {
        clearTimeout(timer)
        finish(true, out)
      }
    })
    child.stderr.on("data", (chunk) => {
      err += chunk.toString()
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      finish(false, error.message)
    })
    child.on("exit", (code) => {
      clearTimeout(timer)
      if (!out) finish(false, `exited code=${code} ${err}`)
    })

    const initialize = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "verify-local", version: "1" } },
    })
    setTimeout(() => {
      try {
        child.stdin.write(initialize + "\n")
      } catch {
        // the exit handler reports the real reason
      }
    }, 2_000)
  })
}

const targets = allSeedApps().filter((app) => app.kind === "local" && app.command)
console.log(`MCP Hub local servers — ${targets.length} with a launch command, on ${process.platform}\n`)

let passed = 0
for (const app of targets) {
  const result = await start(app)
  if (result.ok) passed++
  const label = result.ok ? "ok  " : "FAIL"
  console.log(`  ${label} ${app.name.padEnd(20)} ${app.command.command} ${app.command.args.join(" ")}`)
  if (!result.ok) console.log(`       ${result.detail}`)
}

console.log(`\nstarted ${passed}/${targets.length}`)
process.exit(passed === targets.length ? 0 : 1)
