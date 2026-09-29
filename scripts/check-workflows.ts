// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

/** Parse the two release workflows so a syntax error cannot reach main. */

import { parse } from "yaml"

for (const name of ["release-linux.yml", "release-macos.yml"]) {
  const path = `.github/workflows/${name}`
  const text = await Bun.file(path).text()
  try {
    const doc = parse(text)
    const jobs = Object.keys(doc.jobs ?? {})
    const on = doc.on ?? doc[true]
    const steps = doc.jobs[Object.keys(doc.jobs)[0]].steps.map((s: { name?: string; uses?: string; run?: string }) =>
      s.name ?? s.uses ?? "(inline)",
    )
    console.log(`\n${name}  OK`)
    console.log("  trigger  :", Object.keys(on).join(", "))
    console.log("  jobs     :", jobs.join(", "))
    console.log("  steps    :", steps.length)
    for (const s of steps) console.log("     -", s)
  } catch (e) {
    console.error(`\n${name}  FAILED: ${(e as Error).message}`)
    process.exitCode = 1
  }
}
