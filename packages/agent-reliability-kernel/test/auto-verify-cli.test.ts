// Copyright (c) 2026 onelpawarai. All rights reserved.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseConfig, toEvaluator } from "../src/auto-verify-cli"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../../..")
const cli = resolve(here, "../src/auto-verify-cli.ts")
const loader = join(repoRoot, "scripts/node-test/loader.mjs")

interface Run {
  code: number
  stdout: string
}

/**
 * The CLI is exercised as a real process against a real config file, because the
 * thing under test is the whole path: read config, run each evaluator, write the
 * verdict, set the exit code. An in-process call would skip the exit code, which
 * is exactly what a workflow keys on.
 */
function runCli(cwd: string, args: string[]): Promise<Run> {
  return new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      ["--import", loader, "--experimental-transform-types", cli, ...args],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    )
    let stdout = ""
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (stdout += chunk.toString()))
    child.on("close", (code) => resolveRun({ code: code ?? -1, stdout }))
  })
}

describe("config parsing", () => {
  test("a config without an evaluators array is refused", () => {
    expect(() => parseConfig(JSON.stringify({}))).toThrow("evaluators")
  })

  test("the swebench shorthand expands to the harness command", () => {
    const evaluator = toEvaluator({ kind: "swebench", id: "swe", dataset: "princeton-nlp/SWE-bench_Verified" })
    expect(evaluator.kind).toBe("command")
    if (evaluator.kind !== "command") throw new Error("expected a command evaluator")
    expect(evaluator.command).toBe("python")
    expect(evaluator.args).toContain("swebench.harness.run_evaluation")
  })

  test("a plain evaluator passes through unchanged", () => {
    const entry = { kind: "http" as const, id: "g", url: "https://example/score", score: { kind: "ratio" as const, pattern: "([0-9.]+)" } }
    expect(toEvaluator(entry)).toEqual(entry)
  })
})

describe("the CLI end to end", () => {
  let root: string
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "zyraxon-autoverify-cli-"))
  })
  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const writeConfig = (name: string, evaluators: unknown[]) =>
    writeFile(join(root, name), JSON.stringify({ evaluators }, null, 2), "utf8")

  test("a run where every evaluator scores a pass exits zero", async () => {
    await writeConfig("pass.json", [
      {
        kind: "command",
        id: "suite",
        command: process.execPath,
        args: ["-e", "process.stdout.write('all done: 5/5\\n')"],
        score: { kind: "fraction", pattern: "(\\d+)\\s*/\\s*(\\d+)" },
      },
    ])
    const result = await runCli(root, ["--config", "pass.json", "--out", "pass-verdict.json"])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("VERIFIED")
    const verdict = JSON.parse(await readFile(join(root, "pass-verdict.json"), "utf8")) as { ok: boolean }
    expect(verdict.ok).toBe(true)
  })

  test("a run with a partial score exits non-zero and records why", async () => {
    await writeConfig("partial.json", [
      {
        kind: "command",
        id: "suite",
        command: process.execPath,
        args: ["-e", "process.stdout.write('2/5\\n')"],
        score: { kind: "fraction", pattern: "(\\d+)\\s*/\\s*(\\d+)" },
        threshold: { requireAll: true },
      },
    ])
    const result = await runCli(root, ["--config", "partial.json", "--out", "partial-verdict.json"])
    expect(result.code).toBe(1)
    expect(result.stdout).toContain("NOT VERIFIED")
    const verdict = JSON.parse(await readFile(join(root, "partial-verdict.json"), "utf8")) as {
      ok: boolean
      outcomes: Array<{ status: string }>
    }
    expect(verdict.ok).toBe(false)
    expect(verdict.outcomes[0]?.status).toBe("failed")
  })

  test("an empty evaluator set is refused rather than reported as a pass", async () => {
    await writeConfig("empty.json", [])
    const result = await runCli(root, ["--config", "empty.json", "--out", "empty-verdict.json"])
    expect(result.code).toBe(2)
    expect(result.stdout).toContain("no evaluators")
  })

  test("a missing config file is reported, not thrown", async () => {
    const result = await runCli(root, ["--config", "does-not-exist.json", "--out", "x.json"])
    expect(result.code).toBe(2)
  })
})
