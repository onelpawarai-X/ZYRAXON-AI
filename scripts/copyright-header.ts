#!/usr/bin/env bun
// Inserts and verifies the ZYRAXON copyright header on tracked source files.
//
// The header is only ever added to files that support a comment syntax. Anything
// that would break the build if annotated is reported and skipped, never edited.

import { spawnSync } from "node:child_process"
import * as path from "node:path"

const OWNER = "onelpawarai"
const YEAR = "2026"
const SPDX = "LicenseRef-ZYRAXON-ZSL-X"
const SPDX_TAG = "SPDX-License-Identifier:"

const MARKERS = {
  "ts": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "tsx": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "js": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "jsx": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "mjs": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "cjs": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "py": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "rb": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "sh": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "bash": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "go": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "rs": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "java": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "kt": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "swift": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "c": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "h": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "cpp": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "hpp": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "cs": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "css": `/* ${SPDX_TAG} ${SPDX}\n   Copyright (c) ${YEAR} ${OWNER}. All rights reserved. */`,
  "scss": `/* ${SPDX_TAG} ${SPDX}\n   Copyright (c) ${YEAR} ${OWNER}. All rights reserved. */`,
  "html": `<!-- ${SPDX_TAG} ${SPDX}\n     Copyright (c) ${YEAR} ${OWNER}. All rights reserved. -->`,
  "vue": `<!-- ${SPDX_TAG} ${SPDX}\n     Copyright (c) ${YEAR} ${OWNER}. All rights reserved. -->`,
  "svelte": `<!-- ${SPDX_TAG} ${SPDX}\n     Copyright (c) ${YEAR} ${OWNER}. All rights reserved. -->`,
  "sql": `-- ${SPDX_TAG} ${SPDX}\n-- Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "ps1": `<# ${SPDX_TAG} ${SPDX}\n   Copyright (c) ${YEAR} ${OWNER}. All rights reserved. #>`,
  "yaml": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "yml": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "toml": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "dockerfile": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "zig": `// ${SPDX_TAG} ${SPDX}\n// Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "ex": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "exs": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "erl": `%% ${SPDX_TAG} ${SPDX}\n%% Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "hs": `-- ${SPDX_TAG} ${SPDX}\n-- Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "lua": `-- ${SPDX_TAG} ${SPDX}\n-- Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "pl": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
  "r": `# ${SPDX_TAG} ${SPDX}\n# Copyright (c) ${YEAR} ${OWNER}. All rights reserved.`,
}

// Formats that cannot carry a comment, or whose contents are machine-defined.
const NO_COMMENT = new Set([
  "json", "jsonc", "json5", "lock", "svg", "map", "min", "snap", "txt", "md", "mdx",
  "csv", "tsv", "png", "jpg", "jpeg", "gif", "webp", "ico", "icns", "pdf", "zip",
  "gz", "br", "wasm", "node", "exe", "dll", "so", "dylib", "woff", "woff2", "ttf",
  "otf", "eot", "mp3", "mp4", "wav", "mov", "webm", "pem", "key", "crt", "p12",
  "db", "sqlite", "onnx", "bin", "dat", "log", "env", "gitignore", "dockerignore",
  "snap", "lock", "pyi", "pyd", "typed", "map.gz", "d", "bak",
])

// Matched against whole path segments, not raw substrings, so that "out" does
// not swallow "layout", "about" or "route", and "dist" does not match "distance".
// Kept deliberately short: third-party and vendored code already inside the
// repository is ours to protect, so only dependency caches and the git
// database itself are excluded here.
const SKIP_PATH_SEGMENTS = new Set(["node_modules", ".git", "__pycache__", ".venv", "venv", ".cache"])

const SKIP_PATH_EXACT = new Set([
  "LICENSE", "LICENSE.md", "NOTICE", "CHANGELOG.md", "CODE_OF_CONDUCT.md",
])

// Generated trees whose contents must stay byte-for-byte reproducible.
const SKIP_PATH_SUFFIXES = ["src/generated", "src/generated-effect", "src/client/generated"]

// Only code the Licensor actually authors may carry our copyright notice.
// Stamping vendored or third-party copies would assert a claim we do not hold,
// so the default scope is our own packages and scripts, never the whole tree.
const FIRST_PARTY_ROOTS = ["packages/", "scripts/", "apps/", "tools/", "plugin/"]

type Decision = { file: string; action: "add" | "present" | "skip"; reason: string }

function extensionOf(file: string): string {
  const base = path.basename(file)
  if (base === "Dockerfile") return "dockerfile"
  if (base.startsWith("Dockerfile.")) return "dockerfile"
  if (base === "Makefile" || base === "GNUmakefile") return "makefile"
  if (base === ".gitignore" || base === ".dockerignore" || base === ".npmignore") return "gitignore"
  if (base === ".env" || base.startsWith(".env.")) return "env"
  if (base.startsWith("bun.lock") || base === "package-lock.json" || base === "yarn.lock") return "lock"
  const ext = path.extname(base).replace(/^\./, "").toLowerCase()
  return ext
}

function skipReason(file: string, scope: string): string | null {
  const normalised = file.replace(/\\/g, "/")
  if (scope === "first-party" && !FIRST_PARTY_ROOTS.some((root) => normalised.startsWith(root))) {
    return "outside first-party scope"
  }
  const segments = normalised.split("/").slice(0, -1)
  for (const segment of segments) if (SKIP_PATH_SEGMENTS.has(segment)) return `path segment "${segment}"`
  for (const suffix of SKIP_PATH_SUFFIXES) if (normalised.includes(suffix)) return `generated tree "${suffix}"`
  if (SKIP_PATH_EXACT.has(path.basename(normalised))) return "licence or metadata document"
  const ext = extensionOf(normalised)
  if (NO_COMMENT.has(ext)) return `${ext} cannot carry a comment`
  if (!MARKERS[ext]) return `no comment syntax known for .${ext}`
  return null
}

export function classify(file: string, content: string, scope = "first-party"): Decision {
  const reason = skipReason(file, scope)
  if (reason) return { file, action: "skip", reason }
  if (content.includes(SPDX_TAG)) return { file, action: "present", reason: "SPDX identifier already in file" }
  return { file, action: "add", reason: "header missing" }
}

function headerFor(file: string): string {
  const ext = extensionOf(file.replace(/\\/g, "/"))
  const header = MARKERS[ext]
  if (!header) throw new Error(`no comment syntax known for ${file}`)
  return `${header}\n\n`
}

function trackedFiles(root: string): string[] {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`)
  return (result.stdout ?? "").split("\0").filter(Boolean)
}

function shebangAware(content: string, header: string): string {
  // A shebang must stay on line 1 or the interpreter stops working.
  if (content.startsWith("#!")) {
    const newline = content.indexOf("\n")
    if (newline === -1) return content
    return `${content.slice(0, newline + 1)}${header}${content.slice(newline + 1)}`
  }
  return header + content
}

export function applyHeader(file: string, content: string): string {
  const header = headerFor(file)
  const base = path.basename(file.replace(/\\/g, "/"))
  if (base === "Dockerfile") {
    // Dockerfile directives must be the first non-comment line, so the header goes after them.
    const lines = content.split("\n")
    let index = 0
    while (index < lines.length && (lines[index]?.startsWith("#") || (lines[index] ?? "").trim() === "")) index++
    const before = lines.slice(0, index).join("\n")
    const after = lines.slice(index).join("\n")
    return before ? `${before}\n${header.trimEnd()}\n\n${after}` : `${header}${content}`
  }
  return shebangAware(content, header)
}

async function main() {
  const root = process.cwd()
  const checkOnly = process.argv.includes("--check")
  const scope = process.argv.includes("--first-party") ? "first-party" : "all"
  const files = trackedFiles(root)
  const decisions: Decision[] = []
  const toWrite: { file: string; content: string }[] = []
  let missing = 0
  let skipped = 0

  for (const file of files) {
    const absolute = path.join(root, file)
    const handle = Bun.file(absolute)
    if (!(await handle.exists())) continue
    const bytes = await handle.arrayBuffer()
    const content = Buffer.from(bytes).toString("utf8")
    const decision = classify(file, content, scope)
    decisions.push(decision)
    if (decision.action === "add") {
      missing++
      toWrite.push({ file, content: applyHeader(file, content) })
    } else if (decision.action === "skip") skipped++
  }

  const byAction = decisions.reduce<Record<string, number>>((acc, d) => {
    acc[d.action] = (acc[d.action] ?? 0) + 1
    return acc
  }, {})

  console.log("Copyright header report")
  console.log("-----------------------")
  console.log(`tracked files examined : ${decisions.length}`)
  console.log(`header already present: ${byAction.present ?? 0}`)
  console.log(`header missing        : ${missing}`)
  console.log(`skipped by design     : ${skipped}`)
  console.log(`mode                  : ${checkOnly ? "check only, no files written" : "writing"}`)
  console.log(`scope                 : ${scope}${scope === "all" ? " (every tracked file that can carry a comment)" : " (packages, scripts, apps, tools, plugin only)"}`)

  const skippedKinds = new Map<string, number>()
  for (const d of decisions) {
    if (d.action !== "skip") continue
    skippedKinds.set(d.reason, (skippedKinds.get(d.reason) ?? 0) + 1)
  }
  if (skippedKinds.size > 0) {
    console.log("\nWhy files were skipped:")
    for (const [reason, count] of [...skippedKinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`  ${String(count).padStart(5)}  ${reason}`)
    }
  }

  if (missing === 0) {
    console.log("\nNothing to do.")
    return
  }

  if (checkOnly) {
    console.log("\nFiles that would receive the header:")
    for (const d of decisions.filter((x) => x.action === "add").slice(0, 40)) console.log(`  ${d.file}`)
    if (missing > 40) console.log(`  ... and ${missing - 40} more`)
    console.log(`\n${missing} file(s) missing the header.`)
    process.exit(1)
  }

  for (const { file, content } of toWrite) await Bun.write(path.join(root, file), content)
  console.log(`\nAdded the header to ${toWrite.length} file(s).`)
}

if (import.meta.main) await main()
