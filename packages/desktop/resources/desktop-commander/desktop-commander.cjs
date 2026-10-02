#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

// ZYRAXON Desktop Commander — 9,503★ All-in-one desktop control
// Terminal, Files, Processes, Search, Edit, Docker, Excel, PDF, DOCX
// Cross-platform: Windows, Linux, macOS
var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');

var _dir = path.dirname(__filename || __dirname);

// The built entrypoint lives inside the vendored package, not at ./dist — ./dist is
// gitignored, so a fresh checkout has no dist/ and this wrapper used to exit(1) on
// every platform. Check the vendored copy first, then the standalone build.
var CANDIDATE_ENTRIES = [
  path.join(_dir, 'node_modules', '@wonderwhy-er', 'desktop-commander', 'dist', 'index.js'),
  path.join(_dir, 'dist', 'index.js'),
];
var indexJs = CANDIDATE_ENTRIES.find(function (p) { return fs.existsSync(p); });

// Find Node.js executable
function findNode() {
  // In a packaged app there is no system node on PATH. The MCP loader already
  // resolved one and set ELECTRON_RUN_AS_NODE, so reuse it rather than re-probing.
  if (process.env.ELECTRON_RUN_AS_NODE === '1' && process.execPath) return process.execPath;
  var finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    var out = require('child_process').execSync(finder + ' node', {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim().split('\n')[0].trim();
    if (out && fs.existsSync(out)) return out;
  } catch (e) {}
  return 'node';
}

// Check that an entrypoint exists
if (!indexJs) {
  process.stderr.write('[desktop-commander] no entrypoint found. Looked in:\n  ' + CANDIDATE_ENTRIES.join('\n  ') + '\n');
  process.exit(1);
}

// Spawn node with dist/index.js, relay stdio
var nodeExe = findNode();
var child = spawn(nodeExe, [indexJs], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: Object.assign({}, process.env, {
    NODE_OPTIONS: '--experimental-vm-modules',
    DESKTOP_COMMANDER_NO_ANALYTICS: '1'
  }),
  cwd: _dir
});

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
process.stdin.pipe(child.stdin);

child.on('exit', function(code) {
  process.exit(code || 0);
});

process.on('SIGTERM', function() { child.kill('SIGTERM'); });
process.on('SIGINT', function() { child.kill('SIGINT'); });
