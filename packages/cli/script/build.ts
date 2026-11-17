#!/usr/bin/env bun
// Copyright (c) 2026 onelpawarai. All rights reserved.


import { $ } from "bun"
import { rm } from "fs/promises"
import path from "path"
import JavaScriptObfuscator from "javascript-obfuscator"
import { Script } from "@zyraxon-ai/script"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"
import pkg from "../package.json"
import { modelsData } from "./generate"

const dir = path.resolve(import.meta.dirname, "..")
const binary = "zyraxon"
process.chdir(dir)

await rm("dist", { recursive: true, force: true })

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const plugin = createSolidTransformPlugin()

// The desktop build has obfuscated its main and preload bundles for a while; the
// CLI shipped plain minified JavaScript. `bun build --compile` bakes the bundle
// into the executable, so the source is not a separate file the user can read,
// but the bytes are still JavaScript and a `strings` pass or a debugger shows
// every literal. Obfuscating the bundle before it is compiled closes that.
//
// The build therefore runs twice per target: once to a staging directory to
// produce the JavaScript, then obfuscated in place, then once more to compile
// the obfuscated entry. `ZYRAXON_OBFUSCATE=0` skips the middle step, which is
// what a sourcemap build wants.
const HEAVY_PROFILE = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
  identifierNamesGenerator: "hexadecimal",
  selfDefending: false,
} as const

// Control-flow flattening on a multi-megabyte chunk is quadratic in memory; the
// desktop build hit the same wall on its ~28 MB server bundle and dropped to a
// lighter profile there. String-array plus hex identifiers still leaves the file
// unreadable without the run having to hold two flattened copies in the heap.
const LIGHT_PROFILE = {
  compact: true,
  identifierNamesGenerator: "hexadecimal",
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
  rotateStringArray: true,
  simplify: true,
  selfDefending: false,
} as const

const HEAVY_PROFILE_LIMIT = 4 * 1024 * 1024

async function obfuscateStaged(stage: string) {
  let count = 0
  for await (const file of new Bun.Glob("**/*.js").scan({ cwd: stage })) {
    const full = path.join(stage, file)
    const code = await Bun.file(full).text()
    const profile = code.length > HEAVY_PROFILE_LIMIT ? LIGHT_PROFILE : HEAVY_PROFILE
    await Bun.write(full, JavaScriptObfuscator.obfuscate(code, profile).getObfuscatedCode())
    count++
  }
  console.log(`obfuscated ${count} bundle file(s)`)
}

const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "linux", arch: "x64", avx2: false },
  { os: "linux", arch: "arm64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl", avx2: false },
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "darwin", arch: "x64", avx2: false },
  { os: "win32", arch: "arm64" },
  { os: "win32", arch: "x64" },
  { os: "win32", arch: "x64", avx2: false },
]

// A release workflow builds one platform at a time, so --os narrows the full
// cross-compile list to the targets that belong in that platform's release.
const osFilter = process.argv.find((arg) => arg.startsWith("--os="))?.slice("--os=".length)

const targets = (singleFlag
  ? allTargets.filter((item) => {
      if (item.os !== process.platform || item.arch !== process.arch) return false
      if (item.avx2 === false) return baselineFlag
      return item.abi === undefined
    })
  : allTargets
).filter((item) => !osFilter || item.os === osFilter)

if (!skipInstall) await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`

for (const item of targets) {
  const target = [
    binary,
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi,
  ]
    .filter(Boolean)
    .join("-")
  const name = target.replace(binary, "cli")
  console.log(`building ${name}`)
  const common = {
    tsconfig: "./tsconfig.json",
    external: ["node-gyp"],
    format: "esm" as const,
    // The staged pass runs without `compile`, and without an explicit target it
    // defaults to the browser and rejects every `bun:…` and node builtin the CLI
    // legitimately uses. `compile` used to imply the target; naming it keeps both
    // passes bundling for the runtime the executable actually runs on.
    target: "bun" as const,
    minify: true,
    sourcemap: sourcemapsFlag ? ("linked" as const) : ("none" as const),
    splitting: true,
    define: {
      ZYRAXON_VERSION: `'${Script.version}'`,
      ZYRAXON_CLI_NAME: `'${binary}'`,
      ZYRAXON_MODELS_DEV: modelsData,
      ZYRAXON_CHANNEL: `'${Script.channel}'`,
      ZYRAXON_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "undefined",
      // FFF_LIBC selects the fff native lib variant: "musl" or "gnu".
      FFF_LIBC: item.os === "linux" ? `'${item.abi ?? "gnu"}'` : "undefined",
      ...(item.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify(item.abi ?? "glibc") } : {}),
    },
  }
  const obfuscate = process.env.ZYRAXON_OBFUSCATE !== "0"
  const stage = `./dist/.stage/${name}`
  let entry = "./src/index.ts"

  if (obfuscate) {
    // Splitting must be off for the obfuscated path. A split build emits the
    // entry plus relative chunks, and a compiled executable cannot resolve a
    // relative chunk path out of its embedded filesystem, so the second pass
    // would produce a binary that dies with "Cannot find module './chunk-….js'".
    // One bundle is also the stronger shape for obfuscation: there is no small
    // readable chunk sitting beside the obfuscated entry.
    const staged = await Bun.build({
      ...common,
      splitting: false,
      plugins: [plugin],
      entrypoints: ["./src/index.ts"],
      outdir: stage,
    })
    if (!staged.success) {
      for (const log of staged.logs) console.error(log)
      process.exit(1)
    }
    await obfuscateStaged(stage)
    entry = `${stage}/index.js`
  }

  const result = await Bun.build({
    ...common,
    splitting: obfuscate ? false : common.splitting,
    // The staged entry is already transformed and bundled, so the Solid plugin
    // must not run a second time over it.
    plugins: obfuscate ? [] : [plugin],
    entrypoints: [entry],
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: target.replace(binary, "bun") as Bun.Build.CompileTarget,
      outfile: `./dist/${name}/bin/${binary}`,
      execArgv: [`--user-agent=${binary}/${Script.version}`, "--use-system-ca", "--"],
      windows: {},
    },
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }

  if (obfuscate) await rm(stage, { recursive: true, force: true })

  await Bun.write(
    `./dist/${name}/package.json`,
    JSON.stringify(
      {
        name: `@zyraxon-ai/${name}`,
        version: Script.version,
        license: "MIT",
        repository: { type: "git", url: "git+https://github.com/onelpawarai-X/ZYRAXON-AI.git" },
        os: [item.os],
        cpu: [item.arch],
      },
      null,
      2,
    ),
  )
}
