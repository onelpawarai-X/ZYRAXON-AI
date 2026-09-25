import { existsSync, mkdirSync, appendFileSync } from "node:fs"
import { dirname } from "node:path"
import { homedir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

/**
 * Capture-only error/request logging. Every call is best-effort: it never
 * throws, never blocks the caller, and never affects request behavior.
 * Secrets (Authorization/token/apikey headers) are always redacted.
 * Path is resolved dynamically per platform so it works on Windows, macOS,
 * and Linux without any hardcoded paths.
 */

let initialized = false
let path = ""

function resolvePath(): string {
  const override = process.env.ZYRAXON_CAPTURE_LOG
  if (override && override.trim()) return override.trim()
  const home = homedir()
  if (process.platform === "win32") {
    const base = process.env.APPDATA ?? join(home, "AppData", "Roaming")
    return join(base, "zyraxon", "log", "capture-errors.log")
  }
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "zyraxon", "log", "capture-errors.log")
  }
  const data = process.env.XDG_DATA_HOME ?? join(home, ".local", "share")
  return join(data, "zyraxon", "log", "capture-errors.log")
}

function ensure() {
  if (initialized) return
  initialized = true
  try {
    path = resolvePath()
    const dir = dirname(path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  } catch {}
}

function safeStringify(value: unknown): string {
  try {
    const seen = new WeakSet()
    return JSON.stringify(
      value,
      (_key, item) => {
        if (typeof item === "bigint") return String(item)
        if (item && typeof item === "object") {
          if (seen.has(item)) return "[circular]"
          seen.add(item)
        }
        return item
      },
      2,
    )
  } catch {
    return String(value)
  }
}

function redact(value: string): string {
  return value.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, "$1[REDACTED]")
}

export function captureLog(scope: string, message: string, data?: Record<string, unknown>) {
  ensure()
  try {
    const record = {
      t: new Date().toISOString(),
      id: randomUUID().slice(0, 8),
      scope,
      message,
      ...(data ?? {}),
    }
    appendFileSync(path, safeStringify(record) + "\n", "utf8")
  } catch {}
}

export function captureRequestError(scope: string, input: { url?: string; headers?: Record<string, string> }, error: unknown) {
  const headers = { ...(input.headers ?? {}) }
  for (const h of ["authorization", "x-api-key", "api-key", "token", "cookie"]) {
    if (headers[h]) headers[h] = "[REDACTED]"
  }
  captureLog(scope, "request error", {
    url: redact(String(input.url ?? "")),
    headers,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
  })
}

export function captureHttpStatus(
  scope: string,
  input: { url?: string; headers?: Record<string, string> },
  response: { status: number; statusText?: string; body?: string },
) {
  const headers = { ...(input.headers ?? {}) }
  for (const h of ["authorization", "x-api-key", "api-key", "token", "cookie"]) {
    if (headers[h]) headers[h] = "[REDACTED]"
  }
  captureLog(scope, "http response", {
    url: redact(String(input.url ?? "")),
    requestHeaders: headers,
    status: response.status,
    statusText: response.statusText ?? "",
    responseBody: response.body ? redact(response.body.slice(0, 4000)) : undefined,
  })
}