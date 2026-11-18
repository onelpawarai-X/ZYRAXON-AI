// Copyright (c) 2026 onelpawarai. All rights reserved.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// The vault client reads its URL, shared key and licence code once, at import
// time. The server is therefore started first and the module imported after the
// environment points at it, so the test exercises the real fetch path rather
// than a stub of our own code.

type Server = ReturnType<typeof Bun.serve>

let server: Server
let dir: string
let vault: typeof import("../../src/subscription/prompt-vault")

const seen: { group: string | null; key: string | null; code: string | null; shared: string | null }[] = []

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const group = url.searchParams.get("group")
      const key = url.searchParams.get("key")
      const code = request.headers.get("x-zyraxon-code")
      const shared = request.headers.get("x-zyraxon-key")
      seen.push({ group, key, code, shared })

      if (shared !== "shared-key") return Response.json({ error: "unauthorized" }, { status: 401 })
      if (group === "mode" && key === "build") {
        return Response.json({ version: "2", group, key, tier: "pro", prompt: "SERVER BUILD PROMPT" })
      }
      if (group === "provider" && key === "anthropic") {
        return Response.json({ version: "2", group, key, tier: "free", prompt: "SERVER ANTHROPIC PROMPT" })
      }
      if (group === "mode" && key === "pro-builder") {
        return Response.json({ error: "locked" }, { status: 403 })
      }
      return Response.json({ error: "not found" }, { status: 404 })
    },
  })

  dir = mkdtempSync(join(tmpdir(), "zyraxon-vault-"))
  const stateFile = join(dir, "subscription.json")
  writeFileSync(stateFile, JSON.stringify({ tier: "pro", secretCode: "PRO-CODE-123" }), "utf-8")

  process.env.ZYRAXON_PROMPT_VAULT_URL = `http://localhost:${server.port}/api/public/agent/prompts`
  process.env.ZYRAXON_PROMPT_KEY = "shared-key"
  process.env.ZYRAXON_SUBSCRIPTION_FILE = stateFile

  vault = await import("../../src/subscription/prompt-vault")
})

afterAll(() => {
  server?.stop(true)
  rmSync(dir, { recursive: true, force: true })
})

describe("vault references", () => {
  test("ref builds a reference the parser reads back", () => {
    expect(vault.PromptVault.ref("mode", "build")).toBe("@vault:mode:build")
    expect(vault.PromptVault.parseRef("@vault:mode:build")).toEqual({ group: "mode", key: "build" })
    expect(vault.PromptVault.parseRef("@vault:provider:anthropic")).toEqual({
      group: "provider",
      key: "anthropic",
    })
  })

  test("isRef is true only for a reference", () => {
    expect(vault.PromptVault.isRef("@vault:mode:build")).toBe(true)
    expect(vault.PromptVault.isRef("plain prompt text")).toBe(false)
    expect(vault.PromptVault.isRef(undefined)).toBe(false)
  })

  test("parseRef leaves literal text alone", () => {
    expect(vault.PromptVault.parseRef("plain prompt text")).toBeUndefined()
    expect(vault.PromptVault.parseRef(undefined)).toBeUndefined()
    expect(vault.PromptVault.parseRef("@vault:")).toBeUndefined()
  })
})

describe("vault resolution over the network", () => {
  test("literal text is returned unchanged without a request", async () => {
    const before = seen.length
    expect(await vault.PromptVault.resolve("just some text")).toBe("just some text")
    expect(seen.length).toBe(before)
  })

  test("a reference is fetched and its text returned", async () => {
    expect(await vault.PromptVault.resolve(vault.PromptVault.ref("mode", "build"))).toBe(
      "SERVER BUILD PROMPT",
    )
  })

  test("the licence code and the shared key travel with the request", async () => {
    await vault.PromptVault.clear()
    await vault.PromptVault.resolve(vault.PromptVault.ref("provider", "anthropic"))
    const last = seen.at(-1)!
    expect(last.group).toBe("provider")
    expect(last.key).toBe("anthropic")
    expect(last.code).toBe("PRO-CODE-123")
    expect(last.shared).toBe("shared-key")
  })

  test("a locked prompt resolves to undefined rather than text", async () => {
    expect(await vault.PromptVault.resolve(vault.PromptVault.ref("mode", "pro-builder"))).toBeUndefined()
  })

  test("an unknown key resolves to undefined", async () => {
    expect(await vault.PromptVault.resolve(vault.PromptVault.ref("mode", "nope"))).toBeUndefined()
  })

  test("a warm value is served from memory without a second request", async () => {
    await vault.PromptVault.clear()
    await vault.PromptVault.resolve(vault.PromptVault.ref("mode", "build"))
    const afterFirst = seen.length
    expect(await vault.PromptVault.resolve(vault.PromptVault.ref("mode", "build"))).toBe(
      "SERVER BUILD PROMPT",
    )
    expect(seen.length).toBe(afterFirst)
  })

  test("clear drops the cache so the next resolve fetches again", async () => {
    await vault.PromptVault.clear()
    const before = seen.length
    await vault.PromptVault.resolve(vault.PromptVault.ref("mode", "build"))
    expect(seen.length).toBeGreaterThan(before)
  })

  test("a miss is not cached, so a later call retries", async () => {
    await vault.PromptVault.clear()
    await vault.PromptVault.resolve(vault.PromptVault.ref("mode", "pro-builder"))
    const afterFirst = seen.length
    await vault.PromptVault.resolve(vault.PromptVault.ref("mode", "pro-builder"))
    expect(seen.length).toBeGreaterThan(afterFirst)
  })

  test("warm fetches every reference it is given", async () => {
    await vault.PromptVault.clear()
    await vault.PromptVault.warm([
      vault.PromptVault.ref("mode", "build"),
      vault.PromptVault.ref("provider", "anthropic"),
    ])
    expect(await vault.PromptVault.resolve(vault.PromptVault.ref("mode", "build"))).toBe(
      "SERVER BUILD PROMPT",
    )
    expect(await vault.PromptVault.resolve(vault.PromptVault.ref("provider", "anthropic"))).toBe(
      "SERVER ANTHROPIC PROMPT",
    )
  })
})
