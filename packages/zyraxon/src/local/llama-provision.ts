// Copyright (c) 2026 onelpawarai. All rights reserved.
//
// llama.cpp provisioning for the local model runtime.
//
// Running a GGUF model needs a `llama-server` binary and its shared libraries,
// but a user who installs the app should never have to build or install
// llama.cpp by hand. Resolution order mirrors ffmpeg provisioning: an explicit
// override, a copy bundled with the app's resources, whatever is already on
// PATH, then a copy the app fetched into its own data directory. When none of
// those exist the app downloads the matching official release once and reuses it
// (libraries are kept beside the binary, which the launcher points the loader at).

import { execFileSync } from "child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import https from "node:https"
import { Global } from "@zyraxon-ai/core/global"

const RELEASES_API = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
const EXE = process.platform === "win32" ? "llama-server.exe" : "llama-server"

/** Directory the app manages for tools it fetches itself. */
function managedRoot() {
  const dir = path.join(Global.Path.bin, "llama")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Resource folders that may already carry a bundled llama.cpp toolchain. */
function resourceRoots(): string[] {
  return [
    process.env.ZYRAXON_RESOURCES_PATH,
    (process as unknown as { resourcesPath?: string }).resourcesPath,
    path.resolve(import.meta.dir, "../../../../desktop/resources"),
    path.resolve(import.meta.dir, "../../../desktop/resources"),
  ].filter((value): value is string => Boolean(value))
}

function isRunnable(bin: string) {
  try {
    return fs.existsSync(bin)
  } catch {
    return false
  }
}

/** First existing llama-server, or null when every location is empty. */
export function resolveLlamaServerSync(): string | null {
  const override = process.env.ZYRAXON_LLAMA_SERVER_PATH
  if (override && isRunnable(override)) return override

  for (const root of resourceRoots()) {
    for (const bundled of [
      path.join(root, "llama", EXE),
      path.join(root, "bin", "llama", EXE),
      path.join(root, "bin", EXE),
    ]) {
      if (isRunnable(bundled)) return bundled
    }
  }

  const managed = path.join(managedRoot(), EXE)
  if (isRunnable(managed)) return managed
  return null
}

/** Static release asset name for the current platform, or null when unsupported. */
function assetName(build: string): string | null {
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  if (process.platform === "linux" && arch === "x64") return `llama-${build}-bin-ubuntu-x64.tar.gz`
  if (process.platform === "linux" && arch === "arm64") return `llama-${build}-bin-ubuntu-arm64.tar.gz`
  if (process.platform === "darwin") return `llama-${build}-bin-macos-${arch}.tar.gz`
  if (process.platform === "win32") return `llama-${build}-bin-win-cpu-${arch}.zip`
  return null
}

/** Fetch the latest release tag (e.g. `b11690`) from the GitHub API. */
async function latestBuild(): Promise<string | null> {
  try {
    const res = await fetch(RELEASES_API, { headers: { "user-agent": "zyraxon" } })
    if (!res.ok) return null
    const json = (await res.json()) as { tag_name?: string }
    return json.tag_name ?? null
  } catch {
    return null
  }
}

/** Download a URL to a file, following redirects. */
const download = (url: string, dest: string) =>
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
            return reject(new Error(`llama download failed: HTTP ${status}`))
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

/** Extract an archive and move the whole toolchain (binary + libraries) into place. */
function installFrom(archive: string, kind: "tar.gz" | "zip", build: string): string | null {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zyraxon-llama-"))
  try {
    if (kind === "tar.gz") execFileSync("tar", ["-xzf", archive, "-C", dir], { stdio: "ignore" })
    else if (process.platform === "win32")
      execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${dir}' -Force`], { stdio: "ignore" })
    else execFileSync("unzip", ["-o", archive, "-d", dir], { stdio: "ignore" })

    const foundDir = findBinaryDir(dir, EXE)
    if (!foundDir) return null
    const target = managedRoot()
    // Copy the released bin folder (binary plus its .so/.dylib/.dll siblings),
    // which is what the loader is later pointed at beside the executable.
    for (const entry of fs.readdirSync(foundDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      const from = path.join(foundDir, entry.name)
      const to = path.join(target, entry.name)
      fs.copyFileSync(from, to)
      fs.chmodSync(to, 0o755)
    }
    fs.writeFileSync(path.join(target, "BUILD"), `${build}\n`)
    return path.join(target, EXE)
  } catch {
    return null
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
}

/** Directory containing a file named `name`, searched recursively. */
function findBinaryDir(dir: string, name: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const full = path.join(dir, entry.name)
    if (fs.existsSync(path.join(full, name))) return full
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const nested = findBinaryDir(path.join(dir, entry.name), name)
    if (nested) return nested
  }
  return null
}

let inflight: Promise<string | null> | undefined

/**
 * Resolve llama-server, fetching the official static build once when it is not
 * already available. Returns null when the platform has no known build or the
 * download fails; callers then keep the plain "binary not found" path. Concurrent
 * callers share one download.
 */
export function ensureLlamaServer(): Promise<string | null> {
  const existing = resolveLlamaServerSync()
  if (existing) return Promise.resolve(existing)
  if (inflight) return inflight

  inflight = (async () => {
    const build = await latestBuild()
    if (!build) return null
    const name = assetName(build)
    if (!name) return null
    const kind: "tar.gz" | "zip" = name.endsWith(".zip") ? "zip" : "tar.gz"
    const url = `https://github.com/ggml-org/llama.cpp/releases/download/${build}/${name}`
    const archive = path.join(os.tmpdir(), `zyraxon-llama-${Date.now()}.${kind}`)
    try {
      await download(url, archive)
    } catch {
      return null
    }
    try {
      return installFrom(archive, kind, build)
    } finally {
      try {
        fs.rmSync(archive, { force: true })
      } catch {}
    }
  })().finally(() => {
    // Allow a retry later if this attempt failed.
    setTimeout(() => (inflight = undefined), 60_000)
  })
  return inflight
}
