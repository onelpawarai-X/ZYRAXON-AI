// Copyright (c) 2026 onelpawarai. All rights reserved.

/** Parse every workflow so a syntax error cannot reach main. */

import { parse } from "yaml"
import { readdirSync, readFileSync } from "node:fs"

const BOM = Buffer.from([0xef, 0xbb, 0xbf])
const problems: string[] = []

for (const name of readdirSync(".github/workflows").filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))) {
  const bytes = readFileSync(`.github/workflows/${name}`)
  const text = bytes.toString("utf8")
  const issues: string[] = []

  // A mark at the start of the file is a byte order mark and belongs there. One
  // further in joins the key after it, so the workflow is rejected before a
  // runner starts and the run log never explains why.
  if (bytes.indexOf(BOM, 3) !== -1) issues.push("carries a stray byte order mark")
  if (!/^name:\s*\S/m.test(text)) issues.push("no plain `name:` key")

  try {
    const doc = parse(text)
    if (doc.jobs === undefined) issues.push("no jobs key")
    if ((doc.on ?? doc[true]) === undefined) issues.push("no trigger key")
  } catch (e) {
    issues.push(e instanceof Error ? e.message.split("\n")[0] : String(e))
  }

  if (issues.length) {
    problems.push(name)
    console.log(`${name}  FAILED`)
    for (const issue of issues) console.log(`  - ${issue}`)
  }
}

if (problems.length) {
  console.log(`\n${problems.length} workflow(s) need attention`)
  process.exitCode = 1
} else {
  console.log("every workflow parses")
}
