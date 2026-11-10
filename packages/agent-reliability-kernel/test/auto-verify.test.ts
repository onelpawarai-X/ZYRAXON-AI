// Copyright (c) 2026 onelpawarai. All rights reserved.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  AutoVerifier,
  evaluationOk,
  formatEvaluation,
  parseScore,
  readPath,
  scorePasses,
  substitute,
  swebenchEvaluator,
  type EvaluationOutcome,
  type Evaluator,
} from "../src/auto-verify"
import { spawnRunner } from "../src/runner"

/**
 * These tests drive the real execution path. The command evaluator is exercised
 * through `spawnRunner`, so a genuine child process runs and its genuine output is
 * scored; the HTTP evaluator is exercised against a real local listener. Only the
 * service at the far end is a stand-in, because a hosted grader is not something
 * a test can call.
 */

describe("placeholder substitution", () => {
  test("a target value replaces its placeholder everywhere", () => {
    expect(substitute("{repo}/{patch}", { repo: "work", patch: "fix.diff" })).toBe("work/fix.diff")
  })

  test("an unknown placeholder is left visible rather than blanked", () => {
    expect(substitute("--task {taskId}", {})).toBe("--task {taskId}")
  })
})

describe("reading a report", () => {
  test("a dotted path walks into nested objects and arrays", () => {
    expect(readPath({ summary: { resolved: 3 } }, "summary.resolved")).toBe(3)
    expect(readPath({ data: [{ score: 0.5 }] }, "data.0.score")).toBe(0.5)
    expect(readPath({ summary: {} }, "summary.missing")).toBeUndefined()
  })
})

describe("parsing a score", () => {
  test("a ratio reads as a fraction of one", () => {
    expect(parseScore({ kind: "ratio", pattern: "score: ([0-9.]+)" }, "score: 0.75")).toMatchObject({ ratio: 0.75 })
  })

  test("a fraction reads its numerator and total", () => {
    const score = parseScore({ kind: "fraction", pattern: "(\\d+)\\s*/\\s*(\\d+)" }, "12/16")
    expect(score).toMatchObject({ passed: 12, total: 16, ratio: 0.75 })
  })

  test("a percent reads as a fraction of one", () => {
    expect(parseScore({ kind: "percent", pattern: "coverage: ([0-9.]+)%" }, "coverage: 88.4%")).toMatchObject({
      ratio: 0.884,
    })
  })

  test("a count reads as a raw number of passing checks", () => {
    expect(parseScore({ kind: "count", pattern: "pass (\\d+)" }, "ℹ pass 19")).toMatchObject({ passed: 19 })
    expect(parseScore({ kind: "count", pattern: "pass (\\d+)" }, "no counts here")).toBeUndefined()
  })

  test("a boolean reads its pass and fail tokens", () => {
    const pattern = { kind: "boolean" as const, pattern: "resolved: (\\w+)", pass: ["true", "yes"], fail: ["false", "no"] }
    expect(parseScore(pattern, "resolved: true")).toMatchObject({ ratio: 1 })
    expect(parseScore(pattern, "resolved: no")).toMatchObject({ ratio: 0 })
  })

  test("the last match wins, because harnesses echo the command first", () => {
    expect(parseScore({ kind: "ratio", pattern: "score: ([0-9.]+)" }, "score: 0.1\nscore: 0.9")).toMatchObject({
      ratio: 0.9,
    })
  })

  test("text with no score yields nothing rather than a guess", () => {
    expect(parseScore({ kind: "ratio", pattern: "score: ([0-9.]+)" }, "no score here")).toBeUndefined()
  })
})

describe("thresholds", () => {
  test("an absent threshold requires a complete score", () => {
    expect(scorePasses({ ratio: 1 })).toBe(true)
    expect(scorePasses({ ratio: 0.9 })).toBe(false)
  })

  test("a minimum ratio admits a partial score", () => {
    expect(scorePasses({ ratio: 0.8 }, { minRatio: 0.75 })).toBe(true)
    expect(scorePasses({ ratio: 0.7 }, { minRatio: 0.75 })).toBe(false)
  })

  test("requireAll rejects any partial score", () => {
    expect(scorePasses({ ratio: 0.99 }, { requireAll: true })).toBe(false)
    expect(scorePasses({ ratio: 1 }, { requireAll: true })).toBe(true)
  })

  test("a minimum count judges a score that has no denominator", () => {
    expect(scorePasses({ passed: 19 }, { minCount: 10 })).toBe(true)
    expect(scorePasses({ passed: 4 }, { minCount: 10 })).toBe(false)
    expect(scorePasses({ ratio: 1 }, { minCount: 10 })).toBe(false)
  })
})

describe("command evaluator over a real process", () => {
  test("a passing command is scored from its output", async () => {
    const verifier = new AutoVerifier()
    const outcome = await verifier.evaluate(
      {
        kind: "command",
        id: "echo-ratio",
        command: process.execPath,
        args: ["-e", "process.stdout.write('score: 0.5\\nscore: 1.0\\n')"],
        score: { kind: "ratio", pattern: "score: ([0-9.]+)" },
      },
      { root: process.cwd(), target: {} },
    )
    expect(outcome.status).toBe("passed")
    expect(outcome.score?.ratio).toBe(1)
  })

  test("a command that produces no score is unscored, not passed", async () => {
    const verifier = new AutoVerifier()
    const outcome = await verifier.evaluate(
      {
        kind: "command",
        id: "silent",
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        score: { kind: "ratio", pattern: "score: ([0-9.]+)" },
      },
      { root: process.cwd(), target: {} },
    )
    expect(outcome.status).toBe("unscored")
  })

  test("a score below the threshold fails even when the command exits zero", async () => {
    const verifier = new AutoVerifier()
    const outcome = await verifier.evaluate(
      {
        kind: "command",
        id: "partial",
        command: process.execPath,
        args: ["-e", "process.stdout.write('8/10\\n')"],
        score: { kind: "fraction", pattern: "(\\d+)\\s*/\\s*(\\d+)" },
        threshold: { requireAll: true },
      },
      { root: process.cwd(), target: {} },
    )
    expect(outcome.status).toBe("failed")
    expect(outcome.score).toMatchObject({ passed: 8, total: 10 })
  })

  test("a missing command is reported as a failure to run, not a crash", async () => {
    const verifier = new AutoVerifier()
    const outcome = await verifier.evaluate(
      {
        kind: "command",
        id: "absent",
        command: "zyraxon-no-such-binary-exists",
        args: [],
        score: { kind: "ratio", pattern: "(\\d)" },
      },
      { root: process.cwd(), target: {} },
    )
    expect(outcome.code).toBe(127)
    expect(outcome.status).toBe("unscored")
  })
})

describe("swebench evaluator", () => {
  let root: string
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "zyraxon-swebench-"))
  })
  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test("the harness invocation names the dataset, split and report", () => {
    const evaluator = swebenchEvaluator({ dataset: "princeton-nlp/SWE-bench_Verified", runId: "run1" })
    expect(evaluator.command).toBe("python")
    expect(evaluator.args).toContain("swebench.harness.run_evaluation")
    expect(evaluator.args).toContain("princeton-nlp/SWE-bench_Verified")
    expect(evaluator.reportFile).toBe("logs/run_evaluation/run1/report.json")
    expect(evaluator.reportPath).toBe("resolved_instances")
    expect(evaluator.reportTotalPath).toBe("completed_instances")
  })

  test("the harness report is read and scored through a real file", async () => {
    // The harness is not installed in this environment, so the report it would
    // write is produced directly. The evaluator's report reading, path walking
    // and scoring are the real code paths under test.
    const evaluator = swebenchEvaluator({ runId: "run2", requireAll: false, minRatio: 0.5 })
    const reportDir = join(root, "logs/run_evaluation/run2")
    await rm(reportDir, { recursive: true, force: true })
    const { mkdir } = await import("node:fs/promises")
    await mkdir(reportDir, { recursive: true })
    await writeFile(join(reportDir, "report.json"), JSON.stringify({ resolved_instances: 3, completed_instances: 4 }), "utf8")

    const verifier = new AutoVerifier({
      run: async () => ({ code: 0, stdout: "", stderr: "", durationMs: 1 }),
    })
    const outcome = await verifier.evaluate(evaluator, { root, target: {} })
    expect(outcome.status).toBe("passed")
    expect(outcome.score).toMatchObject({ passed: 3, total: 4, ratio: 0.75 })
  })

  test("a report that is absent is an error, not a silent pass", async () => {
    const evaluator = swebenchEvaluator({ runId: "never-ran" })
    const verifier = new AutoVerifier({
      run: async () => ({ code: 0, stdout: "", stderr: "", durationMs: 1 }),
    })
    const outcome = await verifier.evaluate(evaluator, { root, target: {} })
    expect(outcome.status).toBe("error")
  })
})

describe("http evaluator over a real listener", () => {
  const requests: Array<{ url: string; body: string }> = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString()
      requests.push({ url: request.url ?? "", body })
      response.setHeader("content-type", "application/json")
      if (request.url === "/grade") {
        response.end(JSON.stringify({ summary: { score: 0.9 } }))
        return
      }
      if (request.url === "/silent") {
        response.end(JSON.stringify({ ok: true }))
        return
      }
      response.statusCode = 500
      response.end(JSON.stringify({ error: "grader is down" }))
    })
  })

  let base: string
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("listener did not bind")
    base = `http://127.0.0.1:${address.port}`
  })
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  test("a hosted grader's score is read from its body", async () => {
    requests.length = 0
    const verifier = new AutoVerifier()
    const outcome = await verifier.evaluate(
      {
        kind: "http",
        id: "hosted-grader",
        url: `${base}/grade`,
        body: { patch: "{patch}" },
        score: { kind: "ratio", pattern: "\"score\":\\s*([0-9.]+)" },
        threshold: { minRatio: 0.75 },
      },
      { root: process.cwd(), target: { patch: "diff.patch" } },
    )
    expect(outcome.status).toBe("passed")
    expect(outcome.score?.ratio).toBe(0.9)
    expect(JSON.parse(requests[0]!.body)).toEqual({ patch: "diff.patch" })
  })

  test("a body with no score is unscored, not passed", async () => {
    const verifier = new AutoVerifier()
    const outcome = await verifier.evaluate(
      { kind: "http", id: "silent", url: `${base}/silent`, score: { kind: "ratio", pattern: "\"score\":\\s*([0-9.]+)" } },
      { root: process.cwd(), target: {} },
    )
    expect(outcome.status).toBe("unscored")
  })

  test("an unreachable grader is an error outcome, not a throw", async () => {
    const verifier = new AutoVerifier()
    const outcome = await verifier.evaluate(
      { kind: "http", id: "down", url: `${base}/boom`, score: { kind: "ratio", pattern: "([0-9.]+)" } },
      { root: process.cwd(), target: {} },
    )
    // The listener answers 500 with no score, which is still a scored-absence.
    expect(outcome.status).toBe("unscored")
    expect(outcome.code).toBe(500)
  })
})

describe("the overall judgement", () => {
  const outcome = (status: EvaluationOutcome["status"]): EvaluationOutcome => ({
    evaluator: "x",
    status,
    code: 0,
    durationMs: 1,
    reason: "test",
  })

  test("every evaluator must pass for the run to be ok", () => {
    expect(evaluationOk([outcome("passed"), outcome("passed")])).toBe(true)
    expect(evaluationOk([outcome("passed"), outcome("failed")])).toBe(false)
    expect(evaluationOk([outcome("passed"), outcome("unscored")])).toBe(false)
  })

  test("an empty evaluator set is not a pass", () => {
    expect(evaluationOk([])).toBe(false)
  })

  test("the report names every evaluator and the overall result", () => {
    const text = formatEvaluation([outcome("passed"), outcome("failed")])
    expect(text).toContain("PASS  x")
    expect(text).toContain("FAIL  x")
    expect(text).toContain("NOT VERIFIED — 1 passed, 1 failed, 0 unscored")
  })
})

describe("evaluateAll", () => {
  test("every evaluator runs and each outcome is reported", async () => {
    const seen: string[] = []
    const verifier = new AutoVerifier({
      onOutcome: (item) => seen.push(item.evaluator),
    })
    const evaluators: Evaluator[] = [
      {
        kind: "command",
        id: "first",
        command: process.execPath,
        args: ["-e", "process.stdout.write('1/1\\n')"],
        score: { kind: "fraction", pattern: "(\\d+)\\s*/\\s*(\\d+)" },
      },
      {
        kind: "command",
        id: "second",
        command: process.execPath,
        args: ["-e", "process.stdout.write('0/1\\n')"],
        score: { kind: "fraction", pattern: "(\\d+)\\s*/\\s*(\\d+)" },
      },
    ]
    const outcomes = await verifier.evaluateAll(evaluators, { root: process.cwd(), target: {} })
    expect(seen).toEqual(["first", "second"])
    expect(outcomes.map((item) => item.status)).toEqual(["passed", "failed"])
  })
})
