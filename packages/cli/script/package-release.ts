#!/usr/bin/env bun
// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Package the built CLI into the flat archives that `install` expects.
 *
 * The install script extracts an archive and then moves a file named `zyraxon`
 * out of the extraction directory, so each archive holds exactly one binary at
 * its root with no directory around it. The archive name carries the OS,
 * architecture, and any baseline or musl variant, which is how the install
 * script picks which one to download.
 */

import { $ } from "bun"
import { existsSync } from "node:fs"
import { rm } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const out = path.join(root, "release")

await rm(out, { recursive: true, force: true })
await $`mkdir -p ${out}`

const built = (await Array.fromAsync(
  new Bun.Glob("cli-*").scan({ cwd: path.join(root, "dist"), onlyFiles: false }),
)).sort()
if (built.length === 0) throw new Error("no CLI builds in dist; run the build first")

for (const dir of built) {
  const name = dir.replace(/^cli-/, "zyraxon-")
  const isLinux = name.startsWith("zyraxon-linux-")
  const compiled = ["zyraxon.exe", "zyraxon"]
    .map((file) => path.join(root, "dist", dir, "bin", file))
    .find(existsSync)
  if (!compiled) throw new Error(`${dir} has no compiled binary`)

  // A Windows build compiles to zyraxon.exe, but the install script moves a file
  // named zyraxon, so the copy that goes into the archive is renamed.
  const binary = await Bun.file(compiled).arrayBuffer()
  const archive = path.join(out, name + (isLinux ? ".tar.gz" : ".zip"))

  if (isLinux) {
    await Bun.Archive.write(archive, { zyraxon: binary }, { compress: "gzip", level: 9 })
  } else {
    // Bun.Archive only writes tar, and the install script unzips every asset that
    // is not Linux, so those go through the zip binary instead.
    await Bun.write(path.join(out, "zyraxon"), binary)
    await $`cd ${out} && zip -q -X -9 ${name}.zip zyraxon`
    await rm(path.join(out, "zyraxon"))
  }

  const { size } = await Bun.file(archive).stat()
  console.log(`${path.basename(archive)}  ${(size / 1024 / 1024).toFixed(1)} MB`)
}
