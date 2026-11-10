#!/usr/bin/env node
// Copyright (c) 2026 onelpawarai. All rights reserved.

// ZYRAXON Enhanced Touchpoint MCP — accessibility-based
// Fully dynamic Python detection — no hardcoded paths
var path = require('path');
var fs = require('fs');
var { spawn, execSync, execFileSync } = require('child_process');
var os = require('os');

var _dir = path.dirname(__filename || __dirname);
// zyraxon_touchpoint.py is the primary server (47 tools); run.py is the vendored fallback
var runPy = path.join(_dir, 'zyraxon_touchpoint.py');
if (!fs.existsSync(runPy)) runPy = path.join(_dir, 'run.py');
var libsDir = path.join(_dir, 'libs');

// ─── Dynamic Python Detection ─────────────────────────────────────
// The accessibility stack is what separates a working server from a red one, and
// it is not on every interpreter. A distro package like python3-gi installs
// `gi` into /usr/bin/python3 while a pyenv or Homebrew python3 earlier on PATH
// has none — picking the first `python3` then left the backend unavailable and
// every accessibility tool failed. Probe for the pieces and prefer the
// interpreter that has them.
function probe(pythonCmd, code) {
    try {
        execFileSync(pythonCmd, ['-c', code], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 8000 });
        return true;
    } catch (e) {
        return false;
    }
}

// What each platform's backend needs on top of the MCP runtime packages.
function accessibilityCode() {
    if (process.platform === 'win32') return 'import uiautomation';
    if (process.platform === 'darwin') return 'import ApplicationServices';
    return "import gi; gi.require_version('Atspi', '2.0'); from gi.repository import Atspi";
}

function hasRuntime(pythonCmd) {
    return probe(pythonCmd, 'import mcp.server.fastmcp, rapidfuzz, websocket, PIL, screeninfo');
}

function hasAccessibility(pythonCmd) {
    return probe(pythonCmd, accessibilityCode());
}

function which(cmd) {
    try {
        return execSync((process.platform === 'win32' ? 'where ' : 'which ') + cmd, {
            encoding: 'utf8',
            timeout: 2000,
        }).trim().split('\n')[0].trim();
    } catch (e) {
        return null;
    }
}

function collectCandidates() {
    var isWin = process.platform === 'win32';
    var names = isWin ? ['python', 'python3', 'py -3'] : ['python3', 'python'];
    var found = [];

    for (var i = 0; i < names.length; i++) {
        var parts = names[i].split(' ');
        var resolved = which(parts[0]);
        if (resolved) found.push(resolved);
    }

    var zyraxonPython = path.join(os.homedir(), '.zyraxon', 'python');
    found.push(isWin ? path.join(zyraxonPython, 'python.exe') : path.join(zyraxonPython, 'bin', 'python3'));

    if (isWin) {
        found = found.concat([
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
            path.join(process.env.ProgramFiles || '', 'Python312', 'python.exe'),
            path.join(process.env.ProgramFiles || '', 'Python311', 'python.exe'),
            'C:\\Python312\\python.exe',
            'C:\\Python311\\python.exe',
            'C:\\Python310\\python.exe',
        ]);
    } else {
        found = found.concat(['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3']);
    }

    // De-duplicate while keeping the order, and drop anything not executable.
    var seen = {};
    var unique = [];
    for (var j = 0; j < found.length; j++) {
        var candidate = found[j];
        if (!candidate || seen[candidate]) continue;
        seen[candidate] = true;
        try {
            if (fs.existsSync(candidate)) unique.push(candidate);
        } catch (e) {}
    }
    return unique;
}

function findPython() {
    var candidates = collectCandidates();

    // Best: everything the server needs, accessibility included.
    for (var i = 0; i < candidates.length; i++) {
        if (hasAccessibility(candidates[i])) {
            process.stderr.write('[touchpoint-mcp] Using Python with accessibility support: ' + candidates[i] + '\n');
            return candidates[i];
        }
    }

    // Next: at least the MCP runtime, so non-accessibility tools still answer.
    for (var k = 0; k < candidates.length; k++) {
        if (hasRuntime(candidates[k])) {
            process.stderr.write('[touchpoint-mcp] Using Python (no accessibility backend): ' + candidates[k] + '\n');
            return candidates[k];
        }
    }

    // Last resort: any interpreter at all; the self-heal below installs the
    // runtime packages and the backend reports its own reason if still missing.
    if (candidates.length > 0) {
        process.stderr.write('[touchpoint-mcp] Falling back to ' + candidates[0] + '\n');
        return candidates[0];
    }

    return null;
}

var pythonCmd = findPython();
if (!pythonCmd) {
    process.stderr.write('[touchpoint-mcp] ERROR: Python not found anywhere!\n');
    process.stderr.write('[touchpoint-mcp] Install Python 3.10+ or let ZYRAXON auto-install it.\n');
    process.exit(1);
}

// ─── Dependency self-heal ─────────────────────────────────────────
// The vendored libs/ tree is a win_amd64 install, so on Linux and macOS the
// server resolves mcp/pydantic_core from the platform interpreter. When that
// interpreter has never had the MCP SDK, `import mcp.server.fastmcp` dies and the
// server shows as failed with no explanation. Install the runtime packages the
// first time it happens so the server heals itself instead of staying red.
var RUNTIME_DEPS = ['mcp[cli]<2', 'rapidfuzz', 'websocket-client', 'Pillow', 'screeninfo'];

function depsPresent() {
    try {
        execFileSync(pythonCmd, ['-c', 'import mcp.server.fastmcp, rapidfuzz, websocket, PIL, screeninfo'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 8000
        });
        return true;
    } catch (e) {
        return false;
    }
}

function installDeps() {
    process.stderr.write('[touchpoint-mcp] MCP runtime packages missing — installing once\n');
    var pipCmds = [[pythonCmd, ['-m', 'pip']], ['pip3', []], ['pip', []]];
    for (var i = 0; i < pipCmds.length; i++) {
        try {
            execFileSync(pipCmds[i][0], pipCmds[i][1].concat(['install', '--quiet', '--disable-pip-version-check'].concat(RUNTIME_DEPS)), {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 300000
            });
            if (depsPresent()) return true;
        } catch (e) {}
    }
    return false;
}

if (!depsPresent()) installDeps();

var env = Object.assign({}, process.env, {
    TOUCHPOINT_MODE: process.env.TOUCHPOINT_MODE || 'no-vision'
});

var child = spawn(pythonCmd, [runPy].concat(process.argv.slice(2)), {
    stdio: 'inherit',
    // On Windows the spawned Python otherwise gets its own console window, which
    // both flashes on screen and outlives the host when it is detached. stdio
    // stays inherited so the MCP JSON-RPC stream reaches the parent untouched.
    windowsHide: true,
    env: env
});

child.on('error', function(err) {
    process.stderr.write('[touchpoint-mcp] Spawn error: ' + err.message + '\n');
    process.exit(1);
});

child.on('exit', function(code) {
    process.exit(code || 0);
});
