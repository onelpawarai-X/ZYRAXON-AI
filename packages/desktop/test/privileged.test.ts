// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { runPrivileged } from "../src/main/privileged"

// The install freeze was `sudo` waiting for a password nobody could type. These
// tests use a fake `sudo` on PATH so the argument contract is checked directly:
// the real `sudo` cannot be asked to prove a negative.
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// A Node script rather than a shell one: dash mangles the leading `-n` when a
// script re-expands "$@", and the whole point here is to observe argv exactly.
async function fakeSudo(body: string) {
  const dir = await mkdtemp(join(tmpdir(), "zyraxon-sudo-"))
  const file = join(dir, "sudo")
  await writeFile(file, `#!/usr/bin/env node\n${body}\n`)
  await chmod(file, 0o755)
  return dir
}

async function withPath<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env.PATH
  process.env.PATH = `${dir}:${original}`
  try {
    return await fn()
  } finally {
    process.env.PATH = original
  }
}

describe("runPrivileged", () => {
  test("passes -n so a missing password fails instead of blocking", async () => {
    const dir = await fakeSudo(
      `if (process.argv[2] !== "-n") { console.error("interactive prompt!"); process.exit(9) }`,
    )
    await withPath(dir, async () => {
      await expect(runPrivileged(["true"], { timeoutMs: 5000 })).resolves.toBeUndefined()
    })
  })

  test("forwards the command arguments after -n", async () => {
    const dir = await fakeSudo(
      `require("node:fs").writeFileSync(process.env.ARGS_OUT, process.argv.slice(2).join(" "))`,
    )
    const out = join(dir, "args.txt")
    process.env.ARGS_OUT = out
    try {
      await withPath(dir, async () => {
        await runPrivileged(["apt-get", "install", "-y", "python3"], { timeoutMs: 5000 })
      })
      // The recorded argv must be exactly `-n <command...>`: nothing dropped, nothing reordered.
      expect((await readFile(out, "utf8")).trim()).toBe("-n apt-get install -y python3")
    } finally {
      delete process.env.ARGS_OUT
    }
  })

  test("fails fast when the password is unavailable", async () => {
    const dir = await fakeSudo(
      `if (process.argv[2] === "-n") { console.error("sudo: a password is required"); process.exit(1) }`,
    )
    await withPath(dir, async () => {
      const started = Date.now()
      await expect(runPrivileged(["apt-get", "update"], { timeoutMs: 120_000 })).rejects.toThrow()
      // A 120s ceiling must not be reached: the failure has to be immediate.
      expect(Date.now() - started).toBeLessThan(5000)
    })
  })
})
