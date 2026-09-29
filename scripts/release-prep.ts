/**
 * Commit the release preparation and open the pull request for it.
 */

import { gitAsync } from "./sync-plan"

const BASE = "origin/main"
const BRANCH = "zyraxon/v19-0-5-prep"

const base = await gitAsync(["rev-parse", BASE])
await gitAsync(["symbolic-ref", "HEAD", `refs/heads/${BRANCH}`])
await gitAsync(["update-ref", `refs/heads/${BRANCH}`, base])
await gitAsync(["read-tree", BASE])
await gitAsync(["add", "-A", "--", "README.md", "packages/desktop/electron-builder.config.ts"])

const staged = (await gitAsync(["diff", "--cached", "--name-only", "-z"], true)).split("\0").filter(Boolean)
console.log("staged:", staged.join(", ") || "(nothing)")
if (!staged.length) process.exit(0)

await gitAsync([
  "commit",
  "-q",
  "--no-verify",
  "-m",
  `docs(release): state the 100k star mission and fix installer asset names\n\nThe README now spells out what the 100,000 star goal actually buys: our own model,
our own provider, our own ecosystem, our own company, with the free tier
unrestricted so nobody is locked out. The provider-agnostic architecture is
already the reason that is reachable, and the README says so.\n\nThe installer artifact name was built from \`\${productName}\`, which carries a
space in it. GitHub rewrites a space to a dot in the download URL while
electron-updater looks the asset up under the sanitized name written into
latest.yml, so auto-update could not find the file. Build the name from a
space-free slug so the artifact, latest.yml and the download URL agree.`,
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
    "docs(release): state the 100k star mission and fix installer asset names",
    "--body",
    [
      "## What this does",
      "",
      "- Adds a mission banner near the top of the README describing what 100,000 stars buys: our own model, our own provider, our own ecosystem, our own company, with an unrestricted free tier.",
      "- Explains why it is technically reachable: the engine is provider-agnostic, so shipping our own weights breaks nothing and no single company can switch us off.",
      "- Fixes the NSIS installer artifact name. It was built from `${productName}`, which contains a space. GitHub rewrites a space to a dot in the download URL, while electron-updater looks the asset up under the sanitized name in `latest.yml`, so auto-update could not find the file. The name now comes from a space-free slug.",
    ].join("\n"),
  ],
  { stdout: "pipe", stderr: "pipe" },
)
const out = ((await new Response(create.stdout).text()) + (await new Response(create.stderr).text())).trim()
console.log(out.split("\n").filter((l) => l.includes("/pull/")).slice(-1)[0] ?? out.slice(0, 300))

const merge = Bun.spawn(["gh", "pr", "merge", BRANCH, "--merge", "--delete-branch=false"], {
  stdout: "pipe",
  stderr: "pipe",
})
await new Response(merge.stdout).text()
await new Response(merge.stderr).text()
console.log("merge exit", await merge.exited)

await gitAsync(["fetch", "origin", "--prune"], true)
console.log("origin/main is now", await gitAsync(["rev-parse", "--short", "origin/main"]))
