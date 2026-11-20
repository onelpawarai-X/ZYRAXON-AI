// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import {
  formatVerdict,
  orderGates,
  VerificationGate,
  type CommandInput,
  type CommandResult,
  type Gate,
} from "../src/index"
import { gatesForProfile } from "../src/verify-cli"

const ok = (stdout = ""): CommandResult => ({ code: 0, stdout, stderr: "", durationMs: 1 })

/** A runner that answers per command, so a test states what each gate returns. */
function runnerFor(answers: Record<string, CommandResult | Error>) {
  const seen: string[] = []
  const run = async (input: CommandInput): Promise<CommandResult> => {
    seen.push(input.args.join(" "))
    const answer = answers[input.args.join(" ")]
    if (answer === undefined) throw new Error(`unexpected command: ${input.args.join(" ")}`)
    if (answer instanceof Error) throw answer
    return answer
  }
  return { run, seen }
}

const gate = (over: Partial<Gate> & Pick<Gate, "id">): Gate => ({
  title: over.id,
  command: "bun",
  args: [over.id],
  ...over,
})

describe("VerificationGate", () => {
  test("reports ok only when every gate ran and passed", async () => {
    const { run } = runnerFor({ a: ok(), b: ok() })
    const verdict = await new VerificationGate({ run }).verify([gate({ id: "a" }), gate({ id: "b" })])
    expect(verdict.ok).toBe(true)
    expect(verdict.passed).toBe(2)
    expect(verdict.failed).toBe(0)
    expect(verdict.skipped).toBe(0)
  })

  test("a non-zero exit fails the gate and the verdict", async () => {
    const { run } = runnerFor({ a: { code: 2, stdout: "", stderr: "boom", durationMs: 1 } })
    const verdict = await new VerificationGate({ run }).verify([gate({ id: "a" })])
    expect(verdict.ok).toBe(false)
    expect(verdict.outcomes[0]?.status).toBe("failed")
    expect(verdict.outcomes[0]?.reason).toContain("code 2")
  })

  test("exit 0 without its artifact is a failure, not a pass", async () => {
    // This is the whole point of the gate: a build that claims success but
    // wrote nothing must not be reported as verified.
    const { run } = runnerFor({ build: ok("build complete") })
    const verdict = await new VerificationGate({
      run,
      exists: async () => false,
    }).verify([gate({ id: "build", evidence: { artifacts: ["dist/app.js"] } })])
    expect(verdict.ok).toBe(false)
    expect(verdict.outcomes[0]?.status).toBe("failed")
    expect(verdict.outcomes[0]?.missingArtifacts).toEqual(["dist/app.js"])
    expect(verdict.outcomes[0]?.reason).toContain("missing artifact")
  })

  test("exit 0 with its artifact present passes", async () => {
    const { run } = runnerFor({ build: ok() })
    const verdict = await new VerificationGate({
      run,
      exists: async () => true,
    }).verify([gate({ id: "build", evidence: { artifacts: ["dist/app.js"] } })])
    expect(verdict.ok).toBe(true)
    expect(verdict.outcomes[0]?.artifactsChecked).toEqual(["dist/app.js"])
  })

  test("a forbidden string in the output fails an otherwise clean gate", async () => {
    const { run } = runnerFor({ typecheck: ok("error TS2554: expected 1 argument") })
    const verdict = await new VerificationGate({ run }).verify([
      gate({ id: "typecheck", evidence: { mustNotContain: ["error TS"] } }),
    ])
    expect(verdict.ok).toBe(false)
    expect(verdict.outcomes[0]?.reason).toContain("forbidden")
  })

  test("a required string that is absent fails the gate", async () => {
    const { run } = runnerFor({ containers: ok("nothing happened") })
    const verdict = await new VerificationGate({ run }).verify([
      gate({ id: "containers", evidence: { mustContain: ["docker build -f"] } }),
    ])
    expect(verdict.ok).toBe(false)
    expect(verdict.outcomes[0]?.reason).toContain("did not contain")
  })

  test("a gate whose dependency failed is skipped, and a skip is not ok", async () => {
    const { run, seen } = runnerFor({
      typecheck: { code: 1, stdout: "", stderr: "type error", durationMs: 1 },
    })
    const verdict = await new VerificationGate({ run }).verify([
      gate({ id: "typecheck" }),
      gate({ id: "build", needs: ["typecheck"] }),
    ])
    expect(verdict.ok).toBe(false)
    expect(verdict.failed).toBe(1)
    expect(verdict.skipped).toBe(1)
    expect(verdict.outcomes[1]?.status).toBe("skipped")
    expect(verdict.outcomes[1]?.reason).toContain('dependency "typecheck"')
    // The dependent gate must not have run at all.
    expect(seen).toEqual(["typecheck"])
  })

  test("a runner that throws is reported as a missing tool, not a crash", async () => {
    const { run } = runnerFor({ lint: new Error("spawn bun ENOENT") })
    const verdict = await new VerificationGate({ run }).verify([gate({ id: "lint" })])
    expect(verdict.ok).toBe(false)
    expect(verdict.outcomes[0]?.status).toBe("failed")
  })

  test("each outcome is streamed to the caller as it finishes", async () => {
    const { run } = runnerFor({ a: ok(), b: ok() })
    const seen: string[] = []
    await new VerificationGate({ run, onOutcome: (outcome) => seen.push(outcome.id) }).verify([
      gate({ id: "a" }),
      gate({ id: "b" }),
    ])
    expect(seen).toEqual(["a", "b"])
  })

  test("gates run in dependency order regardless of input order", async () => {
    const { run, seen } = runnerFor({ dep: ok(), main: ok() })
    await new VerificationGate({ run }).verify([gate({ id: "main", needs: ["dep"] }), gate({ id: "dep" })])
    expect(seen).toEqual(["dep", "main"])
  })

  test("the report never says verified when a gate did not pass", async () => {
    const { run } = runnerFor({ a: { code: 1, stdout: "", stderr: "", durationMs: 1 } })
    const verdict = await new VerificationGate({ run }).verify([gate({ id: "a" })])
    const text = formatVerdict(verdict)
    const summary = text.trim().split("\n").at(-1) ?? ""
    expect(summary).toContain("NOT VERIFIED")
    expect(summary.startsWith("VERIFIED")).toBe(false)
  })
})

describe("orderGates", () => {
  test("a dependency cycle is refused instead of silently ordered", () => {
    expect(() => orderGates([gate({ id: "a", needs: ["b"] }), gate({ id: "b", needs: ["a"] })])).toThrow(/cycle/i)
  })

  test("an unknown dependency is refused", () => {
    expect(() => orderGates([gate({ id: "a", needs: ["ghost"] })])).toThrow(/unknown gate/i)
  })
})

describe("verify-cli profiles", () => {
  test("the quick profile proves the code typechecks and its tests pass", () => {
    expect(gatesForProfile("quick").map((item) => item.id)).toEqual(["typecheck", "unit"])
  })

  test("the full profile also proves the build produced its artifacts", () => {
    const build = gatesForProfile("full").find((item) => item.id === "build")
    expect(build?.evidence?.artifacts).toContain("packages/zyraxon/dist/node/node.js")
    expect(build?.needs).toContain("typecheck")
  })

  test("an unknown profile is refused with the known names", () => {
    expect(() => gatesForProfile("nonsense")).toThrow(/Unknown profile/)
  })
})
