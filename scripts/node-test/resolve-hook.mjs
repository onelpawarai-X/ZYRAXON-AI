// Copyright (c) 2026 onelpawarai. All rights reserved.

import { existsSync, statSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

// The repository root is two levels above this file (scripts/node-test/).
const ROOT = pathToFileURL(dirname(fileURLToPath(import.meta.url)) + "/../../").pathname.replace(/\/$/, "")
const SRC_ROOTS = [`${ROOT}/packages/zyraxon/src`, `${ROOT}/packages/app/src`]

function isDir(p) {
  try { return statSync(p).isDirectory() } catch { return false }
}
function isFile(p) {
  try { return statSync(p).isFile() } catch { return false }
}

// Mirrors the repo tsconfig: "@zyraxon-ai/<pkg>/<sub>" -> packages/<pkg>/src/<sub>.
function workspacePath(specifier) {
  const m = /^@zyraxon-ai\/([^/]+)\/(.+)$/.exec(specifier)
  if (!m) return undefined
  return `${ROOT}/packages/${m[1]}/src/${m[2]}`
}

function tryPath(base) {
  const candidates = [base]
  // TypeScript sources are imported with `.js` specifiers across this repo, so
  // map that extension back onto the real `.ts`/`.tsx` file.
  if (base.endsWith(".js")) {
    candidates.push(base.slice(0, -3) + ".ts", base.slice(0, -3) + ".tsx")
  }
  candidates.push(
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  )
  for (const c of candidates) {
    if (isFile(c)) return pathToFileURL(c).href
  }
  return undefined
}

export async function resolve(specifier, context, next) {
  if (specifier === "bun:test") {
    return { url: new URL("./shim.mjs", import.meta.url).href, shortCircuit: true }
  }
  if (specifier === "@npmcli/config/lib/definitions/index.js") {
    return { url: new URL("./npmcli-definitions-shim.mjs", import.meta.url).href, shortCircuit: true }
  }
  if (specifier === "bun") {
    return { url: new URL("./bun-shim.mjs", import.meta.url).href, shortCircuit: true }
  }
  if (specifier === "bun:sqlite") {
    return { url: new URL("./bun-sqlite-shim.mjs", import.meta.url).href, shortCircuit: true }
  }
  if (specifier.startsWith("@/")) {
    for (const root of SRC_ROOTS) {
      const found = tryPath(`${root}/${specifier.slice(2)}`)
      if (found) return { url: found, shortCircuit: true }
    }
  }
  if (specifier.startsWith("@zyraxon-ai/")) {
    const mapped = workspacePath(specifier)
    if (mapped) {
      const found = tryPath(mapped)
      if (found) return { url: found, shortCircuit: true }
    }
  }
  if (specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) {
    const base = specifier.startsWith("/")
      ? specifier
      : fileURLToPath(new URL(specifier, context.parentURL))
    const found = tryPath(base)
    if (found) return { url: found, shortCircuit: true }
  }
  try {
    return await next(specifier, context)
  } catch (error) {
    // Bare specifiers (e.g. "@parcel/watcher/wrapper") sometimes point at a file
    // without an extension, which Node ESM refuses. Retry those through
    // node_modules with extension candidates. This only runs after the normal
    // resolution fails, so a package `exports` map keeps winning over a stray
    // same-named file in the package root.
    if (!specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("node:") && !specifier.startsWith("file:")) {
      const dirs = [fileURLToPath(new URL(".", context.parentURL)), ROOT]
      for (const dir of dirs) {
        const found = tryPath(`${dir}/node_modules/${specifier}`)
        if (found) return { url: found, shortCircuit: true }
      }
    }
    throw error
  }
}

// Prompt and asset files (.txt) are imported as string modules by the bundler.
// Node has no such loader, so serve their contents as a default export.
export async function load(url, context, next) {
  // `with { type: "file" }` imports are a bundler feature: the import resolves to
  // the asset's path. Node rejects the attribute, so hand back the URL directly.
  if (url.endsWith(".wasm")) {
    return { format: "module", shortCircuit: true, source: `export default ${JSON.stringify(url)}` }
  }
  if (url.endsWith(".txt") || url.endsWith(".md")) {
    const { readFile } = await import("node:fs/promises")
    const text = await readFile(fileURLToPath(url), "utf8")
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${JSON.stringify(text)}`,
    }
  }
  return next(url, context)
}
