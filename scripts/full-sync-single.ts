#!/usr/bin/env bun
/**
 * Single-commit variant of the full sync.
 *
 * Staging every path one commit at a time is what made the chunked sync slow:
 * git recomputes the index for each of the hundreds of batches. The plan
 * itself is identical, so this stages the same paths in one pass and records
 * one commit.
 */

import { buildPlan, gitAsync, gitPathspec } from "./sync-plan"

const BASE = process.env.SYNC_BASE ?? "origin/main"
const BRANCH = process.env.SYNC_BRANCH ?? "zyraxon/full-sync"
const PUSH = process.argv.includes("--push")
const MERGE = process.argv.includes("--merge")

const { wanted, changes } = await buildPlan(BASE)
const adds = changes.filter((change) => change.kind === "add").map((change) => change.path)
const removes = changes.filter((change) => change.kind === "remove").map((change) => change.path)
const systems = [...new Set(changes.map((change) => change.system))].sort()

console.log(`base     ${BASE}`)
console.log(`branch   ${BRANCH}`)
console.log(`wanted   ${wanted.size}`)
console.log(`adds     ${adds.length}`)
console.log(`removes  ${removes.length}`)

// Root the branch at the base commit. The remote history was rewritten at some
// point, so the local tip shares no ancestry with origin/main and a pull request
// cannot be opened from it.
const base = await gitAsync(["rev-parse", BASE])
await gitAsync(["symbolic-ref", "HEAD", `refs/heads/${BRANCH}`])
await gitAsync(["update-ref", `refs/heads/${BRANCH}`, base])
await gitAsync(["read-tree", BASE])

console.log("staging removals")
await gitPathspec(["rm", "-r", "-q", "--cached", "--ignore-unmatch"], removes)
console.log("staging adds")
await gitPathspec(["add", "-A"], adds)

const staged = (await gitAsync(["diff", "--cached", "--name-only", "-z"], true)).split("\0").filter(Boolean)
console.log(`staged   ${staged.length}`)

const message = [
  `feat(zyraxon): sync the full local project tree`,
  ``,
  `Brings the working tree in line with the remote in a single pass.`,
  ``,
  `- files added:   ${adds.length}`,
  `- files removed: ${removes.length} (build output the build regenerates)`,
  `- tracked total: ${wanted.size}`,
  `- systems: ${systems.length}`,
  ``,
  ...systems.map((system) => `  - ${system}`),
  ``,
  `Build output (\`dist\`, \`out\`) stays untracked because the build regenerates it.`,
  `The prebuilt packages vendored under \`packages/desktop/resources\` are tracked,`,
  `because the application ships them.`,
].join("\n")

await gitAsync(["commit", "-q", "--no-verify", "-m", message])
const head = await gitAsync(["rev-parse", "HEAD"])
console.log(`commit   ${head.slice(0, 8)}`)

if (!PUSH) {
  console.log("\n--push not given, stopping before network")
  process.exit(0)
}

console.log("\npushing")
await gitAsync(["push", "--no-verify", "--force", "origin", `${BRANCH}:${BRANCH}`])
console.log("pushed")

if (!MERGE) {
  console.log("\n--merge not given, stopping before the pull request")
  process.exit(0)
}

console.log("\nopening pull request")
const proc = Bun.spawn(
  ["gh", "pr", "create", "--base", "main", "--head", BRANCH, "--title", message.split("\n")[0], "--body", message],
  { stdout: "pipe", stderr: "pipe" },
)
const out = await new Response(proc.stdout).text()
const err = await new Response(proc.stderr).text()
await proc.exited
const url = (out + err).trim()
console.log(url)

console.log("\nmerging")
const merge = Bun.spawn(["gh", "pr", "merge", BRANCH, "--merge", "--delete-branch=false"], {
  stdout: "pipe",
  stderr: "pipe",
})
console.log((await new Response(merge.stdout).text()).trim())
console.log((await new Response(merge.stderr).text()).trim())
console.log(`merge exit ${await merge.exited}`)

await gitAsync(["fetch", "origin", "--prune"], true)
console.log(`origin/main is now ${await gitAsync(["rev-parse", "origin/main"])}`)
