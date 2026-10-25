// Copyright (c) 2026 onelpawarai. All rights reserved.

// MCP servers must not connect themselves, and must not inject their tools into a
// session that never asked for them.
//
// Two behaviours caused that and both were invisible from any single file: the bundled
// servers shipped with `enabled: true`, and every tool of every connected server was
// injected into every request. These tests pin the intended behaviour at both ends —
// the shipped config, and the session-scoped activation registry that gates injection.

import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import {
  activateServer,
  activatedServers,
  adoptConnected,
  deactivateServer,
} from "../src/mcp/activation"

const repoRoot = join(import.meta.dir, "..", "..", "..")

/** The four local servers that ship with the desktop app. */
const BUNDLED = ["jarvis-browser", "nuphus-desktop", "touchpoint-mcp", "desktop-commander"]

function readJsonc(path: string) {
  const raw = readFileSync(path, "utf-8")
  const stripped = raw.replace(/^\uFEFF/, "").replace(/^\s*\/\/.*$/gm, "")
  return JSON.parse(stripped)
}

describe("bundled MCP servers ship switched off", () => {
  test("default-mcp-config.json declares all four, none enabled", () => {
    const config = readJsonc(join(repoRoot, "packages", "desktop", "resources", "default-mcp-config.json"))
    for (const name of BUNDLED) {
      expect(config.mcp[name], `${name} should be declared`).toBeDefined()
      expect(config.mcp[name].enabled, `${name} must not start on its own`).toBe(false)
    }
  })

  test("the desktop auto-create writes the same disabled defaults", () => {
    const main = readFileSync(join(repoRoot, "packages", "desktop", "src", "main", "index.ts"), "utf-8")
    for (const name of BUNDLED) {
      // Each bundled entry must be followed by `enabled: false` before the next entry.
      const entry = main.slice(main.indexOf(`"${name}": {`), main.indexOf(`"${name}": {`) + 400)
      expect(entry, `${name} block should be present`).toContain('"type": "local"')
      expect(entry, `${name} must not start on its own`).toContain('"enabled": false')
      expect(entry, `${name} must not be force-enabled`).not.toContain('"enabled": true')
    }
  })
})

describe("activation registry", () => {
  test("a server is not activated until something activates it", () => {
    const session = "session-untouched"
    expect(activatedServers(session).size).toBe(0)
  })

  test("activating a server scopes it to its own session", () => {
    activateServer("session-a", "slack")
    expect(activatedServers("session-a").has("slack")).toBe(true)
    expect(activatedServers("session-b").has("slack")).toBe(false)
  })

  test("deactivating removes the server from that session only", () => {
    activateServer("session-c", "notion")
    activateServer("session-d", "notion")
    deactivateServer("session-c", "notion")
    expect(activatedServers("session-c").has("notion")).toBe(false)
    expect(activatedServers("session-d").has("notion")).toBe(true)
  })

  test("adopting already-connected servers keeps them in the tool list", () => {
    adoptConnected("session-e", ["user-configured-server"])
    expect(activatedServers("session-e").has("user-configured-server")).toBe(true)
  })

  test("adoption happens once, so a later connection cannot leak in", () => {
    adoptConnected("session-once", ["user-server"])
    // A server another session connects must not appear in this one's tool list.
    adoptConnected("session-once", ["server-connected-elsewhere"])
    expect(activatedServers("session-once").has("user-server")).toBe(true)
    expect(activatedServers("session-once").has("server-connected-elsewhere")).toBe(false)
  })

  test("a server activated after adoption stays activated", () => {
    adoptConnected("session-late", [])
    activateServer("session-late", "slack")
    expect(activatedServers("session-late").has("slack")).toBe(true)
  })

  test("a returned set is a copy, so callers cannot mutate the registry", () => {
    activateServer("session-f", "linear")
    activatedServers("session-f").clear()
    expect(activatedServers("session-f").has("linear")).toBe(true)
  })

  test("empty identifiers are ignored rather than creating an unnamed entry", () => {
    activateServer("", "slack")
    activateServer("session-g", "")
    expect(activatedServers("").size).toBe(0)
    expect(activatedServers("session-g").size).toBe(0)
  })

  test("the registry is bounded so a long-lived process cannot grow without limit", () => {
    for (let i = 0; i < 600; i++) activateServer(`bulk-session-${i}`, "server")
    // The oldest sessions are dropped; the newest must still be present.
    expect(activatedServers("bulk-session-599").has("server")).toBe(true)
  })
})
