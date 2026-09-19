#!/usr/bin/env node
// Nuphus MCP — ZYRAXON Desktop Automation (38 tools)
// Desktop: screenshot, window control, mouse, keyboard, clipboard, OCR, vision
// Browser: CDP Chrome control — navigate, snapshot, click, type, exec, cookies
// Bundled: nuphus-mcp.exe + ONNX runtime (no internet needed)
var path = require('path');
var fs = require('fs');
var { execFileSync } = require('child_process');

// Find the binary — try multiple paths
var possiblePaths = [
  path.join(__dirname, 'nuphus-mcp.exe'),
  path.join(__dirname, 'bin', 'nuphus-mcp.exe'),
];

// In packaged Electron app, __dirname might be inside asar
// Use process.resourcesPath as fallback
if (process.resourcesPath) {
  possiblePaths.push(path.join(process.resourcesPath, 'nuphus-mcp', 'nuphus-mcp.exe'));
  possiblePaths.push(path.join(process.resourcesPath, 'nuphus-mcp', 'bin', 'nuphus-mcp.exe'));
}

var binPath = null;
for (var i = 0; i < possiblePaths.length; i++) {
  if (fs.existsSync(possiblePaths[i])) {
    binPath = possiblePaths[i];
    break;
  }
}

if (!binPath) {
  console.error('[nuphus-mcp] Binary not found. Checked:', possiblePaths.join(', '));
  process.exit(1);
}

// Set working directory for ONNX models
process.env.NUPHUS_MODELS_DIR = process.env.NUPHUS_MODELS_DIR || 
  path.join(process.env.APPDATA || process.env.HOME || '.', 'Nuphus', 'models');

try {
  execFileSync(binPath, process.argv.slice(2), {
    stdio: 'inherit',
    env: Object.assign({}, process.env)
  });
} catch (e) {
  if (e.status) process.exit(e.status);
  console.error('[nuphus-mcp] Error:', e.message);
  process.exit(1);
}
