import fs from "fs"
import path from "path"
import os from "os"

/**
 * Default project directory resolution + directory existence guard.
 * Single source of truth for where "Default Project" sessions live.
 */

export function defaultProjectDirectory(): string {
  const preferred = path.join(os.homedir(), "Documents", "Default Project")
  try {
    fs.mkdirSync(preferred, { recursive: true })
    return preferred
  } catch {}

  const fallbackData = path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
    "zyraxon",
    "projects",
    "default",
  )
  try {
    fs.mkdirSync(fallbackData, { recursive: true })
    return fallbackData
  } catch {}

  return process.cwd()
}

/**
 * Ensure a directory path exists on disk.
 * - If it exists: return it (after realpath resolve when possible).
 * - If missing: try mkdir recursive; on failure fall back to an existing path.
 * Never returns a dangling/nonexistent path.
 */
export function ensureDirectory(directory: string): string {
  if (!directory) return process.cwd()

  const resolved = (() => {
    try {
      return fs.realpathSync(path.resolve(directory))
    } catch {
      return path.resolve(directory)
    }
  })()

  try {
    if (fs.existsSync(resolved)) {
      try {
        return fs.realpathSync(resolved)
      } catch {
        return resolved
      }
    }
  } catch {}

  try {
    fs.mkdirSync(resolved, { recursive: true })
    try {
      return fs.realpathSync(resolved)
    } catch {
      return resolved
    }
  } catch {}

  // Creation failed (permissions, invalid drive, etc.) — fall back to a real path.
  try {
    if (fs.existsSync(process.cwd())) return process.cwd()
  } catch {}
  try {
    return fs.realpathSync(os.homedir())
  } catch {}
  return process.cwd()
}

/** True when the path points at an existing filesystem location. */
export function directoryExists(directory: string): boolean {
  try {
    return fs.existsSync(directory) && fs.statSync(directory).isDirectory()
  } catch {
    return false
  }
}
