#!/usr/bin/env bun
// Rewrites the copyright year to the current year, everywhere it is stamped.
//
// Runs on 1 January each year from CI, so the notice never has to be maintained
// by hand. Only the year changes: the owner, the licence identifier and the
// surrounding wording are left exactly as written.

import { spawnSync } from "node:child_process"
import * as path from "node:path"

const OWNER = "onelpawarai"
const SPDX = "LicenseRef-ZYRAXON-ZSL-X"

// Matches "Copyright (c) 2026 onelpawarai" and "Copyright (c) 2026-2028 onelpawarai".
const STAMP = new RegExp(`(Copyright \\(c\\)\\s*)(\\d{4})(-(\\d{4}))?(\\s+${OWNER})`, "g")

// A successor edition only ever exists if its licence text has actually been
// published in the repository. Nothing is switched on a calendar alone.
const SUCCESSOR = "ZSL-X-2.1.0-LICENSE"

// Formats that cannot carry a comment, so a year stamp is never legal in them.
const NO_COMMENT = new Set([
  "json", "jsonc", "json5", "lock", "svg", "map", "min", "snap", "txt", "md", "mdx",
  "csv", "tsv", "png", "jpg", "jpeg", "gif", "webp", "ico", "icns", "pdf", "zip",
  "gz", "br", "wasm", "node", "exe", "dll", "so", "dylib", "woff", "woff2", "ttf",
  "otf", "eot", "mp3", "mp4", "wav", "mov", "webm", "pem", "key", "crt", "p12",
  "db", "sqlite", "onnx", "bin", "dat", "log", "pyi", "pyd", "typed", "bak",
])

const SKIP_PATH_SEGMENTS = new Set(["node_modules", ".git", "__pycache__", ".venv", "venv", ".cache"])
const SKIP_PATH_SUFFIXES = ["src/generated", "src/generated-effect", "src/client/generated"]
const SKIP_PATH_EXACT = new Set(["LICENSE", "LICENSE.md", "NOTICE", "CHANGELOG.md", "CODE_OF_CONDUCT.md"])

function extensionOf(file: string): string {
  const base = path.basename(file)
  if (base === "Dockerfile" || base.startsWith("Dockerfile.")) return "dockerfile"
  const ext = path.extname(base).replace(/^\./, "").toLowerCase()
  return ext
}

function editable(file: string): boolean {
  const normalised = file.replace(/\\/g, "/")
  const segments = normalised.split("/").slice(0, -1)
  for (const segment of segments) if (SKIP_PATH_SEGMENTS.has(segment)) return false
  for (const suffix of SKIP_PATH_SUFFIXES) if (normalised.includes(suffix)) return false
  if (SKIP_PATH_EXACT.has(path.basename(normalised))) return false
  if (NO_COMMENT.has(extensionOf(normalised))) return false
  return true
}

export function updateYear(content: string, year: number): string {
  return content.replace(STAMP, (_all, head, from, dash, to, tail) => {
    const range = dash ? `-${to}` : ""
    return `${head}${year}${range}${tail}`
  })
}

function trackedFiles(root: string): string[] {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`)
  return (result.stdout ?? "").split("\0").filter(Boolean)
}

async function main() {
  const root = process.cwd()
  const checkOnly = process.argv.includes("--check")
  const requested = process.argv.find((arg) => /^--year=\d{4}$/.test(arg))
  const year = requested ? Number(requested.slice(7)) : new Date().getUTCFullYear()

  console.log(`Copyright year update`)
  console.log(`---------------------`)
  console.log(`year      : ${year}`)
  console.log(`mode      : ${checkOnly ? "check only, no files written" : "writing"}`)

  const files = trackedFiles(root)
  const changes: { file: string; before: string[]; after: string[] }[] = []

  for (const file of files) {
    if (!editable(file)) continue
    const absolute = path.join(root, file)
    const handle = Bun.file(absolute)
    if (!(await handle.exists())) continue
    const content = Buffer.from(await handle.arrayBuffer()).toString("utf8")
    if (!content.includes(OWNER) || !content.includes("Copyright (c)")) continue

    const updated = updateYear(content, year)
    if (updated === content) continue

    const before = [...content.matchAll(STAMP)].map((m) => m[0])
    const after = [...updated.matchAll(STAMP)].map((m) => m[0])
    changes.push({ file, before, after })
  }

  const years = new Set<string>()
  for (const change of changes) for (const stamp of change.before) years.add(stamp)

  console.log(`stamps found   : ${years.size ? [...years].join(", ") : "none"}`)
  console.log(`files to update: ${changes.length}`)

  if (changes.length === 0) {
    console.log("\nNothing to do.")
    return
  }

  for (const change of changes.slice(0, 10)) {
    console.log(`  ${change.file}: ${change.before[0]} -> ${change.after[0]}`)
  }
  if (changes.length > 10) console.log(`  ... and ${changes.length - 10} more`)

  if (checkOnly) {
    console.log(`\n${changes.length} file(s) are not stamped ${year}.`)
    process.exit(1)
  }

  for (const change of changes) {
    const absolute = path.join(root, change.file)
    const content = Buffer.from(await Bun.file(absolute).arrayBuffer()).toString("utf8")
    await Bun.write(absolute, updateYear(content, year))
  }
  console.log(`\nUpdated ${changes.length} file(s) to ${year}.`)

  const successorExists = await Bun.file(path.join(root, SUCCESSOR)).exists()
  console.log("")
  if (successorExists) {
    console.log(`A successor edition (${SUCCESSOR}) is published. Review it and decide`)
    console.log("whether any existing terms should point at it. Copies already obtained")
    console.log("keep the terms they were issued under.")
  } else {
    console.log(`No successor edition (${SUCCESSOR}) is published, so the current edition`)
    console.log("governs unchanged. Terms never shift on a date alone.")
  }
}

if (import.meta.main) await main()

export { OWNER, SPDX }
