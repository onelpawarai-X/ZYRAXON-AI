#!/usr/bin/env bun
// Copyright (c) 2026 onelpawarai. All rights reserved.
//
// Provisions the bundled media toolchain (ffmpeg + ffprobe) into
// packages/desktop/resources/bin so every packaged app ships them offline.
//
// Resolution order mirrors the runtime: an existing runnable binary in
// resources/bin wins and skips the network. Otherwise this downloads the
// matching static build for the current OS and architecture, verifies it runs,
// and places it in resources/bin without ever touching the managed data
// directory used for the runtime fall-back download.
//
// The source is the ffmpeg-static GitHub release: one release carries ffmpeg and
// ffprobe for every platform and architecture as raw binaries, so there is no
// archive to unpack and no per-OS download host. The two earlier sources each
// failed a different way: the Linux .tar.xz tripped PowerShell's Expand-Archive
// on Windows, and evermeet.cx answered 410 for its old alias and 429 when asked
// for ffmpeg and ffprobe back to back.

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import https from "node:https"
import { fileURLToPath } from "node:url"

const SOURCE = fileURLToPath(import.meta.url)
const BIN_DIR = path.resolve(path.dirname(SOURCE), "../resources/bin")

const EXE = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
const PROBE = process.platform === "win32" ? "ffprobe.exe" : "ffprobe"

const RELEASE = "b6.1.1"
const BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}`

function isRunnable(bin: string) {
  try {
    return Bun.spawnSync([bin, "-version"], { stdout: "ignore", stderr: "ignore" }).success
  } catch {
    return false
  }
}

/** The release asset for one binary on this platform, or null when unsupported. */
function asset(binary: "ffmpeg" | "ffprobe"): { url: string; name: string } | null {
  const platform = process.platform === "win32" ? "win32" : process.platform
  const arch = process.arch
  if (platform !== "linux" && platform !== "darwin" && platform !== "win32") return null
  // The release covers darwin arm64/x64, linux arm/arm64/ia32/x64 and win32 x64.
  if (platform === "win32" && arch !== "x64") return null
  if (platform === "darwin" && arch !== "arm64" && arch !== "x64") return null
  const name = `${binary}-${platform}-${arch}`
  return { url: `${BASE}/${name}`, name }
}

function downloadOnce(url: string, dest: string): Promise<void> {
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
            const error = new Error(`download failed: HTTP ${status}`) as Error & {
              status?: number
              retryAfter?: number
            }
            error.status = status
            const retryAfter = Number(response.headers["retry-after"])
            if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter
            return reject(error)
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

/** Download with retry, so a transient 5xx or a rate limit does not fail the build. */
async function download(url: string, dest: string): Promise<void> {
  const attempts = 4
  for (let n = 1; ; n++) {
    try {
      return await downloadOnce(url, dest)
    } catch (error) {
      const { status, retryAfter } = error as { status?: number; retryAfter?: number }
      const retryable = status === 429 || (status !== undefined && status >= 500)
      if (!retryable || n >= attempts) throw error
      const wait = (retryAfter ?? 5 * 2 ** (n - 1)) * 1000
      console.log(`[provision-tools] ${url} answered HTTP ${status}; retrying in ${wait / 1000}s (${n}/${attempts - 1})`)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}

async function main() {
  fs.mkdirSync(BIN_DIR, { recursive: true })

  for (const [binary, name] of [
    ["ffmpeg", EXE],
    ["ffprobe", PROBE],
  ] as const) {
    const target = path.join(BIN_DIR, name)
    if (fs.existsSync(target) && isRunnable(target)) {
      console.log(`[provision-tools] ${name} already bundled at ${target}`)
      continue
    }

    const src = asset(binary)
    if (!src) {
      console.error(`[provision-tools] no static ffmpeg build for ${process.platform}/${process.arch}`)
      process.exit(1)
    }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zyraxon-tools-"))
    try {
      const staged = path.join(tmp, src.name)
      console.log(`[provision-tools] downloading ${src.url} ...`)
      await download(src.url, staged)
      fs.copyFileSync(staged, target)
      fs.chmodSync(target, 0o755)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }

    if (!isRunnable(target)) {
      fs.rmSync(target, { force: true })
      console.error(`[provision-tools] bundled ${name} is not runnable`)
      process.exit(1)
    }
    console.log(`[provision-tools] bundled ${name}`)
  }
}

await main()
