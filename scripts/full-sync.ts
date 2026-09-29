#!/usr/bin/env bun
/**
 * ZYRAXON full sync: push the entire local project to GitHub as a series of
 * small, system-scoped commits grouped into a set of pull requests.
 *
 * The local working tree is the single source of truth. The plan and the tree
 * comparison live in ./sync-plan so this script stays focused on laying the
 * changes out as commits and branches.
 *
 * Commits are assembled with index plumbing (`git symbolic-ref`, `git read-tree`
 * and `git rm --cached`) so the working tree is never checked out or rewritten
 * while a batch is in flight.
 */

import { buildPlan, gitAsync, gitPathspec, scopeOf, type Change } from "./sync-plan"

const CHUNK_SIZE = Number(process.env.SYNC_CHUNK_SIZE ?? 55)
const PR_COUNT = Number(process.env.SYNC_PR_COUNT ?? 25)
const BASE = process.env.SYNC_BASE ?? "origin/main"
const PREFIX = process.env.SYNC_PREFIX ?? "zyraxon/sync"
const MANIFEST = process.env.SYNC_MANIFEST ?? ".sync-manifest.txt"

const DRY_RUN = process.argv.includes("--dry-run")
const NO_PUSH = process.argv.includes("--no-push")

/** Keep every change of one path together, then cut paths into fixed chunks. */
function buildChunks(changes: Change[]) {
  const bySystem = new Map<string, Change[]>()
  for (const change of changes) {
    const list = bySystem.get(change.system)
    if (list) list.push(change)
    else bySystem.set(change.system, [change])
  }
  const chunks: { chunk: Change[]; system: string }[] = []
  for (const system of [...bySystem.keys()].sort()) {
    const list = bySystem.get(system)!
    for (let i = 0; i < list.length; i += CHUNK_SIZE) {
      chunks.push({ chunk: list.slice(i, i + CHUNK_SIZE), system })
    }
  }
  return chunks
}

function messageFor(chunk: Change[], system: string) {
  const scope = scopeOf(chunk.map((change) => change.system))
  const adds = chunk.filter((change) => change.kind === "add").length
  const removes = chunk.length - adds
  const parts: string[] = []
  if (adds) parts.push(`add ${adds}`)
  if (removes) parts.push(`remove ${removes}`)
  const kind = adds && !removes ? "feat" : "chore"
  return `${kind}(${scope}): ${parts.join(" and ")} files in ${system}`
}

async function stage(chunk: Change[]) {
  const removes = chunk.filter((change) => change.kind === "remove").map((change) => change.path)
  const adds = chunk.filter((change) => change.kind === "add").map((change) => change.path)
  await gitPathspec(["rm", "-r", "-q", "--cached", "--ignore-unmatch"], removes)
  await gitPathspec(["add", "-A"], adds)
}

const manifestRow = (group: { branch: string; chunks: unknown[]; title: string }) =>
  [group.branch, `${group.chunks.length} commits`, group.title].join("\t")
const writeManifest = (rows: string[]) => Bun.write(MANIFEST, rows.join("\n") + "\n")

async function main() {
  console.log("zyraxon full sync")
  console.log(`  base       ${BASE}`)
  console.log(`  chunk size ${CHUNK_SIZE}`)
  console.log(`  pr count   ${PR_COUNT}`)

  const { wanted, changes } = await buildPlan(BASE)
  const adds = changes.filter((change) => change.kind === "add").length
  const chunks = buildChunks(changes)
  console.log(`  wanted     ${wanted.size}`)
  console.log(`  adds       ${adds}`)
  console.log(`  removes    ${changes.length - adds}`)
  console.log(`  chunks     ${chunks.length}`)

  // Chunks are ordered by system, so a sequential split would hand one pull
  // request an entire subsystem and leave the next one nearly empty.
  // Round-robin keeps every pull request to a comparable size.
  const groups: { branch: string; chunks: typeof chunks; title: string; body: string }[] = Array.from(
    { length: PR_COUNT },
    (_, i) => ({
      branch: `${PREFIX}-${String(i + 1).padStart(2, "0")}`,
      chunks: [] as typeof chunks,
      title: "",
      body: "",
    }),
  )
  chunks.forEach((chunk, i) => groups[i % PR_COUNT].chunks.push(chunk))
  const populated = groups.filter((group) => group.chunks.length > 0)

  for (const group of populated) {
    const files = group.chunks.reduce((sum, c) => sum + c.chunk.length, 0)
    const systems = [...new Set(group.chunks.map((c) => c.system))].sort()
    const adds = group.chunks.flatMap((c) => c.chunk).filter((c) => c.kind === "add").length
    group.title = `sync(${group.branch.slice(-2)}): ${files} files across ${systems.length} system${systems.length > 1 ? "s" : ""}`
    group.body = [
      `Part of the full local-to-GitHub sync of the ZYRAXON working tree.`,
      ``,
      `- commits: ${group.chunks.length} (about ${CHUNK_SIZE} files each)`,
      `- files: ${files} (${adds} added, ${files - adds} removed)`,
      `- systems: ${systems.map((s) => `\`${s}\``).join(", ")}`,
      ``,
      `The local working tree is the source of truth. Build output (\`dist\`, \`out\`) stays untracked because the build regenerates it; the prebuilt packages vendored under \`packages/desktop/resources\` are tracked because the app ships them.`,
    ].join("\n")
  }

  console.log(`  branches   ${populated.length}`)
  console.log(`  per pr     ~${Math.round(chunks.length / Math.max(1, populated.length))} commits`)

  if (DRY_RUN) {
    for (const group of populated) {
      const files = group.chunks.reduce((s, c) => s + c.chunk.length, 0)
      console.log(`  [dry] ${group.branch}  ${group.chunks.length} commits  ${files} files`)
    }
    return
  }

  const saveProgress = () => writeManifest(populated.map(manifestRow))
  await saveProgress()

  let commitNumber = 0
  for (const group of populated) {
    // Each branch has to be rooted at the base commit, not at whatever HEAD
    // happened to be. The working tree and the index are anchored separately so
    // nothing on disk is ever checked out or rewritten.
    const base = await gitAsync(["rev-parse", BASE])
    await gitAsync(["symbolic-ref", "HEAD", `refs/heads/${group.branch}`])
    await gitAsync(["update-ref", `refs/heads/${group.branch}`, base])
    await gitAsync(["read-tree", BASE])

    for (const { chunk, system } of group.chunks) {
      await stage(chunk)
      const staged = (await gitAsync(["diff", "--cached", "--name-only", "-z"], true))
        .split("\0")
        .filter(Boolean)
      if (!staged.length) continue
      await gitAsync(["commit", "-q", "--no-verify", "-m", messageFor(chunk, system)])
      commitNumber++
      if (commitNumber % 25 === 0) {
        console.log(`  ${commitNumber} commits  (on ${group.branch})`)
        await saveProgress()
      }
    }
    console.log(`  ${group.branch} done  ${group.chunks.length} commits`)
  }

  if (NO_PUSH) {
    console.log("\n--no-push: branches built locally, nothing sent")
    return
  }

  console.log("\npushing")
  for (const group of populated) {
    await gitAsync(["push", "--no-verify", "--force", "-q", "origin", `${group.branch}:${group.branch}`])
    console.log(`  pushed ${group.branch}`)
  }
  console.log(`\ndone: ${commitNumber} commits across ${populated.length} branches`)
}

await main()
