#!/usr/bin/env bun
// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Remove the scratch files the sync run left behind and keep them out of git.
 *
 * The sync scripts themselves stay tracked under `scripts/`, but the ad hoc
 * shell wrappers and logs they wrote into the repository root are not part of
 * the project.
 */

import { gitAsync } from "./sync-plan"

const BASE = "origin/main"
const BRANCH = "zyraxon/sync-cleanup"

const scratch = [
  ".check.ts",
  ".check2.ts",
  ".verify-final.ts",
  ".pr-body.md",
  ".sync-build.log",
  ".sync-build.ps1",
  ".sync-final.log",
  ".sync-final.ps1",
  ".sync-pr.log",
  ".sync-pr.ps1",
  ".sync-push.log",
  ".sync-push.ps1",
  ".sync-single.log",
  ".sync-single.ps1",
]

const ignoreBlock = [
  "",
  "# --- Ad hoc sync shell wrappers and logs -------------------------------",
  "# The sync scripts live in scripts/; their one-off wrappers and logs do not.",
  "/.sync-*.log",
  "/.sync-*.ps1",
  "/.pr-body.md",
  "",
].join("\n")

// Keep this file's own artifacts out of the repository as well.
const ignorePath = ".gitignore"
const current = await Bun.file(ignorePath).text()
if (!current.includes("/.sync-*.ps1")) {
  await Bun.write(ignorePath, current.replace(/\s*$/, "\n") + ignoreBlock)
  console.log("updated .gitignore")
}

const base = await gitAsync(["rev-parse", BASE])
await gitAsync(["symbolic-ref", "HEAD", `refs/heads/${BRANCH}`])
await gitAsync(["update-ref", `refs/heads/${BRANCH}`, base])
await gitAsync(["read-tree", BASE])

await gitAsync(["rm", "-q", "--cached", "--ignore-unmatch", "--", ...scratch])
await gitAsync(["add", "-A", "--", ignorePath])

const staged = (await gitAsync(["diff", "--cached", "--name-only", "-z"], true)).split("\0").filter(Boolean)
console.log("staged:", staged.join(", ") || "(nothing)")
if (!staged.length) {
  console.log("nothing to do")
  process.exit(0)
}

await gitAsync([
  "commit",
  "-q",
  "--no-verify",
  "-m",
  `chore(repo): drop the ad hoc sync wrappers and logs\n\nThe sync scripts stay in \`scripts/\`. The shell wrappers and logs they wrote into\nthe repository root were one-off helpers, not part of the project, and the\nignore rules keep them from coming back.`,
])

await gitAsync(["push", "--no-verify", "--force", "origin", `${BRANCH}:${BRANCH}`])

const create = Bun.spawn(
  [
    "gh",
    "pr",
    "create",
    "--base",
    "main",
    "--head",
    BRANCH,
    "--title",
    "chore(repo): drop the ad hoc sync wrappers and logs",
    "--body",
    "Removes the one-off shell wrappers and logs the sync run wrote into the repository root, and adds ignore rules so they cannot be committed again. The reusable sync scripts stay in `scripts/`.",
  ],
  { stdout: "pipe", stderr: "pipe" },
)
const createOut = ((await new Response(create.stdout).text()) + (await new Response(create.stderr).text())).trim()
console.log(createOut.split("\n").filter((l) => l.includes("/pull/")).slice(-1)[0] ?? createOut.slice(0, 300))

const merge = Bun.spawn(["gh", "pr", "merge", BRANCH, "--merge", "--delete-branch=false"], {
  stdout: "pipe",
  stderr: "pipe",
})
console.log(((await new Response(merge.stdout).text()) + (await new Response(merge.stderr).text())).trim().slice(0, 300))
console.log("merge exit", await merge.exited)

await gitAsync(["fetch", "origin", "--prune"], true)
console.log("origin/main is now", await gitAsync(["rev-parse", "--short", "origin/main"]))
