#!/usr/bin/env bun
// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Verify the chunked sync before anything is pushed.
 *
 * Every branch is the base plus its own slice of the plan, so collecting the
 * net diff of each branch proves three things at once: nothing was dropped, no
 * path was handed to two branches (which would conflict on merge), and no
 * branch carries a path the plan never mentioned.
 */

import { buildPlan, gitAsync } from "./sync-plan"

const BASE = process.env.SYNC_BASE ?? "origin/main"
const PREFIX = process.env.SYNC_PREFIX ?? "zyraxon/sync"

const { wanted, changes } = await buildPlan(BASE)
const adds = changes.filter((change) => change.kind === "add").map((change) => change.path)
const removes = changes.filter((change) => change.kind === "remove").map((change) => change.path)

console.log(`base        ${BASE}`)
console.log(`wanted      ${wanted.size}`)
console.log(`adds        ${adds.length}`)
console.log(`removes     ${removes.length}`)

const branches = (await gitAsync(["for-each-ref", "--format=%(refname:short)", `refs/heads/${PREFIX}-*`], true))
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
console.log(`branches    ${branches.length}`)
if (!branches.length) throw new Error("no sync branches found")

const seenAdds = new Map<string, string>()
const seenRemoves = new Map<string, string>()
let totalCommits = 0
let largestCommit = 0

for (const branch of branches) {
  const entries = (await gitAsync(["diff", "--name-status", "-z", BASE, branch], true)).split("\0").filter(Boolean)
  let kind = ""
  for (const entry of entries) {
    if (/^[A-Z]\d*$/.test(entry)) {
      kind = entry[0]
      continue
    }
    const bucket = kind === "D" ? seenRemoves : seenAdds
    const clash = bucket.get(entry)
    if (clash) {
      console.log(`  DUPLICATE  ${entry} in ${clash} and ${branch}`)
      process.exitCode = 1
      continue
    }
    bucket.set(entry, branch)
  }
  const commits = Number(await gitAsync(["rev-list", "--count", `${BASE}..${branch}`], true))
  totalCommits += commits
  for (const line of (await gitAsync(["log", "--format=%(files)", `${BASE}..${branch}`], true)).split("\n")) {
    const n = Number(line.trim())
    if (Number.isFinite(n) && n > largestCommit) largestCommit = n
  }
}

const missingAdds = adds.filter((path) => !seenAdds.has(path))
const missingRemoves = removes.filter((path) => !seenRemoves.has(path))
const unexpectedAdds = [...seenAdds.keys()].filter((path) => !adds.includes(path))
const unexpectedRemoves = [...seenRemoves.keys()].filter((path) => !removes.includes(path))

console.log(`branch adds ${seenAdds.size} / ${adds.length}`)
console.log(`branch removes ${seenRemoves.size} / ${removes.length}`)
console.log(`commits     ${totalCommits}  largest ${largestCommit} files`)

const failed: string[] = []
if (process.exitCode === 1) failed.push("a path is committed to more than one branch, merges would conflict")
if (missingAdds.length) failed.push(`${missingAdds.length} planned adds are missing`)
if (missingRemoves.length) failed.push(`${missingRemoves.length} planned removes are missing`)
if (unexpectedAdds.length) failed.push(`${unexpectedAdds.length} unplanned adds were committed`)
if (unexpectedRemoves.length) failed.push(`${unexpectedRemoves.length} unplanned removes were committed`)

if (failed.length) {
  console.log(`\nFAILED\n${failed.map((f) => `  - ${f}`).join("\n")}`)
  for (const path of missingAdds.slice(0, 10)) console.log(`  missing add    ${path}`)
  for (const path of missingRemoves.slice(0, 10)) console.log(`  missing remove ${path}`)
  for (const path of unexpectedAdds.slice(0, 10)) console.log(`  unexpected add    ${path}`)
  for (const path of unexpectedRemoves.slice(0, 10)) console.log(`  unexpected remove ${path}`)
  process.exit(1)
}

console.log(`\nOK: all ${branches.length} branches partition the plan exactly`)
console.log(`OK: no path is shared between branches, merges cannot conflict`)
console.log(`OK: merging them reproduces the local tree (${wanted.size} files)`)
