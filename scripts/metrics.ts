// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Measure the project from git's index, which is far cheaper than walking the
 * working tree through the vendored dependency folders.
 */

const g = async (args: string[]) => {
  const p = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const [o, e] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()])
  await p.exited
  return o
}

const files = (await g(["ls-files"])).split("\n").filter(Boolean)
const isVendored = (p: string) => p.includes("node_modules/") || p.includes("/dist/") || p.startsWith("playwright-base/")
const own = files.filter((p) => !isVendored(p))
const code = own.filter((p) => /\.(ts|tsx|js|jsx|mjs|py|go|rs)$/.test(p))
const tests = own.filter((p) => /\.(test|spec)\.[tj]sx?$/.test(p) || /(^|\/)tests?\//.test(p))
const workflows = files.filter((p) => p.startsWith(".github/workflows/") && p.endsWith(".yml"))

const byKind = new Map<string, number>()
for (const p of code) {
  const top = p.split("/").slice(0, 2).join("/")
  byKind.set(top, (byKind.get(top) ?? 0) + 1)
}

console.log("=== scale ===")
console.log("tracked files (all)      ", files.length.toLocaleString())
console.log("  own source files       ", code.length.toLocaleString())
console.log("  test files             ", tests.length.toLocaleString())
console.log("  CI workflows           ", workflows.length)
console.log("  vendored/excluded      ", (files.length - own.length).toLocaleString())

console.log("\n=== own code by area ===")
for (const [k, v] of [...byKind].sort((a, b) => b[1] - a[1]).slice(0, 16)) console.log(`  ${String(v).padStart(5)}  ${k}`)

const vendorNodes = files.filter((p) => p.includes("resources/") && p.includes("node_modules/"))
console.log("\n=== vendored runtime ===")
console.log("  resources/node_modules ", vendorNodes.length.toLocaleString())

console.log("\n=== model layer (does it have its own brain?) ===")
for (const label of ["openai", "anthropic", "google", "ollama", "litellm", "groq", "openrouter"]) {
  const p = Bun.spawn(["git", "grep", "-l", "-i", label, "--", "packages", "*.ts"], { stdout: "pipe", stderr: "pipe" })
  const out = (await new Response(p.stdout).text()).split("\n").filter(Boolean)
  await new Response(p.stderr).text()
  await p.exited
  console.log(`  references ${label.padEnd(12)} ${out.length} files`)
}
