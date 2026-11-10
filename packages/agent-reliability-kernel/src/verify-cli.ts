// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Run this repository's verification gates and print one verdict.
 *
 * The point is that an agent's branch does not need a person to look at it. This
 * runs the same checks a release would run — typecheck, the unit suites, the real
 * build — and writes a machine-readable verdict the workflow reads to decide
 * whether the branch is verified.
 *
 * Profiles keep the cost honest: `quick` proves the code still typechecks and its
 * tests still pass, `full` additionally proves the build still produces the
 * artifacts the release expects, and `containers` proves the Docker images still
 * build.
 *
 * Usage (from the repository root):
 *   node --import ./scripts/node-test/loader.mjs --experimental-transform-types \
 *     packages/agent-reliability-kernel/src/verify-cli.ts --profile quick
 */

import { readFile, writeFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import {
  formatVerdict,
  formatVerdictMarkdown,
  VerificationGate,
  type Gate,
  type Verdict,
} from "./verification-gate"
import { spawnRunner } from "./runner"

/**
 * The gates, named so a profile can select them.
 *
 * Exit code is the primary signal for the tooling gates, because that is the
 * contract those tools publish. `mustNotContain` is a cheap second guard for the
 * case where a wrapper swallows a failure and exits zero anyway. The build gate
 * is held to a stronger standard: the artifacts themselves, since a build that
 * reports success without writing them is exactly the failure this system exists
 * to catch.
 */
const GATE_LIBRARY: Record<string, Gate> = {
  typecheck: {
    id: "typecheck",
    title: "Every package typechecks",
    command: "bun",
    args: ["run", "typecheck"],
    evidence: { mustNotContain: ["error TS"] },
  },
  unit: {
    id: "unit",
    title: "Every package unit suite passes",
    command: "bun",
    args: ["turbo", "test"],
    env: { GITHUB_ACTIONS: "false" },
    // Exit code only. A test may legitimately print a string like "error TS" as
    // part of what it asserts, so matching on the output here would fail a green
    // suite. The test runner's exit code is the contract that matters.
  },
  build: {
    id: "build",
    title: "The real build produces its artifacts",
    command: "bun",
    args: ["run", "zyraxon:build"],
    // Depend on both cheap gates so a failure there skips the multi-minute build
    // instead of spending it on a branch that already cannot pass.
    needs: ["typecheck", "unit"],
    evidence: {
      artifacts: [
        "packages/zyraxon/dist/node/node.js",
        "packages/app/dist/index.html",
        "packages/desktop/out/main/index.js",
        "packages/zyraxon/dist/zyraxon-linux-x64/bin/zyraxon",
      ],
    },
  },
  containers: {
    id: "containers",
    title: "The CI container images build",
    command: "bun",
    args: ["packages/containers/script/build.ts"],
    evidence: { mustContain: ["docker build -f"] },
  },
}

const PROFILES: Record<string, string[]> = {
  quick: ["typecheck", "unit"],
  full: ["typecheck", "unit", "build"],
  containers: ["typecheck", "unit", "containers"],
  all: ["typecheck", "unit", "build", "containers"],
}

export function gatesForProfile(profile: string): Gate[] {
  const ids = PROFILES[profile]
  if (!ids) {
    throw new Error(`Unknown profile "${profile}". Known: ${Object.keys(PROFILES).join(", ")}, auto`)
  }
  return ids.map((id) => {
    const gate = GATE_LIBRARY[id]
    if (!gate) throw new Error(`Profile "${profile}" names unknown gate "${id}"`)
    return gate
  })
}

/**
 * Build gates from the scripts a repository actually declares.
 *
 * The named profiles above are this repository's own gates. `auto` is for a
 * checkout that is not this repository: it reads `package.json` and gates on the
 * scripts that exist, so the same system verifies a different project without
 * inventing checks that project does not have. A script that is absent is not a
 * gate, and it is not counted as passed either.
 */
export async function gatesForAuto(root: string): Promise<Gate[]> {
  const manifestPath = join(root, "package.json")
  let scripts: Record<string, string> = {}
  try {
    const raw = await readFile(manifestPath, "utf8")
    scripts = (JSON.parse(raw).scripts ?? {}) as Record<string, string>
  } catch {
    return []
  }

  const gates: Gate[] = []
  if (scripts.typecheck) {
    gates.push({
      id: "typecheck",
      title: `The project's own typecheck passes`,
      command: "npm",
      args: ["run", "typecheck"],
    })
  }
  if (scripts.test) {
    gates.push({
      id: "unit",
      title: `The project's own test suite passes`,
      command: "npm",
      args: ["run", "test"],
      env: { CI: "true" },
    })
  }
  if (scripts.build) {
    gates.push({
      id: "build",
      title: `The project's own build succeeds`,
      command: "npm",
      args: ["run", "build"],
      needs: gates.map((gate) => gate.id),
    })
  }
  return gates
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

export async function runCli(): Promise<number> {
  const profile = argValue("--profile") ?? "quick"
  const outArg = argValue("--out") ?? "verify-verdict.json"
  const root = argValue("--root") ?? process.cwd()
  // A relative `--out` is relative to the verified root; an absolute one is
  // taken as given, so a caller can place the verdict outside the verified tree.
  const out = isAbsolute(outArg) ? outArg : join(root, outArg)

  let gates: Gate[]
  try {
    gates = profile === "auto" ? await gatesForAuto(root) : gatesForProfile(profile)
  } catch (error) {
    console.error(`[verify-gate] ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }

  if (gates.length === 0) {
    // An empty gate set must not read as success: "nothing ran" and "everything
    // passed" are different claims, and only one of them is true here.
    console.error(`[verify-gate] no gates found for profile "${profile}" in ${root}`)
    const verdict: Verdict = { ok: false, outcomes: [], passed: 0, failed: 0, skipped: 0, durationMs: 0 }
    await writeFile(out, `${JSON.stringify(verdict, null, 2)}\n`, "utf8")
    return 2
  }

  console.log(`[verify-gate] profile=${profile} root=${root}`)
  console.log(`[verify-gate] gates: ${gates.map((gate) => gate.id).join(", ")}`)

  const gate = new VerificationGate({
    run: spawnRunner,
    onOutcome: (outcome) => {
      console.log(`[verify-gate] ${outcome.status.toUpperCase()} ${outcome.id}: ${outcome.reason}`)
    },
  })

  const verdict = await gate.verify(gates, { root })
  console.log("")
  console.log(formatVerdict(verdict))

  await writeFile(out, `${JSON.stringify(verdict, null, 2)}\n`, "utf8")
  console.log(`[verify-gate] wrote ${out}`)

  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    await writeFile(summaryPath, `${formatVerdictMarkdown(verdict)}\n`, { flag: "a" })
  }

  return verdict.ok ? 0 : 1
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("verify-cli.ts")
if (invokedDirectly) {
  runCli().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`[verify-gate] ${error instanceof Error ? error.stack : String(error)}`)
      process.exit(2)
    },
  )
}
