const g = async (args: string[]) => {
  const p = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const [o, e] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()])
  await p.exited
  return (o + e).trim()
}

const mainTree = await g(["rev-parse", "origin/main^{tree}"])
const ourTree = await g(["rev-parse", "zyraxon/full-sync^{tree}"])
console.log("origin/main tree :", mainTree)
console.log("our branch tree  :", ourTree)
console.log("identical        :", mainTree === ourTree ? "YES" : "NO")

const list = async (ref: string) =>
  (await g(["ls-tree", "-r", "--name-only", ref])).split("\n").filter(Boolean)

const main = await list("origin/main")
console.log("main files       :", main.length)
console.log("main dist/out    :", main.filter((p) => /(^|\/)(dist|out)\//.test(p)).length)
console.log("main node_modules:", main.filter((p) => p.includes("node_modules/")).length)

for (const n of [83, 84]) {
  const p = Bun.spawn(["gh", "pr", "view", String(n), "--json", "number,title,state,mergedAt,additions,deletions,changedFiles"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = await new Response(p.stdout).text()
  const err = await new Response(p.stderr).text()
  await p.exited
  try {
    const d = JSON.parse(out)
    console.log(`PR #${d.number}  ${d.state}  merged=${d.mergedAt ?? "-"}  files=${d.changedFiles}  +${d.additions}/-${d.deletions}  ${d.title}`)
  } catch {
    console.log(`PR #${n} raw:`, (out + err).trim().slice(0, 200))
  }
}
