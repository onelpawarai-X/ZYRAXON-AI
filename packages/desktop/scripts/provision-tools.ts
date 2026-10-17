#!/usr/bin/env bun
// Copyright (c) 2026 onelpawarai. All rights reserved.
//
// Provisions the bundled media toolchain (ffmpeg + ffprobe) into
// packages/desktop/resources/bin so every packaged app ships them offline.
//
// Resolution order mirrors the runtime: an existing runnable binary in
// resources/bin wins and skips the network. Otherwise this downloads the
// matching static release for the current OS and architecture, verifies it
// runs, and places it in resources/bin without ever touching the managed data
// directory used for the runtime fall-back download.

import { $ } from "bun"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import https from "node:https"
import { fileURLToPath } from "node:url"

const SOURCE = fileURLToPath(import.meta.url)
const BIN_DIR = path.resolve(path.dirname(SOURCE), "../resources/bin")

const EXE = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
const PROBE = process.platform === "win32" ? "ffprobe.exe" : "ffprobe"

function isRunnable(bin: string) {
  try {
    return Bun.spawnSync([bin, "-version"], { stdout: "ignore", stderr: "ignore" }).success
  } catch {
    return false
  }
}

/** Static build URL for the current platform, or null when unsupported. */
function source(): { url: string; archive: "tar.xz" | "zip" } | null {
  if (process.platform === "linux") {
    const arch = process.arch === "arm64" ? "arm64" : "amd64"
    return {
      url: `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${arch}-static.tar.xz`,
      archive: "tar.xz",
    }
  }
  if (process.platform === "darwin") {
    if (process.arch !== "arm64" && process.arch !== "x64") return null
    return { url: "https://evermeet.cx/ffmpeg/getrelease/zip", archive: "zip" }
  }
  if (process.platform === "win32") {
    if (process.arch !== "x64") return null
    return { url: "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", archive: "zip" }
  }
  return null
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (target: string, redirects = 0) => {
      if (redirects > 5) return reject(new Error("too many redirects"))
      https
        .get(target, (response) => {
          const status = response.statusCode ?? 0
          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume()
            return follow(response.headers.location, redirects + 1)
          }
          if (status !== 200) {
            response.resume()
            return reject(new Error(`download failed: HTTP ${status}`))
          }
          const file = fs.createWriteStream(dest)
          response.pipe(file)
          file.on("finish", () => file.close(() => resolve()))
          file.on("error", reject)
        })
        .on("error", reject)
    }
    follow(url)
  })
}

function findInTree(dir: string, name: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findInTree(full, name)
      if (nested) return nested
    } else if (entry.name === name) {
      return full
    }
  }
  return null
}

async function main() {
  fs.mkdirSync(BIN_DIR, { recursive: true })
  for (const name of [EXE, PROBE]) {
    const existing = path.join(BIN_DIR, name)
    if (fs.existsSync(existing) && isRunnable(existing)) {
      console.log(`[provision-tools] ${name} already bundled at ${existing}`)
      return
    }
  }

  const src = source()
  if (!src) {
    console.error(`[provision-tools] no static ffmpeg source for ${process.platform}/${process.arch}`)
    process.exit(1)
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zyraxon-tools-"))
  const archive = path.join(tmp, "ffmpeg-archive")
  try {
    console.log(`[provision-tools] downloading ${src.url} ...`)
    await download(src.url, archive)

    const extractDir = path.join(tmp, "extract")
    fs.mkdirSync(extractDir, { recursive: true })
    if (src.archive === "tar.xz") {
      await $`tar -xJf ${archive} -C ${extractDir}`
    } else if (process.platform === "win32") {
      await $`powershell -NoProfile -Command Expand-Archive -LiteralPath '${archive}' -DestinationPath '${extractDir}' -Force`
    } else {
      await $`unzip -o ${archive} -d ${extractDir}`
    }

    for (const name of [EXE, PROBE]) {
      const found = findInTree(extractDir, name)
      if (!found) {
        console.error(`[provision-tools] ${name} missing from ${src.url}`)
        process.exit(1)
      }
      const target = path.join(BIN_DIR, name)
      fs.copyFileSync(found, target)
      fs.chmodSync(target, 0o755)
      if (!isRunnable(target)) {
        fs.rmSync(target, { force: true })
        console.error(`[provision-tools] bundled ${name} is not runnable`)
        process.exit(1)
      }
      console.log(`[provision-tools] bundled ${name}`)
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

await main()