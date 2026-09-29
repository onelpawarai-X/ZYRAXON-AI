#!/usr/bin/env bun
// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

// Injects the CRITICAL RULES block into every AGENTS.md and every system prompt.
//
// The canonical text lives in .github/CRITICAL-RULES.md. This script keeps the
// copies in sync so an agent always receives the same rules whichever prompt it
// was started with. Running it twice changes nothing.

import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import * as path from "node:path"

const ROOT = process.cwd()
const CANON = path.join(ROOT, ".github", "CRITICAL-RULES.md")

const BEGIN = "<!-- CRITICAL-RULES:BEGIN -->"
const END = "<!-- CRITICAL-RULES:END -->"

async function block(): Promise<string> {
  const text = await Bun.file(CANON).text()
  return text.replace(CRITICAL_HEADER, "").trim()
}

// Matches the H1 and the two lines under it, leaving the numbered rules behind.
const CRITICAL_HEADER = /^# CRITICAL RULES\n\n(?:These are not suggestions\.[\s\S]*?this file wins\.\n)/

function targets(): string[] {
  const result = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  const tracked = (result.stdout ?? "").split(/\r?\n/).filter(Boolean)
  const all = [...tracked, ...walk(ROOT)]
  const unique = [...new Set(all)]
  return unique.filter(
    (file) =>
      path.basename(file) === "AGENTS.md" ||
      /^packages[\\/]zyraxon[\\/]src[\\/]agent[\\/]prompt[\\/].+\.txt$/.test(file),
  )
}

function walk(dir: string): string[] {
  const out: string[] = []
  const skip = new Set(["node_modules", ".git", "dist", "build", "out", "__pycache__", ".cache"])
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(path.relative(ROOT, full))
  }
  return out
}

function splice(content: string, rules: string): string {
  // Remove every previously injected block, including a doubled marker left by an
  // earlier run. Matches from BEGIN to the last END, so an empty or duplicated
  // tail cannot leave debris in the document.
  const MARKER = new RegExp(`${BEGIN.replace(/[-[\]{}()*+?.,\\^$|#]/g, "\\$&")}[\\s\\S]*?${END.replace(/[-[\]{}()*+?.,\\^$|#]/g, "\\$&")}`, "g")
  const clean = content.replace(MARKER, "\n").replace(/\n{3,}/g, "\n\n")
  const wrapped = `${BEGIN}\n\n## CRITICAL RULES (from .github/CRITICAL-RULES.md)\n\n${rules}\n\n${END}\n\n`
  // Keep the document's own H1 heading first so the prompt still opens on its
  // original title. The block goes directly after it.
  const header = /^#[ \t]+[^\n]*\n/.exec(clean)
  const at = header ? header[0].length : 0
  return clean.slice(0, at) + "\n" + wrapped + clean.slice(at).replace(/^\n+/, "\n")
}

async function main() {
  const check = process.argv.includes("--check")
  const rules = await block()
  const files = targets()
  let changed = 0
  let already = 0

  for (const file of files) {
    const absolute = path.join(ROOT, file)
    const handle = Bun.file(absolute)
    if (!(await handle.exists())) continue
    const before = Buffer.from(await handle.arrayBuffer()).toString("utf8")
    const after = splice(before, rules)
    if (after !== before) {
      changed++
      if (!check) await Bun.write(absolute, after)
    } else already++
  }

  console.log(`targets   : ${files.length}`)
  console.log(`updated   : ${changed}`)
  console.log(`unchanged : ${already}`)
  console.log(`mode      : ${check ? "check only" : "write"}`)
  if (check && changed > 0) process.exit(1)
}

if (import.meta.main) await main()
