// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Verification gates: many checks, one verdict.
 *
 * An agent that says "done" is not evidence. This module runs the checks that
 * can actually prove the work — a typecheck, a unit suite, a build — and reports
 * a verdict that a workflow can act on without a human reading the log.
 *
 * Two properties matter more than the rest, because they are what separate a
 * gate from a log line:
 *
 * - A gate passes only on positive evidence. Exit code zero is not enough on its
 *   own: the artifacts the gate claims to produce must exist, and the output must
 *   contain what success looks like. A command that exits zero without producing
 *   its artifact fails.
 * - A gate that did not run is never counted as passed. A check skipped because
 *   something it depends on failed is reported as skipped, and a verdict with any
 *   failure or skip is not `ok`.
 */

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
  durationMs: number
}

export interface CommandInput {
  command: string
  args: string[]
  cwd: string
  env?: Record<string, string>
  timeoutMs?: number
}

/** Runs one command. Injected so the gate logic is testable without a shell. */
export type CommandRunner = (input: CommandInput) => Promise<CommandResult>

/** Reports whether a path exists. Injected so artifact checks are testable. */
export type PathProbe = (path: string) => Promise<boolean>

/**
 * What must be true after the command ran, beyond its exit code.
 *
 * `artifacts` are paths relative to `cwd`. `mustContain` and `mustNotContain`
 * are substrings matched against the combined stdout and stderr.
 */
export interface GateEvidence {
  artifacts?: string[]
  mustContain?: string[]
  mustNotContain?: string[]
}

export interface Gate {
  id: string
  title: string
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  /** Ids of gates that must pass before this one runs. */
  needs?: string[]
  evidence?: GateEvidence
  timeoutMs?: number
}

export type GateStatus = "passed" | "failed" | "skipped"

export interface GateOutcome {
  id: string
  title: string
  status: GateStatus
  /** Process exit code. A skipped gate reports -1 because it never ran. */
  code: number
  durationMs: number
  reason: string
  artifactsChecked: string[]
  missingArtifacts: string[]
}

export interface Verdict {
  ok: boolean
  outcomes: GateOutcome[]
  passed: number
  failed: number
  skipped: number
  durationMs: number
}

export interface VerificationGateOptions {
  run: CommandRunner
  exists?: PathProbe
  /** Called as each gate finishes, so a long run can be followed live. */
  onOutcome?: (outcome: GateOutcome) => void
}

const defaultExists: PathProbe = async (path) => {
  const { access } = await import("node:fs/promises")
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Order gates so every gate runs after the gates it depends on. A cycle is a
 * configuration error and is reported rather than silently ordered, because a
 * silent order would make the verdict depend on input order.
 */
export function orderGates(gates: readonly Gate[]): Gate[] {
  const byId = new Map(gates.map((gate) => [gate.id, gate]))
  const ordered: Gate[] = []
  const state = new Map<string, "visiting" | "done">()

  const visit = (gate: Gate, chain: string[]) => {
    const seen = state.get(gate.id)
    if (seen === "done") return
    if (seen === "visiting") {
      throw new Error(`Gate dependency cycle: ${[...chain, gate.id].join(" -> ")}`)
    }
    state.set(gate.id, "visiting")
    for (const need of gate.needs ?? []) {
      const dependency = byId.get(need)
      if (!dependency) throw new Error(`Gate "${gate.id}" needs unknown gate "${need}"`)
      visit(dependency, [...chain, gate.id])
    }
    state.set(gate.id, "done")
    ordered.push(gate)
  }

  for (const gate of gates) visit(gate, [])
  return ordered
}

function checkEvidence(
  evidence: GateEvidence | undefined,
  cwd: string,
  output: string,
  exists: PathProbe,
): Promise<{ ok: true } | { ok: false; reason: string; checked: string[]; missing: string[] }> {
  if (!evidence) return Promise.resolve({ ok: true })
  return (async () => {
    const checked: string[] = []
    const missing: string[] = []
    for (const artifact of evidence.artifacts ?? []) {
      checked.push(artifact)
      const full = cwd.endsWith("/") ? `${cwd}${artifact}` : `${cwd}/${artifact}`
      if (!(await exists(full))) missing.push(artifact)
    }
    if (missing.length) {
      return { ok: false, reason: `missing artifact(s): ${missing.join(", ")}`, checked, missing }
    }
    for (const needle of evidence.mustContain ?? []) {
      if (!output.includes(needle)) {
        return { ok: false, reason: `output did not contain ${JSON.stringify(needle)}`, checked, missing }
      }
    }
    for (const needle of evidence.mustNotContain ?? []) {
      if (output.includes(needle)) {
        return { ok: false, reason: `output contained forbidden ${JSON.stringify(needle)}`, checked, missing }
      }
    }
    return { ok: true }
  })()
}

export class VerificationGate {
  private readonly run: CommandRunner
  private readonly exists: PathProbe
  private readonly onOutcome: (outcome: GateOutcome) => void

  constructor(options: VerificationGateOptions) {
    this.run = options.run
    this.exists = options.exists ?? defaultExists
    this.onOutcome = options.onOutcome ?? (() => undefined)
  }

  async verify(gates: readonly Gate[], options: { root?: string } = {}): Promise<Verdict> {
    const root = options.root ?? process.cwd()
    const ordered = orderGates(gates)
    const status = new Map<string, GateStatus>()
    const outcomes: GateOutcome[] = []
    const startedAt = Date.now()

    for (const gate of ordered) {
      const cwd = gate.cwd ? `${root}/${gate.cwd}`.replace(/\/+/g, "/") : root

      const blockedBy = (gate.needs ?? []).find((need) => status.get(need) !== "passed")
      if (blockedBy) {
        const outcome: GateOutcome = {
          id: gate.id,
          title: gate.title,
          status: "skipped",
          code: -1,
          durationMs: 0,
          reason: `skipped: dependency "${blockedBy}" did not pass`,
          artifactsChecked: gate.evidence?.artifacts ?? [],
          missingArtifacts: [],
        }
        status.set(gate.id, "skipped")
        outcomes.push(outcome)
        this.onOutcome(outcome)
        continue
      }

      // A runner may throw instead of returning a code — a missing binary is the
      // usual cause. That is a failure of this gate, not of the whole run: the
      // verdict has to stay readable and name the gate that could not run.
      let result: CommandResult
      try {
        result = await this.run({
          command: gate.command,
          args: gate.args,
          cwd,
          env: gate.env,
          timeoutMs: gate.timeoutMs,
        })
      } catch (error) {
        result = {
          code: 127,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        }
      }
      const output = `${result.stdout}\n${result.stderr}`

      let outcome: GateOutcome
      if (result.code !== 0) {
        outcome = {
          id: gate.id,
          title: gate.title,
          status: "failed",
          code: result.code,
          durationMs: result.durationMs,
          reason: `exited with code ${result.code}`,
          artifactsChecked: gate.evidence?.artifacts ?? [],
          missingArtifacts: [],
        }
      } else {
        const evidence = await checkEvidence(gate.evidence, cwd, output, this.exists)
        outcome = evidence.ok
          ? {
              id: gate.id,
              title: gate.title,
              status: "passed",
              code: 0,
              durationMs: result.durationMs,
              reason: "exit 0 and all evidence present",
              artifactsChecked: gate.evidence?.artifacts ?? [],
              missingArtifacts: [],
            }
          : {
              id: gate.id,
              title: gate.title,
              status: "failed",
              code: result.code,
              durationMs: result.durationMs,
              reason: `exit 0 but ${evidence.reason}`,
              artifactsChecked: evidence.checked,
              missingArtifacts: evidence.missing,
            }
      }

      status.set(gate.id, outcome.status)
      outcomes.push(outcome)
      this.onOutcome(outcome)
    }

    const passed = outcomes.filter((outcome) => outcome.status === "passed").length
    const failed = outcomes.filter((outcome) => outcome.status === "failed").length
    const skipped = outcomes.filter((outcome) => outcome.status === "skipped").length

    return {
      ok: failed === 0 && skipped === 0 && passed === ordered.length,
      outcomes,
      passed,
      failed,
      skipped,
      durationMs: Date.now() - startedAt,
    }
  }
}

/** A short, plain-text report. This is what a human reads when a gate fails. */
export function formatVerdict(verdict: Verdict): string {
  const mark = { passed: "PASS", failed: "FAIL", skipped: "SKIP" } as const
  const lines = verdict.outcomes.map((outcome) => {
    const seconds = (outcome.durationMs / 1000).toFixed(1)
    return `${mark[outcome.status]}  ${outcome.id}  (${seconds}s)  ${outcome.reason}`
  })
  lines.push("")
  lines.push(
    `${verdict.ok ? "VERIFIED" : "NOT VERIFIED"} — ${verdict.passed} passed, ${verdict.failed} failed, ${verdict.skipped} skipped`,
  )
  return lines.join("\n")
}

/** A GitHub Actions job summary. Written to `$GITHUB_STEP_SUMMARY` by the CLI. */
export function formatVerdictMarkdown(verdict: Verdict): string {
  const icon = { passed: "✅", failed: "❌", skipped: "⏭️" } as const
  const rows = verdict.outcomes.map(
    (outcome) =>
      `| ${icon[outcome.status]} | \`${outcome.id}\` | ${outcome.title} | ${(outcome.durationMs / 1000).toFixed(1)}s | ${outcome.reason} |`,
  )
  const heading = verdict.ok
    ? "## ✅ Verification passed"
    : "## ❌ Verification failed"
  return [
    heading,
    "",
    `${verdict.passed} passed · ${verdict.failed} failed · ${verdict.skipped} skipped · ${(verdict.durationMs / 1000).toFixed(1)}s total`,
    "",
    "| | gate | what it proves | time | result |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    verdict.ok
      ? "Every gate ran and every gate produced its evidence."
      : "This branch is not verified. Do not treat the work as done until every gate passes.",
  ].join("\n")
}
