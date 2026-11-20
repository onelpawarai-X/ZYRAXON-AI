// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Automatic verification against an external system.
 *
 * The problem this solves: an agent can do the work, but proving the work is
 * correct usually means a person opening a terminal, running a suite, and
 * reading a score. That is the step that does not scale, and it is the step
 * SWE-bench removes — the agent's patch is applied and scored by the harness
 * itself, with nobody in the loop.
 *
 * This module is the provider-agnostic version of that idea. An `Evaluator`
 * describes how to hand the work to *some* system and read a score back. Three
 * shapes cover almost every system in practice:
 *
 * - `command` — run a program (a test suite, a harness, `swebench.harness`), and
 *   read the score from its exit code, its output, or a JSON file it wrote.
 * - `http` — POST the work to a service (a CI API, a hosted grader), and read the
 *   score from the response body.
 * - `swebench` — the SWE-bench harness specifically, which is only a `command`
 *   evaluator with the pieces filled in.
 *
 * Nothing here trusts an exit code alone. A run is only accepted as scored when
 * the evaluator actually produced a score; an exit code with no score is
 * reported as `unscored`, which is deliberately not the same as passing.
 */

import { readFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import type { CommandInput, CommandResult } from "./verification-gate"
import { DEFAULT_TIMEOUT_MS, spawnRunner } from "./runner"

/** Which project the work belongs to, so the evaluator can select its inputs. */
export interface EvaluationTarget {
  /** Path to the repository under test, relative to the evaluator's `root`. */
  repo?: string
  /** Path to the candidate work — a patch, a diff, a directory. */
  patch?: string
  /** Commit the work was based on, when the system needs a base. */
  baseCommit?: string
  /** Opaque identifiers a specific system asks for (a task id, a suite name). */
  [key: string]: string | undefined
}

/** A score read back from the system that ran the evaluation. */
export interface EvaluationScore {
  /** Fraction in [0, 1] when the system reports one. */
  ratio?: number
  /** Raw count of checks that passed, when the system reports one. */
  passed?: number
  /** Raw count of checks that ran, when the system reports one. */
  total?: number
  /** The system's own label, when it has one ("resolved", "1/1", "88.4%"). */
  label?: string
}

export type EvaluationStatus = "passed" | "failed" | "unscored" | "error"

export interface EvaluationOutcome {
  evaluator: string
  status: EvaluationStatus
  score?: EvaluationScore
  /** Exit code of the command, or HTTP status for an `http` evaluator. */
  code: number
  durationMs: number
  reason: string
  stdout?: string
  stderr?: string
}

/**
 * How to read a score out of one line of text.
 *
 * A regular expression with exactly one capture group is the whole contract.
 * `ratio` captures a fraction, `fraction` captures `passed/total`, `percent`
 * captures a percentage, `count` captures a raw number of passing checks, and
 * `boolean` captures a pass/fail token. Keeping this
 * declarative means a new system is a data change, not a code change.
 */
export type ScorePattern =
  | { kind: "ratio"; pattern: string }
  | { kind: "fraction"; pattern: string }
  | { kind: "percent"; pattern: string }
  | { kind: "count"; pattern: string }
  | { kind: "boolean"; pattern: string; pass: string[]; fail: string[] }

/** A threshold below which the evaluation counts as failed. */
export interface ScoreThreshold {
  /** Minimum ratio in [0, 1]. A score below this fails. */
  minRatio?: number
  /** Minimum count. A count below this fails. */
  minCount?: number
  /** When set, any failing check fails the run even if the ratio clears. */
  requireAll?: boolean
}

export interface CommandEvaluator {
  kind: "command"
  id: string
  title?: string
  /** Command and arguments. `{patch}`, `{repo}`, `{baseCommit}` are substituted. */
  command: string
  args?: string[]
  /** Working directory, relative to the run root unless absolute. */
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  /** Where the system writes its score, relative to `cwd`. Read when present. */
  reportFile?: string
  /** Dotted path into the report file's JSON, e.g. `summary.resolved`. */
  reportPath?: string
  /**
   * Dotted path to the denominator when the system reports a numerator and a
   * total separately (`resolved_instances` and `completed_instances`). When set,
   * the two are combined into `numerator/denominator` before scoring.
   */
  reportTotalPath?: string
  /** How to read the report value, or how to read the output when no file. */
  score: ScorePattern
  threshold?: ScoreThreshold
}

export interface HttpEvaluator {
  kind: "http"
  id: string
  title?: string
  url: string
  method?: "POST" | "PUT"
  headers?: Record<string, string>
  /** Body fields, sent as JSON. `{patch}` etc. are substituted in string values. */
  body?: Record<string, string>
  timeoutMs?: number
  score: ScorePattern
  threshold?: ScoreThreshold
}

export type Evaluator = CommandEvaluator | HttpEvaluator

/** The environment a command evaluator needs to substitute its placeholders. */
export interface EvaluationContext {
  root: string
  target: EvaluationTarget
}

export type CommandExecutor = (input: CommandInput) => Promise<CommandResult>
export type HttpExecutor = (request: {
  url: string
  method: string
  headers: Record<string, string>
  body: string
  timeoutMs: number
}) => Promise<{ status: number; body: string }>

export interface EvaluationOptions {
  run?: CommandExecutor
  request?: HttpExecutor
  onOutcome?: (outcome: EvaluationOutcome) => void
}

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g

/**
 * Substitute `{name}` placeholders from the target.
 *
 * A placeholder with no value is left as-is rather than replaced with an empty
 * string: a harness invoked with a blank task id fails confusingly, and the
 * literal `{taskId}` in the error makes the missing input obvious.
 */
export function substitute(input: string, target: EvaluationTarget): string {
  return input.replace(PLACEHOLDER, (whole, name: string) => target[name] ?? whole)
}

function resolveCwd(context: EvaluationContext, cwd?: string): string {
  if (!cwd) return context.root
  return isAbsolute(cwd) ? cwd : join(context.root, cwd)
}

/** Read a dotted path out of parsed JSON: `summary.resolved`, `data.0.score`. */
export function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current)) return current[Number(key)]
    if (typeof current === "object") return (current as Record<string, unknown>)[key]
    return undefined
  }, value)
}

/**
 * Turn one captured string into a score using a declarative pattern.
 *
 * The pattern is a regular expression with a single capture group. Matching is
 * done against the last match in the text, because harnesses often echo the
 * command and then print the result; the result is the line that matters.
 */
export function parseScore(pattern: ScorePattern, text: string): EvaluationScore | undefined {
  const match = lastMatch(pattern.pattern, text)
  if (!match) return undefined
  const captured = match[1]?.trim()
  if (captured === undefined) return undefined

  switch (pattern.kind) {
    case "ratio": {
      const ratio = Number(captured)
      if (!Number.isFinite(ratio)) return undefined
      return { ratio, label: captured }
    }
    case "fraction": {
      // A fraction is written `passed/total`, so the numerator and denominator
      // are the whole match — the pattern's own capture groups are for locating
      // it, not for reading it.
      const parts = match[0].split("/")
      if (parts.length !== 2) return undefined
      const passed = Number(parts[0]?.trim())
      const total = Number(parts[1]?.trim())
      if (!Number.isFinite(passed) || !Number.isFinite(total) || total <= 0) return undefined
      return { passed, total, ratio: passed / total, label: match[0].trim() }
    }
    case "percent": {
      const percent = Number(captured.replace("%", ""))
      if (!Number.isFinite(percent)) return undefined
      return { ratio: percent / 100, label: captured }
    }
    case "count": {
      // A raw count has no denominator, so it cannot become a ratio. It is kept
      // as a count and judged by `minCount`; inventing a ratio here would make an
      // unknown total look like a complete pass.
      const count = Number(captured)
      if (!Number.isFinite(count)) return undefined
      return { passed: count, label: captured }
    }
    case "boolean": {
      const token = captured.toLowerCase()
      if (pattern.pass.some((value) => value.toLowerCase() === token)) return { ratio: 1, label: captured }
      if (pattern.fail.some((value) => value.toLowerCase() === token)) return { ratio: 0, label: captured }
      return undefined
    }
  }
}

function lastMatch(pattern: string, text: string): RegExpExecArray | null {
  const regex = new RegExp(pattern, "gm")
  let match: RegExpExecArray | null = null
  let found: RegExpExecArray | null = null
  while ((match = regex.exec(text)) !== null) {
    found = match
    if (match.index === regex.lastIndex) regex.lastIndex += 1
  }
  return found
}

/**
 * Decide whether a score clears its threshold.
 *
 * An absent threshold means "any score that was produced passes", which is the
 * honest default: the evaluator's own pass/fail is the judgement, and this
 * system only reports it.
 */
export function scorePasses(score: EvaluationScore, threshold?: ScoreThreshold): boolean {
  if (!threshold) {
    if (score.ratio !== undefined) return score.ratio >= 1
    return false
  }
  if (threshold.minCount !== undefined) {
    if (score.passed === undefined) return false
    return score.passed >= threshold.minCount
  }
  if (threshold.requireAll && score.ratio !== undefined && score.ratio < 1) return false
  if (threshold.minRatio !== undefined) {
    if (score.ratio === undefined) return false
    return score.ratio >= threshold.minRatio
  }
  return score.ratio !== undefined ? score.ratio >= 1 : false
}

async function readReport(file: string, path?: string): Promise<unknown> {
  const raw = await readFile(file, "utf8")
  const parsed: unknown = JSON.parse(raw)
  return path ? readPath(parsed, path) : parsed
}

/** The text a report value should be scored from, whether number or string. */
function reportText(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

export class AutoVerifier {
  private readonly run: CommandExecutor
  private readonly request: HttpExecutor
  private readonly onOutcome: (outcome: EvaluationOutcome) => void

  constructor(options: EvaluationOptions = {}) {
    this.run = options.run ?? spawnRunner
    this.request = options.request ?? defaultRequest
    this.onOutcome = options.onOutcome ?? (() => undefined)
  }

  async evaluate(evaluator: Evaluator, context: EvaluationContext): Promise<EvaluationOutcome> {
    const outcome = evaluator.kind === "command"
      ? await this.evaluateCommand(evaluator, context)
      : await this.evaluateHttp(evaluator, context)
    this.onOutcome(outcome)
    return outcome
  }

  async evaluateAll(evaluators: readonly Evaluator[], context: EvaluationContext): Promise<EvaluationOutcome[]> {
    const outcomes: EvaluationOutcome[] = []
    for (const evaluator of evaluators) outcomes.push(await this.evaluate(evaluator, context))
    return outcomes
  }

  private async evaluateCommand(evaluator: CommandEvaluator, context: EvaluationContext): Promise<EvaluationOutcome> {
    const cwd = resolveCwd(context, evaluator.cwd)
    const args = (evaluator.args ?? []).map((arg) => substitute(arg, context.target))
    const result = await this.run({
      command: evaluator.command,
      args,
      cwd,
      env: evaluator.env,
      timeoutMs: evaluator.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    })

    const base = {
      evaluator: evaluator.id,
      code: result.code,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
    }

    let score: EvaluationScore | undefined
    if (evaluator.reportFile) {
      const reportPath = isAbsolute(evaluator.reportFile) ? evaluator.reportFile : join(cwd, evaluator.reportFile)
      try {
        const report: unknown = await readReport(reportPath, evaluator.reportPath)
        const text = evaluator.reportTotalPath
          ? `${reportText(report)}/${reportText(await readReport(reportPath, evaluator.reportTotalPath))}`
          : reportText(report)
        score = parseScore(evaluator.score, text)
      } catch (error) {
        // A missing or malformed report is not a failure of the work; it is a
        // failure to score it. Saying so is the whole point of `unscored`.
        return {
          ...base,
          status: "error",
          reason: `report ${reportPath} could not be read: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    } else {
      score = parseScore(evaluator.score, `${result.stdout}\n${result.stderr}`)
    }

    if (!score) {
      return {
        ...base,
        status: "unscored",
        reason: `exited ${result.code} but produced no score`,
      }
    }
    const passed = scorePasses(score, evaluator.threshold)
    return {
      ...base,
      status: passed ? "passed" : "failed",
      score,
      reason: passed
        ? `scored ${score.label ?? score.ratio} and cleared the threshold`
        : `scored ${score.label ?? score.ratio} below the threshold`,
    }
  }

  private async evaluateHttp(evaluator: HttpEvaluator, context: EvaluationContext): Promise<EvaluationOutcome> {
    const startedAt = Date.now()
    const body: Record<string, string> = {}
    for (const [key, value] of Object.entries(evaluator.body ?? {})) body[key] = substitute(value, context.target)

    let response: { status: number; body: string }
    try {
      response = await this.request({
        url: evaluator.url,
        method: evaluator.method ?? "POST",
        headers: { "content-type": "application/json", ...evaluator.headers },
        body: JSON.stringify(body),
        timeoutMs: evaluator.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      })
    } catch (error) {
      return {
        evaluator: evaluator.id,
        status: "error",
        code: 0,
        durationMs: Date.now() - startedAt,
        reason: `request to ${evaluator.url} failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    const base = { evaluator: evaluator.id, code: response.status, durationMs: Date.now() - startedAt }
    const score = parseScore(evaluator.score, response.body)
    if (!score) {
      return { ...base, status: "unscored", reason: `HTTP ${response.status} but the body carried no score` }
    }
    const passed = scorePasses(score, evaluator.threshold)
    return {
      ...base,
      status: passed ? "passed" : "failed",
      score,
      reason: passed
        ? `scored ${score.label ?? score.ratio} and cleared the threshold`
        : `scored ${score.label ?? score.ratio} below the threshold`,
    }
  }
}

async function defaultRequest(request: {
  url: string
  method: string
  headers: Record<string, string>
  body: string
  timeoutMs: number
}): Promise<{ status: number; body: string }> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(request.timeoutMs),
  })
  return { status: response.status, body: await response.text() }
}

/**
 * The SWE-bench evaluator.
 *
 * SWE-bench already does the thing this module is about: it applies a candidate
 * patch inside a per-instance container and runs the instance's tests, then
 * reports how many instances resolved. So this is not a reimplementation — it is
 * the harness invocation and the score shape, named once so a caller does not
 * have to rediscover that the harness writes `report.json`.
 *
 * The default reads `resolved` out of the harness report. `requireAll` is the
 * default threshold because a SWE-bench run is normally judged on whether every
 * instance resolved; a caller scoring a partial sweep sets `minRatio` instead.
 */
export function swebenchEvaluator(input: {
  id?: string
  dataset?: string
  split?: string
  predictions?: string
  runId?: string
  reportDir?: string
  minRatio?: number
  requireAll?: boolean
  timeoutMs?: number
} = {}): CommandEvaluator {
  const dataset = input.dataset ?? "princeton-nlp/SWE-bench_Verified"
  const split = input.split ?? "test"
  const predictions = input.predictions ?? "predictions.jsonl"
  const runId = input.runId ?? "zyraxon"
  const reportDir = input.reportDir ?? "logs/run_evaluation"

  return {
    kind: "command",
    id: input.id ?? "swebench",
    title: "SWE-bench resolves the candidate patch",
    command: "python",
    args: [
      "-m",
      "swebench.harness.run_evaluation",
      "--dataset_name",
      dataset,
      "--split",
      split,
      "--predictions_path",
      predictions,
      "--run_id",
      runId,
      "--report_dir",
      reportDir,
    ],
    reportFile: `${reportDir}/${runId}/report.json`,
    reportPath: "resolved_instances",
    reportTotalPath: "completed_instances",
    // The harness writes `resolved_instances` and `completed_instances` as two
    // counts; this system joins them into the `resolved/completed` fraction.
    score: { kind: "fraction", pattern: "(\\d+)\\s*/\\s*(\\d+)" },
    threshold: { requireAll: input.requireAll ?? true, minRatio: input.minRatio },
    timeoutMs: input.timeoutMs,
  }
}

/** One line per evaluator, then the overall judgement. */
export function formatEvaluation(outcomes: readonly EvaluationOutcome[]): string {
  const mark: Record<EvaluationStatus, string> = {
    passed: "PASS",
    failed: "FAIL",
    unscored: "NONE",
    error: "ERR ",
  }
  const lines = outcomes.map((outcome) => {
    const seconds = (outcome.durationMs / 1000).toFixed(1)
    return `${mark[outcome.status]}  ${outcome.evaluator}  (${seconds}s)  ${outcome.reason}`
  })
  const passed = outcomes.filter((outcome) => outcome.status === "passed").length
  const failed = outcomes.filter((outcome) => outcome.status === "failed").length
  const unscored = outcomes.filter((outcome) => outcome.status === "unscored" || outcome.status === "error").length
  const ok = outcomes.length > 0 && failed === 0 && unscored === 0 && passed === outcomes.length
  lines.push("")
  lines.push(`${ok ? "VERIFIED" : "NOT VERIFIED"} — ${passed} passed, ${failed} failed, ${unscored} unscored`)
  return lines.join("\n")
}

/** A verdict is `ok` only when every evaluator produced a passing score. */
export function evaluationOk(outcomes: readonly EvaluationOutcome[]): boolean {
  return outcomes.length > 0 && outcomes.every((outcome) => outcome.status === "passed")
}
