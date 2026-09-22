import initSqlJs from "sql.js"
import fs from "node:fs"
import { dirname } from "node:path"

const SQL = await initSqlJs()

function saveToFile(db, filename) {
  if (!filename || filename === ":memory:") return
  try {
    const dir = dirname(filename)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(filename, buffer)
  } catch (e) {
    console.error("[bun-sqlite-shim] save failed:", e?.message ?? e)
  }
}

class Statement {
  constructor(stmt, db) {
    this._stmt = stmt
    this._db = db
  }
  all(...params) {
    this._stmt.bind(params.length ? params : undefined)
    const rows = []
    while (this._stmt.step()) {
      rows.push(this._stmt.getAsObject())
    }
    this._stmt.reset()
    return rows
  }
  values(...params) {
    this._stmt.bind(params.length ? params : undefined)
    const rows = []
    while (this._stmt.step()) {
      rows.push(this._stmt.get())
    }
    this._stmt.reset()
    return rows
  }
  run(...params) {
    this._stmt.bind(params.length ? params : undefined)
    this._stmt.step()
    this._stmt.reset()
    return { changes: this._db.getRowsModified() }
  }
  safeIntegers() { return this }
}

class Database {
  constructor(filename, options) {
    this._filename = filename
    this._readonly = options?.readonly ?? false
    this._dirty = false
    this._saveTimer = null
    if (!filename || filename === ":memory:") {
      this._db = new SQL.Database()
    } else {
      let data = undefined
      try {
        if (fs.existsSync(filename)) {
          data = new Uint8Array(fs.readFileSync(filename))
        }
      } catch {}
      this._db = data ? new SQL.Database(data) : new SQL.Database()
    }
    if (!this._readonly) {
      try { this._db.run("PRAGMA journal_mode = WAL") } catch {}
    }
  }
  query(sql) {
    this._dirty = true
    this._scheduleSave()
    return new Statement(this._db.prepare(sql), this._db)
  }
  run(sql) {
    this._db.run(sql)
    this._dirty = true
    this._scheduleSave()
    return this
  }
  _scheduleSave() {
    if (this._saveTimer) return
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null
      if (this._dirty) {
        this._dirty = false
        saveToFile(this._db, this._filename)
      }
    }, 500)
  }
  close() {
    this._cancelTimer()
    saveToFile(this._db, this._filename)
    this._db.close()
  }
  _cancelTimer() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null }
  }
  serialize() {
    if (this._filename && this._filename !== ":memory:") {
      try {
        if (fs.existsSync(this._filename)) {
          return new Uint8Array(fs.readFileSync(this._filename))
        }
      } catch {}
    }
    return new Uint8Array(0)
  }
  loadExtension() {}
}

const _instances = new Set()

const OriginalDatabase = Database
const WrappedDatabase = function(filename, options) {
  const db = new OriginalDatabase(filename, options)
  if (filename && filename !== ":memory:") {
    _instances.add(db)
    const origClose = db.close.bind(db)
    db.close = function() {
      _instances.delete(db)
      origClose()
    }
  }
  return db
}
Object.setPrototypeOf(WrappedDatabase.prototype, OriginalDatabase.prototype)

function _saveAll() {
  for (const db of _instances) {
    try {
      if (db._dirty) {
        db._dirty = false
        saveToFile(db._db, db._filename)
      }
    } catch {}
  }
}

if (typeof process !== "undefined") {
  process.on("exit", _saveAll)
  process.on("SIGTERM", () => { _saveAll(); process.exit(0) })
  process.on("SIGINT", () => { _saveAll(); process.exit(0) })
  process.on("beforeExit", _saveAll)
  setInterval(_saveAll, 3000)
}

export { WrappedDatabase as Database }
