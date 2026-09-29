// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

const g = async (args: string[], allowFail = false) => {
  const p = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const [o, e] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()])
  if ((await p.exited) !== 0 && !allowFail) throw new Error(`git ${args.join(" ")}\n${e.trim()}`)
  return (o + e).trim()
}
const split = (t: string) => t.split("\0").filter(Boolean)

const BASE = "origin/main"
const isBuildOutput = (p: string) => !p.includes("/resources/") && /(^|\/)(dist|out|dist-ssr)(\/|$)/.test(p)

await g(["fetch", "origin", "--prune"], true)
await g(["read-tree", BASE])

const remoteBlobs = new Map<string, string>()
for (const line of (await g(["ls-tree", "-r", BASE])).split("\n")) {
  const m = line.match(/^\d+ blob ([0-9a-f]+)\t(.*)$/)
  if (m) remoteBlobs.set(m[2], m[1])
}

const local = new Set(
  split(await g(["ls-files", "-c", "-o", "--exclude-standard", "-z"])).filter((p) => !isBuildOutput(p)),
)

const missing = [...local].filter((p) => !remoteBlobs.has(p))
const extra = [...remoteBlobs.keys()].filter((p) => !local.has(p))

const both = [...local].filter((p) => remoteBlobs.has(p))
const proc = Bun.spawn(["git", "hash-object", "--stdin-paths"], {
  stdin: new TextEncoder().encode(both.join("\n") + "\n"),
  stdout: "pipe",
  stderr: "pipe",
})
const hashes = (await new Response(proc.stdout).text()).split("\n").filter(Boolean)
await new Response(proc.stderr).text()
await proc.exited
const differing = both.filter((p, i) => remoteBlobs.get(p) !== hashes[i])

console.log(`github files     : ${remoteBlobs.size}`)
console.log(`local to track   : ${local.size}`)
console.log(`missing on github: ${missing.length}${missing.length ? " -> " + missing.slice(0, 8).join(", ") : ""}`)
console.log(`extra on github  : ${extra.length}${extra.length ? " -> " + extra.slice(0, 8).join(", ") : ""}`)
console.log(`content differs  : ${differing.length}${differing.length ? " -> " + differing.slice(0, 8).join(", ") : ""}`)
console.log(`build output     : ${[...remoteBlobs.keys()].filter(isBuildOutput).length}`)
console.log(`vendored modules : ${[...remoteBlobs.keys()].filter((p) => p.includes("resources/") && p.includes("node_modules/")).length}`)
console.log(`\nIDENTICAL        : ${missing.length === 0 && extra.length === 0 && differing.length === 0 ? "YES" : "NO"}`)
