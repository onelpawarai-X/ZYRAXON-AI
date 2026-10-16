// Copyright (c) 2026 onelpawarai. All rights reserved.
//
// ffmpeg provisioning for media normalization.
//
// Media normalization needs ffmpeg, but a user who installs the app should never
// have to install it by hand. Resolution order is: explicit override, a binary
// bundled with the app's resources, whatever is already on PATH, then a copy the
// app fetched into its own data directory. When none of those exist the app
// downloads a static build once and reuses it, mirroring the model download
// manager rather than asking the user to do anything.

import { execFileSync, spawnSync } from "child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import https from "node:https"
import { Effect } from "effect"
import { Global } from "@zyraxon-ai/core/global"

const EXE = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"

/** Directory the app manages for tools it fetches itself. */
function managedDir() {
  const dir = Global.Path.bin
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function isRunnable(bin: string) {
  try {
    return spawnSync(bin, ["-version"], { stdio: "ignore", timeout: 5000 }).status === 0
  } catch {
    return false
  }
}

/** PATH with the managed bin directory first, so plain `ffmpeg` calls find it. */
export function ffmpegPathEnv(): string {
  const dir = managedDir()
  const current = process.env.PATH ?? ""
  return current.split(path.delimiter).includes(dir) ? current : `${dir}${path.delimiter}${current}`
}

/** First runnable ffmpeg, or null when every location is empty. */
export function resolveFfmpegSync(): string | null {
  const override = process.env.ZYRAXON_FFMPEG_PATH
  if (override && isRunnable(override)) return override

  const resourceRoots = [
    process.env.ZYRAXON_RESOURCES_PATH,
    (process as unknown as { resourcesPath?: string }).resourcesPath,
    path.resolve(import.meta.dir, "../../../../desktop/resources"),
    path.resolve(import.meta.dir, "../../../desktop/resources"),
  ].filter((value): value is string => Boolean(value))
  for (const root of resourceRoots) {
    for (const bundled of [
      path.join(root, "ffmpeg", EXE),
      path.join(root, "ffmpeg", "bin", EXE),
      path.join(root, "bin", "ffmpeg", EXE),
      path.join(root, "bin", EXE),
    ]) {
      if (fs.existsSync(bundled) && isRunnable(bundled)) return bundled
    }
  }

  if (isRunnable("ffmpeg")) return "ffmpeg"

  const managed = path.join(managedDir(), EXE)
  if (fs.existsSync(managed) && isRunnable(managed)) return managed
  return null
}

/** Static build URL for the current platform, or null when unsupported. */
function staticBuildUrl(): { url: string; archive: "tar.xz" | "zip" } | null {
  if (process.platform === "linux") {
    const arch = process.arch === "arm64" ? "arm64" : "amd64"
    return { url: `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${arch}-static.tar.xz`, archive: "tar.xz" }
  }
  if (process.platform === "darwin") return { url: "https://evermeet.cx/ffmpeg/getrelease/zip", archive: "zip" }
  if (process.platform === "win32")
    return { url: "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", archive: "zip" }
  return null
}

/** Download a URL to a file, following redirects; kept small on purpose. */
const download = (url: string, dest: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
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
                return reject(new Error(`ffmpeg download failed: HTTP ${status}`))
              }
              const file = fs.createWriteStream(dest)
              response.pipe(file)
              file.on("finish", () => file.close(() => resolve()))
              file.on("error", reject)
            })
            .on("error", reject)
        }
        follow(url)
      }),
    catch: (error) => error,
  })

/** Extract the archive and move ffmpeg (and ffprobe when present) into place. */
function installFrom(archive: string, kind: "tar.xz" | "zip") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zyraxon-ffmpeg-"))
  if (kind === "tar.xz") execFileSync("tar", ["-xJf", archive, "-C", dir], { stdio: "ignore" })
  else if (process.platform === "win32")
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${dir}' -Force`], { stdio: "ignore" })
  else execFileSync("unzip", ["-o", archive, "-d", dir], { stdio: "ignore" })

  for (const name of [EXE, process.platform === "win32" ? "ffprobe.exe" : "ffprobe"]) {
    const found = findBinary(dir, name)
    if (!found) continue
    const target = path.join(managedDir(), name)
    fs.copyFileSync(found, target)
    fs.chmodSync(target, 0o755)
  }
  fs.rmSync(dir, { recursive: true, force: true })
  return path.join(managedDir(), EXE)
}

function findBinary(dir: string, name: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findBinary(full, name)
      if (nested) return nested
    } else if (entry.name === name) {
      return full
    }
  }
  return null
}

let cached: string | null | undefined

/**
 * Resolve ffmpeg, fetching a static build once when it is not already available.
 * Returns null when the platform has no known build or the download fails; the
 * caller then keeps the original media and the oversize guard still applies.
 */
export const ensureFfmpeg = Effect.fnUntraced(function* () {
  if (cached !== undefined) return cached
  const existing = resolveFfmpegSync()
  if (existing) return (cached = existing)

  const build = staticBuildUrl()
  if (!build) return (cached = null)

  const archive = path.join(os.tmpdir(), `zyraxon-ffmpeg-${Date.now()}.${build.archive}`)
  const result = yield* Effect.gen(function* () {
    yield* download(build.url, archive)
    const installed = installFrom(archive, build.archive)
    return installed
  }).pipe(Effect.catch(() => Effect.succeed(null)))
  try {
    fs.rmSync(archive, { force: true })
  } catch {}
  cached = result
  return result
})
