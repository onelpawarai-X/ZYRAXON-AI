#!/usr/bin/env bun
/**
 * Build ZYRAXON Cross-Platform MCP v2 — Wrapper in resources/zyraxon-cross-mcp-v2/
 * Bundles server.py + libs/ + run.py for offline use (no pip install at runtime)
 */
import path from "path"
import fs from "fs"

const ROOT = path.resolve(import.meta.dir, "..")
const RESOURCES = path.join(ROOT, "packages", "desktop", "resources")
const BUNDLE_DIR = path.join(RESOURCES, "zyraxon-cross-mcp-v2")

async function main() {
  console.log("=== Building ZYRAXON Cross-Platform MCP v2 ===")

  if (!fs.existsSync(BUNDLE_DIR)) {
    console.error(`Bundle dir not found: ${BUNDLE_DIR}`)
    process.exit(1)
  }

  // Verify server.py exists
  if (!fs.existsSync(path.join(BUNDLE_DIR, "server.py"))) {
    console.error("server.py not found in bundle dir")
    process.exit(1)
  }

  // Verify run.py exists
  if (!fs.existsSync(path.join(BUNDLE_DIR, "run.py"))) {
    console.error("run.py not found in bundle dir")
    process.exit(1)
  }

  // Verify libs/ has key packages
  const libsDir = path.join(BUNDLE_DIR, "libs")
  if (!fs.existsSync(libsDir)) {
    console.error("libs/ directory not found — run: pip install fastmcp pyautogui Pillow psutil pygetwindow pyperclip plyer --target libs/")
    process.exit(1)
  }

  const requiredPkgs = ["mcp", "fastmcp", "pyautogui", "PIL", "psutil", "pyperclip", "pygetwindow", "httpx"]
  for (const pkg of requiredPkgs) {
    if (!fs.existsSync(path.join(libsDir, pkg))) {
      console.error(`Missing required package in libs/: ${pkg}`)
      process.exit(1)
    }
  }

  console.log(`Bundle: ${BUNDLE_DIR}`)
  console.log(`  server.py: ${fs.statSync(path.join(BUNDLE_DIR, "server.py")).size} bytes`)
  console.log(`  run.py: ${fs.statSync(path.join(BUNDLE_DIR, "run.py")).size} bytes`)
  console.log(`  libs/: ${fs.readdirSync(libsDir).length} packages`)
  console.log("=== ZYRAXON Cross-Platform MCP v2 Build Complete ===")
}

main().catch((err) => {
  console.error("Build failed:", err)
  process.exit(1)
})
