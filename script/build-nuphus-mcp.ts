#!/usr/bin/env bun
/**
 * Build Nuphus MCP — Create wrapper script in resources/nuphus-mcp/
 * The wrapper uses npx to auto-download and run @nuphus/nuphus-mcp
 * No binary stored in resources — downloads on first run, cached by npm
 */
import path from "path"
import fs from "fs"

const ROOT = path.resolve(import.meta.dir, "..")
const RESOURCES = path.join(ROOT, "packages", "desktop", "resources")
const BUNDLE_DIR = path.join(RESOURCES, "nuphus-mcp")

async function main() {
  console.log("=== Building Nuphus MCP Wrapper ===")

  // Clean old bundle
  if (fs.existsSync(BUNDLE_DIR)) fs.rmSync(BUNDLE_DIR, { recursive: true })
  fs.mkdirSync(BUNDLE_DIR, { recursive: true })

  // Create wrapper — uses npx to auto-install and run
  // npx caches the package after first download, so subsequent runs are instant
  const wrapper = `#!/usr/bin/env node
// Nuphus MCP — ZYRAXON Desktop Automation (38 tools)
// Desktop: screenshot, window control, mouse, keyboard, clipboard, OCR, vision
// Browser: CDP Chrome control — navigate, snapshot, click, type, exec, cookies
// Auto-downloads on first run via npx (cached after that)
var { execFileSync } = require('child_process');

function findCmd(cmd) {
  try {
    var r = require('child_process').execSync('where ' + cmd, { encoding: 'utf8', timeout: 5000 });
    return r.trim().split('\\n')[0].trim();
  } catch { return null; }
}

var npx = findCmd('npx');
if (!npx) {
  var node = findCmd('node');
  if (node) {
    try {
      var npmGlobal = require('child_process').execSync('npm root -g', { encoding: 'utf8', timeout: 5000 }).trim();
      var nuphusBin = require('path').join(npmGlobal, '@nuphus', 'nuphus-mcp', 'bin.js');
      if (require('fs').existsSync(nuphusBin)) {
        execFileSync(node, [nuphusBin, ...process.argv.slice(2)], { stdio: 'inherit' });
        process.exit(0);
      }
    } catch {}
  }
  console.error('ERROR: npx not found. Install Node.js from https://nodejs.org');
  process.exit(1);
}

try {
  execFileSync(npx, ['-y', '@nuphus/nuphus-mcp', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: Object.assign({}, process.env)
  });
} catch (e) {
  if (e.status) process.exit(e.status);
  console.error('Nuphus MCP error:', e.message);
  process.exit(1);
}
`
  fs.writeFileSync(path.join(BUNDLE_DIR, "nuphus-mcp.cjs"), wrapper, "utf-8")

  console.log(`Bundle: ${BUNDLE_DIR}`)
  console.log(`Wrapper: nuphus-mcp.cjs`)
  console.log("=== Nuphus MCP Build Complete ===")
}

main().catch((err) => {
  console.error("Build failed:", err)
  process.exit(1)
})
