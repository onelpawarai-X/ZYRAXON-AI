#!/usr/bin/env node
// ZYRAXON Enhanced Touchpoint MCP — accessibility-based
// Fixed: better Python detection, faster startup, error reporting
var path = require('path');
var { spawn, execSync } = require('child_process');

var _dir = path.dirname(__filename || __dirname);
var runPy = path.join(_dir, 'run.py');
var libsDir = path.join(_dir, 'libs');

// Find Python — try multiple methods
var pythonCmd = null;
var pythonMethods = [
    function() { return execSync('where python3', { encoding: 'utf8', timeout: 2000 }).trim().split('\n')[0].trim(); },
    function() { return execSync('where python', { encoding: 'utf8', timeout: 2000 }).trim().split('\n')[0].trim(); },
    function() { return execSync('py -3', { encoding: 'utf8', timeout: 2000 }).trim(); },
];
for (var i = 0; i < pythonMethods.length; i++) {
    try { pythonCmd = pythonMethods[i](); if (pythonCmd) break; } catch(e) {}
}
if (!pythonCmd) pythonCmd = 'python';

// Verify Python works
try {
    execSync(pythonCmd + ' --version', { encoding: 'utf8', timeout: 3000 });
} catch(e) {
    process.stderr.write('[touchpoint-mcp] Python not found or broken: ' + e.message + '\n');
    process.exit(1);
}

var env = Object.assign({}, process.env, {
    PYTHONPATH: libsDir + (process.env.PATHSEP || ';') + (process.env.PYTHONPATH || ''),
    TOUCHPOINT_MODE: process.env.TOUCHPOINT_MODE || 'no-vision'
});

var child = spawn(pythonCmd, [runPy].concat(process.argv.slice(2)), {
    stdio: 'inherit',
    env: env
});

child.on('error', function(err) {
    process.stderr.write('[touchpoint-mcp] Spawn error: ' + err.message + '\n');
    process.exit(1);
});

child.on('exit', function(code) {
    process.exit(code || 0);
});
