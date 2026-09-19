#!/usr/bin/env node
// ZYRAXON Cross-Platform MCP v2 — Node.js wrapper
var path = require('path');
var fs = require('fs');
var { execSync, spawn } = require('child_process');

var dir = __dirname;
var serverPy = path.join(dir, 'server.py');
var libsDir = path.join(dir, 'libs');

function findPython() {
  var candidates = ['python3', 'python', 'python3.12', 'python3.11', 'python3.10'];
  var sep = process.platform === 'win32' ? 'where' : 'which';
  for (var i = 0; i < candidates.length; i++) {
    try {
      var p = execSync(sep + ' ' + candidates[i], { encoding: 'utf8', timeout: 5000 }).trim().split('\n')[0].trim();
      if (p && p.length > 0) return p;
    } catch(e) {}
  }
  return null;
}

var python = findPython();
if (!python) {
  console.error('[zyraxon-cross-mcp-v2] Python not found. Install Python 3.10+');
  process.exit(1);
}

var env = Object.assign({}, process.env);
if (fs.existsSync(libsDir)) {
  env.PYTHONPATH = libsDir + (env.PYTHONPATH ? path.delimiter + env.PYTHONPATH : '');
}

var args = [serverPy].concat(process.argv.slice(2));
var child = spawn(python, args, {
  stdio: 'inherit',
  env: env
});

child.on('error', function(err) {
  console.error('[zyraxon-cross-mcp-v2] Error:', err.message);
  process.exit(1);
});

child.on('exit', function(code) {
  process.exit(code || 0);
});
