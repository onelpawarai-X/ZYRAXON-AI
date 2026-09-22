#!/usr/bin/env bun
/**
 * build-wrapper.ts — Final desktop build step
 *
 * package.json script chain:
 *   "prebuild": "bun ./scripts/prebuild.ts"   → copy-icons + copy-metainfo
 *   "build":    "bun ./scripts/build-wrapper.ts" → THIS FILE → electron-vite build
 *
 * This script:
 *   1. Ensures zyraxon dist/node/node.js exists (builds if missing)
 *   2. Copies zyraxon-web-ui.gen.ts into dist/node/
 *   3. Verifies web-ui build output exists (packages/app/dist)
 *   4. Runs electron-vite build
 */
import { $ } from "bun"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "../../..")
const zyraxonPkg = path.join(rootDir, "packages", "zyraxon")
const appPkg = path.join(rootDir, "packages", "app")

// Ensure heap limit
if (!process.env.NODE_OPTIONS?.includes("max-old-space-size")) {
  const current = process.env.NODE_OPTIONS ?? ""
  process.env.NODE_OPTIONS = `${current} --max-old-space-size=16384`.trim()
}
console.log(`[build-wrapper] NODE_OPTIONS=${process.env.NODE_OPTIONS}`)

// Step 1: Build zyraxon dist/node if missing
const zyraxonDistNode = path.join(zyraxonPkg, "dist", "node")
const nodeJsPath = path.join(zyraxonDistNode, "node.js")

if (!(await Bun.file(nodeJsPath).exists())) {
  console.log("[build-wrapper] node.js not found — building zyraxon dist/node...")
  await $`bun run script/build-node.ts`.cwd(zyraxonPkg)
  console.log("[build-wrapper] zyraxon dist/node built OK")
} else {
  console.log("[build-wrapper] zyraxon dist/node already exists")
}

// Step 2: Copy web-ui gen file
const srcWebUI = path.join(zyraxonPkg, "zyraxon-web-ui.gen.ts")
const dstWebUI = path.join(zyraxonDistNode, "zyraxon-web-ui.gen.ts")

if (await Bun.file(srcWebUI).exists()) {
  await Bun.write(dstWebUI, await Bun.file(srcWebUI).arrayBuffer())
  console.log("[build-wrapper] Copied zyraxon-web-ui.gen.ts to dist/node")
} else {
  // Also check the app package output
  const appWebUI = path.join(appPkg, "dist", "zyraxon-web-ui.gen.ts")
  if (await Bun.file(appWebUI).exists()) {
    await Bun.write(dstWebUI, await Bun.file(appWebUI).arrayBuffer())
    console.log("[build-wrapper] Copied web-ui from app/dist to zyraxon/dist/node")
  } else {
    console.error("[build-wrapper] ERROR: zyraxon-web-ui.gen.ts not found in either location!")
    console.error("  Expected:", srcWebUI)
    console.error("  Or:", appWebUI)
    process.exit(1)
  }
}

// Step 3: Verify app build output exists
const appDistIndex = path.join(appPkg, "dist", "index.html")
if (!(await Bun.file(appDistIndex).exists())) {
  console.error("[build-wrapper] ERROR: packages/app/dist/index.html not found!")
  console.error("  Run 'bun run build' in packages/app first!")
  process.exit(1)
}
console.log("[build-wrapper] Verified packages/app/dist exists")

// Step 4: Run electron-vite build
console.log("[build-wrapper] Running electron-vite build...")
await $`electron-vite build`
console.log("[build-wrapper] Desktop build complete!")
