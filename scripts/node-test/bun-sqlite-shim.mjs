// Minimal stand-in for `bun:sqlite`. The handler under test never opens a
// database, so this only has to satisfy module loading, not real queries.
export class Database {
  constructor() {
    throw new Error("bun:sqlite is not available under the Node test shim")
  }
}
export class Statement {
  constructor() {
    throw new Error("bun:sqlite is not available under the Node test shim")
  }
}
export default { Database, Statement }
