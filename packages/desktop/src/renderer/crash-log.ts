let _fs: any = null
let _path: any = null

function getFs() {
  if (_fs === null) {
    try { _fs = window.require("fs") } catch {}
  }
  return _fs
}

function getPath() {
  if (_path === null) {
    try { _path = window.require("path") } catch {}
  }
  return _path
}

function getLogFile(): string {
  const p = getPath()
  if (!p) return ""
  return p.join(process.env.USERPROFILE || process.env.HOME || "", ".zyraxon", "log", "zyraxon.log")
}

function writeLog(level: string, source: string, msg: string, data?: any) {
  const ts = new Date().toISOString()
  const json = data !== undefined ? " " + JSON.stringify(data, null, 0) : ""
  const line = `[${ts}] [${level}] [${source}] ${msg}${json}\n`
  const fs = getFs()
  const p = getPath()
  if (fs && p) {
    try {
      const dir = p.join(process.env.USERPROFILE || process.env.HOME || "", ".zyraxon", "log")
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.appendFileSync(getLogFile(), line, "utf-8")
    } catch {}
  }
  if (level === "ERROR") {
    console.error(`[ZLOG] [${source}] ${msg}`, data ?? "")
  } else {
    console.log(`[ZLOG] [${source}] ${msg}`, data ?? "")
  }
}

export function zlog(source: string, msg: string, data?: any) {
  writeLog("INFO", source, msg, data)
}

export function zlogError(source: string, msg: string, error?: any) {
  let errData: any = error
  if (error instanceof Error) {
    errData = { message: error.message, stack: error.stack }
  }
  writeLog("ERROR", source, msg, errData)
}

export function zlogSection(title: string) {
  writeLog("SECTION", title, "═══════════════════════════════════════")
}
