#!/usr/bin/env bun
/**
 * Builds the ZYRAXON server as a Bun-compatible ESM bundle.
 * Output: dist/node/node.js — imported by the desktop sidecar at runtime.
 */
import path from "path"
import { fileURLToPath } from "url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

// Fetch models.dev snapshot for provider catalog
const modelsUrl = process.env.ZYRAXON_MODELS_URL || "https://models.dev"
let modelsData = "({})"
try {
  const resp = await fetch(`${modelsUrl}/api.json`)
  if (resp.ok) {
    modelsData = await resp.text()
    console.log(`Loaded models.dev snapshot from ${modelsUrl}`)
  }
} catch (e) {
  console.warn(`Failed to fetch models.dev, using empty snapshot:`, e)
}

const plugin = createSolidTransformPlugin()
const treeSitterWorker = await Bun.file(
  fileURLToPath(import.meta.resolve("@opentui/core/parser.worker")),
).text()

const result = await Bun.build({
  target: "bun",
  conditions: ["bun", "node"],
  tsconfig: "./tsconfig.json",
  plugins: [plugin],
  external: ["node-gyp"],
  format: "esm",
  minify: false,
  sourcemap: "none",
  splitting: false,
  entrypoints: ["./src/node.ts"],
  outdir: "./dist/node",
  naming: "node.js",
  files: {
    "opentui-tree-sitter-worker.js": treeSitterWorker,
  },
  define: {
    ZYRAXON_VERSION: "'1.18.30'",
    ZYRAXON_MODELS_DEV: modelsData,
    ZYRAXON_CHANNEL: "'latest'",
    ZYRAXON_LIBC: "",
    OTUI_TREE_SITTER_WORKER_PATH: "/$bunfs/root/opentui-tree-sitter-worker.js",
    ZYRAXON_WORKER_PATH: "src/cli/tui/worker.ts",
    FFF_LIBC: '"gnu"',
  },
})

if (!result.success) {
  console.error("Build failed:")
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

const outPath = path.join(dir, "dist", "node", "node.js")
const stat = Bun.file(outPath)
console.log(`Server bundle: ${outPath} (${(await stat.size / 1024 / 1024).toFixed(1)} MB)`)
