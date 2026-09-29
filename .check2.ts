const g = async (args: string[]) => {
  const p = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const [o, e] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()])
  await p.exited
  return (o + e).trim()
}

const status = async (a: string, b: string) => {
  const raw = await g(["diff", "--name-status", "-z", a, b])
  const out: { kind: string; path: string }[] = []
  let kind = ""
  for (const e of raw.split("\0").filter(Boolean)) {
    if (/^[A-Z]\d*$/.test(e)) {
      kind = e[0]
      continue
    }
    out.push({ kind, path: e })
  }
  return out
}

const mainVsOur = await status("origin/main", "zyraxon/full-sync")
console.log("origin/main vs our branch :", mainVsOur.length, "differing paths")
const buckets = new Map<string, number>()
for (const c of mainVsOur) {
  const key = c.path.split("/").slice(0, 3).join("/")
  buckets.set(key, (buckets.get(key) ?? 0) + 1)
}
for (const [k, v] of [...buckets].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`   ${v}  ${k}`)
console.log("   samples:", mainVsOur.slice(0, 8).map((c) => `${c.kind} ${c.path}`).join(" | "))

// What the remote still carries that the local tree does not want.
const remote = new Set((await g(["ls-tree", "-r", "--name-only", "origin/main"])).split("\n").filter(Boolean))
const isBuildOutput = (p: string) => !p.includes("/resources/") && /(^|\/)(dist|out|dist-ssr)(\/|$)/.test(p)
const strayBuild = [...remote].filter(isBuildOutput)
console.log("\nremote still carries build output:", strayBuild.length)
const straySample = strayBuild.slice(0, 5)
for (const s of straySample) console.log("   ", s)
