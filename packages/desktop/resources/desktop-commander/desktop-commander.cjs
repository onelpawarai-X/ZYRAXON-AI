#!/usr/bin/env node
// ZYRAXON Desktop Commander — 9,503★ All-in-one desktop control
// Terminal, Files, Processes, Search, Edit, Docker, Excel, PDF, DOCX
// Cross-platform: Windows, Linux, macOS
var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');

var _dir = path.dirname(__filename || __dirname);
var distDir = path.join(_dir, 'dist');
var indexJs = path.join(distDir, 'index.js');

// Find Node.js executable
function findNode() {
  var candidates = ['node'];
  if (process.platform === 'win32') {
    try {
      var whereOut = require('child_process').execSync('where node', {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim().split('\n')[0].trim();
      if (whereOut && fs.existsSync(whereOut)) return whereOut;
    } catch (e) {}
  }
  return 'node';
}

// Check if dist/index.js exists
if (!fs.existsSync(indexJs)) {
  process.stderr.write('[desktop-commander] dist/index.js not found at: ' + indexJs + '\n');
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
