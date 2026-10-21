// Copyright (c) 2026 onelpawarai. All rights reserved.

// `@npmcli/config` is CommonJS and Node's ESM lexer cannot see its named exports,
// while Bun can. Re-export them through createRequire so the module graph loads.
import { createRequire } from "node:module"

const require = createRequire("/workspace/project/ZYRAXON-AI/package.json")
const mod = require("@npmcli/config/lib/definitions/index.js")

export const definitions = mod.definitions
export const flatten = mod.flatten
export const nerfDarts = mod.nerfDarts
export const shorthands = mod.shorthands
export const defaults = mod.defaults
export default mod
