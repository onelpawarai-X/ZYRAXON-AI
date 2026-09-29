#!/usr/bin/env bun
/**
 * Final correction sync.
 *
 * The merged pull request was built from a plan that only listed paths that
 * were missing or extra, so files that merely needed an update were left behind.
 * This walks the whole working tree again and commits whatever still differs
 * from the current main, so the remote ends up matching the local tree.
 */

import { gitAsync, gitPathspec } from "./sync-plan"
import { isBuildOutput } from "./sync-paths"

const BASE = "origin/main"
const BRANCH = "zyraxon/sync-final"

const base = await gitAsync(["rev-parse", BASE])
await gitAsync(["symbolic-ref", "HEAD", `refs/heads/${BRANCH}`])
await gitAsync(["update-ref", `refs/heads/${BRANCH}`, base])
await gitAsync(["read-tree", BASE])

console.log("git add -A")
const started = Date.now()
await gitAsync(["add", "-A"])
console.log(`  staged in ${Math.round((Date.now() - started) / 1000)}s`)

const staged = (await gitAsync(["diff", "--cached", "--name-only", "-z"], true)).split("\0").filter(Boolean)
const buildOutput = staged.filter(isBuildOutput)
if (buildOutput.length) await gitPathspec(["rm", "-r", "-q", "--cached", "--ignore-unmatch"], buildOutput)

const final = (await gitAsync(["diff", "--cached", "--name-only", "-z"], true)).split("\0").filter(Boolean)
console.log(`correcting ${final.length} paths`)

if (!final.length) {
  console.log("already in sync, nothing to do")
  process.exit(0)
}

const kinds = new Map<string, number>()
for (const e of (await gitAsync(["diff", "--cached", "--name-status", "-z"], true)).split("\0")) {
  if (/^[A-Z]\d*$/.test(e)) continue
  const key = e.split("/").slice(0, 3).join("/")
  kinds.set(key, (kinds.get(key) ?? 0) + 1)
}

const message = [
  `fix(zyraxon): apply the working tree changes the first sync skipped`,
  ``,
  `The earlier sync only carried paths that were missing or extra from the remote,`,
  `so files that merely needed an update never reached the branch. This commit`,
  `walks the working tree again and carries the remaining differences.`,
  ``,
  `- paths: ${final.length}`,
  `- build output left untracked: ${buildOutput.length}`,
  ``,
  ...[...kinds].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `  - ${v}  ${k}`),
].join("\n")

await gitAsync(["commit", "-q", "--no-verify", "-m", message])
console.log("commit  ", await gitAsync(["rev-parse", "--short", "HEAD"]))

console.log("pushing")
const pushStarted = Date.now()
await gitAsync(["push", "--no-verify", "--force", "origin", `${BRANCH}:${BRANCH}`])
console.log(`  pushed in ${Math.round((Date.now() - pushStarted) / 1000)}s`)

console.log("pull request")
const create = Bun.spawn(
  ["gh", "pr", "create", "--base", "main", "--head", BRANCH, "--title", message.split("\n")[0], "--body", message],
  { stdout: "pipe", stderr: "pipe" },
)
const createOut = ((await new Response(create.stdout).text()) + (await new Response(create.stderr).text())).trim()
console.log(createOut.split("\n").filter((l) => l.includes("/pull/")).slice(-1)[0] ?? createOut.slice(0, 300))

console.log("merging")
const merge = Bun.spawn(["gh", "pr", "merge", BRANCH, "--merge", "--delete-branch=false"], {
  stdout: "pipe",
  stderr: "pipe",
})
const mergeOut = ((await new Response(merge.stdout).text()) + (await new Response(merge.stderr).text())).trim()
console.log(mergeOut.slice(0, 400))
console.log("merge exit", await merge.exited)

await gitAsync(["fetch", "origin", "--prune"], true)
console.log("origin/main is now", await gitAsync(["rev-parse", "--short", "origin/main"]))
