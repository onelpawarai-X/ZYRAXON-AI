#!/usr/bin/env bun
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { $ } from "bun"
import { readdir, rm } from "node:fs/promises"

await rm("dist", { recursive: true, force: true })
await $`bunx tsc --emitDeclarationOnly`

const build = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "node",
  format: "esm",
  packages: "external",
})
if (!build.success) throw new AggregateError(build.logs, "Failed to build @zyraxon-ai/http-recorder")

const publicFiles = new Set(["index.js", "index.d.ts", "effect.d.ts", "socket.d.ts", "types.d.ts"])
await Promise.all(
  (await readdir("dist")).filter((file) => !publicFiles.has(file)).map((file) => rm(`dist/${file}`, { force: true })),
)
