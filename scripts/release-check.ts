// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

const p = Bun.spawn(
  ["gh", "release", "view", "v19.0.5", "--json", "name,tagName,isDraft,isPrerelease,publishedAt,url,assets"],
  { stdout: "pipe", stderr: "pipe" },
)
const raw = (await new Response(p.stdout).text()) + (await new Response(p.stderr).text())
await p.exited

try {
  const d = JSON.parse(raw)
  console.log("title    :", d.name)
  console.log("tag      :", d.tagName)
  console.log("draft    :", d.isDraft, " prerelease:", d.isPrerelease)
  console.log("published:", d.publishedAt)
  console.log("url      :", d.url)
  console.log("\nassets:")
  for (const a of d.assets) console.log(`  ${a.size.toLocaleString().padStart(14)}  ${a.name}`)
  const total = d.assets.reduce((s, a) => s + a.size, 0)
  console.log(`  ${total.toLocaleString().padStart(14)}  TOTAL (${d.assets.length} files)`)
} catch {
  console.log(raw.slice(0, 500))
}
