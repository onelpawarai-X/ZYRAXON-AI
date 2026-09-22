#!/usr/bin/env node
// Nuphus MCP — ZYRAXON Desktop Automation (38 tools)
// Desktop: screenshot, window control, mouse, keyboard, clipboard, OCR, vision
// Browser: CDP Chrome control — navigate, snapshot, click, type, exec, cookies
// Cross-platform: Windows, Linux x64, macOS ARM64
var path = require('path');
var fs = require('fs');
var { execFileSync } = require('child_process');

function findBinary() {
  var platform = process.platform;
  var arch = process.arch;

  if (platform === 'win32') {
    return findInPaths([
      path.join(__dirname, 'nuphus-mcp.exe'),
      path.join(__dirname, 'bin', 'nuphus-mcp.exe'),
      path.join(__dirname, 'win32-x64', 'nuphus-mcp.exe'),
    ]);
  }

  if (platform === 'linux') {
    return findInPaths([
      path.join(__dirname, 'linux-x64', 'nuphus-mcp'),
      path.join(__dirname, 'bin', 'nuphus-mcp'),
      path.join(__dirname, 'nuphus-mcp-linux'),
    ]);
  }

  if (platform === 'darwin') {
    var armPaths = [
      path.join(__dirname, 'osx-arm64', 'nuphus-mcp'),
    ];
    var x64Paths = [
      path.join(__dirname, 'osx-x64', 'nuphus-mcp'),
      path.join(__dirname, 'bin', 'nuphus-mcp'),
    ];
    return findInPaths(arch === 'arm64' ? armPaths : x64Paths.concat(armPaths));
  }

  console.error('[nuphus-mcp] Unsupported platform:', platform + '/' + arch);
  process.exit(1);
}

function findInPaths(paths) {
  for (var i = 0; i < paths.length; i++) {
    if (fs.existsSync(paths[i])) return paths[i];
  }
  return null;
}

function getLibraryDir(binPath) {
  var platform = process.platform;
  if (platform === 'win32') return null;
  if (platform === 'linux') return path.join(__dirname, 'linux-x64');
  if (platform === 'darwin') return path.join(__dirname, 'osx-arm64');
  return null;
}

var binPath = findBinary();
if (!binPath) {
  console.error('[nuphus-mcp] Binary not found for ' + process.platform + '/' + process.arch);
  process.exit(1);
}

// Set working directory for ONNX models
process.env.NUPHUS_MODELS_DIR = process.env.NUPHUS_MODELS_DIR ||
  path.join(process.env.APPDATA || process.env.HOME || '.', 'Nuphus', 'models');

// Set library path for Linux/Mac
var libDir = getLibraryDir(binPath);
if (libDir) {
  if (process.platform === 'linux') {
    process.env.LD_LIBRARY_PATH = libDir + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
  } else if (process.platform === 'darwin') {
    process.env.DYLD_LIBRARY_PATH = libDir + (process.env.DYLD_LIBRARY_PATH ? ':' + process.env.DYLD_LIBRARY_PATH : '');
  }
}

try {
  execFileSync(binPath, process.argv.slice(2), {
    stdio: 'inherit',
    env: Object.assign({}, process.env),
  });
} catch (e) {
  if (e.status) process.exit(e.status);
  console.error('[nuphus-mcp] Error:', e.message);
  process.exit(1);
}
