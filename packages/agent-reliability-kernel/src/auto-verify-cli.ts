// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Run automatic verification for a project from a config file.
 *
 * This is the CLI an agent or a workflow calls after it has done the work. It
 * reads a list of evaluators — each one describes how to hand the work to some
 * external system and read a score back — runs them all, writes a JSON verdict,
 * and exits non-zero unless every evaluator passed. No person runs the suite and
 * no person reads the score; that is the point.
 *
 * Usage (from the repository root):
 *   node --import ./scripts/node-test/loader.mjs --experimental-transform-types \
 *     packages/agent-reliability-kernel/src/auto-verify-cli.ts --config zyraxon-verify.json
 *
 * Config shape:
 *   {
 *     "evaluators": [
 *       { "kind": "command", "id": "unit", "command": "npm", "args": ["test"],
 *         "score": { "kind": "fraction", "pattern": "(\\d+) passed" }, "threshold": { "minRatio": 1 } },
 *       { "kind": "http", "id": "grader", "url": "https://grader.example/score",
 *         "body": { "patch": "{patch}" }, "score": { "kind": "ratio", "pattern": "\"score\":\\s*([0-9.]+)" } }
 *     ]
 *   }
 *
 * A `swebench` entry is accepted as shorthand and expands to the harness command:
 *   { "kind": "swebench", "id": "swe", "dataset": "...", "minRatio": 0.9 }
 */

import { readFile, writeFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import {
  AutoVerifier,
  evaluationOk,
  formatEvaluation,
  swebenchEvaluator,
  type EvaluationContext,
  type EvaluationOutcome,
  type EvaluationTarget,
  type Evaluator,
} from "./auto-verify"

/** The `swebench` shorthand as it appears in the config file. */
interface SwebenchEntry {
  kind: "swebench"
  id?: string
  dataset?: string
  split?: string
  predictions?: string
  runId?: string
  reportDir?: string
  minRatio?: number
  requireAll?: boolean
  timeoutMs?: number
}

type ConfigEntry = Evaluator | SwebenchEntry

export interface VerifyConfig {
  evaluators: ConfigEntry[]
  target?: EvaluationTarget
}

/**
 * Parse a config file into evaluators.
 *
 * A malformed entry is an error rather than a skip: silently dropping an
 * evaluator would make a run with fewer checks look like a clean pass.
 */
export function parseConfig(raw: string): VerifyConfig {
  const parsed = JSON.parse(raw) as { evaluators?: unknown; target?: unknown }
  if (!Array.isArray(parsed.evaluators)) {
    throw new Error("config must have an `evaluators` array")
  }
  return {
    evaluators: parsed.evaluators as ConfigEntry[],
    target: (parsed.target ?? {}) as EvaluationTarget,
  }
}

export function toEvaluator(entry: ConfigEntry): Evaluator {
  if (entry.kind === "swebench") {
    const { kind: _kind, ...options } = entry
    return swebenchEvaluator(options)
  }
  return entry
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

export async function runCli(): Promise<number> {
  const configArg = argValue("--config") ?? "zyraxon-verify.json"
  const root = argValue("--root") ?? process.cwd()
  const outArg = argValue("--out") ?? "verify-evaluation.json"
  const configPath = isAbsolute(configArg) ? configArg : join(root, configArg)
  const out = isAbsolute(outArg) ? outArg : join(root, outArg)

  let config: VerifyConfig
  try {
    config = parseConfig(await readFile(configPath, "utf8"))
  } catch (error) {
    console.error(`[auto-verify] ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }

  if (config.evaluators.length === 0) {
    console.error(`[auto-verify] no evaluators in ${configPath}`)
    const outcomes: EvaluationOutcome[] = []
    await writeFile(out, `${JSON.stringify({ ok: false, outcomes }, null, 2)}\n`, "utf8")
    return 2
  }

  const context: EvaluationContext = { root, target: config.target ?? {} }
  console.log(`[auto-verify] root=${root} evaluators=${config.evaluators.map((entry) => entry.id).join(", ")}`)

  const verifier = new AutoVerifier({
    onOutcome: (outcome) => {
      console.log(`[auto-verify] ${outcome.status.toUpperCase()} ${outcome.evaluator}: ${outcome.reason}`)
    },
  })

  const outcomes = await verifier.evaluateAll(config.evaluators.map(toEvaluator), context)
  const ok = evaluationOk(outcomes)

  console.log("")
  console.log(formatEvaluation(outcomes))

  await writeFile(out, `${JSON.stringify({ ok, outcomes }, null, 2)}\n`, "utf8")
  console.log(`[auto-verify] wrote ${out}`)

  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) await writeFile(summaryPath, `${formatEvaluation(outcomes)}\n`, { flag: "a" })

  return ok ? 0 : 1
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("auto-verify-cli.ts")
if (invokedDirectly) {
  runCli().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`[auto-verify] ${error instanceof Error ? error.stack : String(error)}`)
      process.exit(2)
    },
  )
}
