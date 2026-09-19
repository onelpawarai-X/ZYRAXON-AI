#!/usr/bin/env node
// ZYRAXON Enhanced Touchpoint MCP — 35 tools, accessibility-based
var path = require('path');
var { spawn } = require('child_process');

var _dir = path.dirname(__filename || __dirname);
var runPy = path.join(_dir, 'run.py');
var libsDir = path.join(_dir, 'libs');

var pythonCmd = 'python';
try {
    var { execSync } = require('child_process');
    var whereOut = execSync('where python', { encoding: 'utf8', timeout: 3000 }).trim();
    if (whereOut) pythonCmd = whereOut.split('\n')[0].trim();
} catch {}

var env = Object.assign({}, process.env, {
    PYTHONPATH: libsDir + (process.env.PATHSEP || ';') + (process.env.PYTHONPATH || ''),
    TOUCHPOINT_MODE: process.env.TOUCHPOINT_MODE || 'no-vision'
});

var child = spawn(pythonCmd, [runPy].concat(process.argv.slice(2)), {
    stdio: 'inherit',
    env: env
});

child.on('exit', function(code) {
    process.exit(code || 0);
});
