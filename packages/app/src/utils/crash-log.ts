import { existsSync, mkdirSync, appendFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const LOG_DIR = join(homedir(), ".zyraxon", "log")
const LOG_FILE = join(LOG_DIR, "zyraxon.log")

function ensureLog() {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
  } catch {}
}

export function zlog(source: string, msg: string, data?: any) {
  try {
    ensureLog()
    const ts = new Date().toISOString()
    const json = data !== undefined ? " " + JSON.stringify(data, null, 0) : ""
    appendFileSync(LOG_FILE, `[${ts}] [${source}] ${msg}${json}\n`, "utf-8")
  } catch {}
  console.log(`[ZLOG] [${source}] ${msg}`, data ?? "")
}

export function zlogError(source: string, msg: string, error?: any) {
  try {
    ensureLog()
    const ts = new Date().toISOString()
    const errStr = error instanceof Error
      ? `${error.message}\n${error.stack}`
      : typeof error === "string" ? error : JSON.stringify(error)
    appendFileSync(LOG_FILE, `[${ts}] [ERROR] [${source}] ${msg}\n  → ${errStr}\n`, "utf-8")
  } catch {}
  console.error(`[ZLOG-ERROR] [${source}] ${msg}`, error)
}

export function zlogSection(title: string) {
  try {
    ensureLog()
    const ts = new Date().toISOString()
    appendFileSync(LOG_FILE, `\n${"═".repeat(70)}\n[${ts}] ${title}\n${"═".repeat(70)}\n`, "utf-8")
  } catch {}
  console.log(`[ZLOG] ===== ${title} =====`)
}
