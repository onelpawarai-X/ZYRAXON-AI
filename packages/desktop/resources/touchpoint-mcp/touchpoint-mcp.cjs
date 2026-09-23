#!/usr/bin/env node
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
// Priority: system PATH → ZYRAXON auto-installed → common locations
function findPython() {
    var isWin = process.platform === 'win32';
    var candidates = [];

    // 1. System PATH (fastest, most reliable)
    // Check 'python' first (often newer with pip packages), then python3, then py -3
    var sysCmds = isWin ? ['python', 'python3', 'py -3'] : ['python3', 'python'];
    for (var i = 0; i < sysCmds.length; i++) {
        var cmd = sysCmds[i];
        var baseCmd = cmd.split(' ')[0];
        var args = cmd.split(' ').slice(1).concat(['--version']);
        try {
            var out = execFileSync(baseCmd, args, { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
            var match = out.trim().match(/Python (\d+\.\d+)/);
            if (match) {
                var fullCmd = cmd;
                try {
                    if (isWin) {
                        var whereOut = execSync('where ' + baseCmd, { encoding: 'utf8', timeout: 2000 }).trim().split('\n')[0].trim();
                        if (whereOut) fullCmd = whereOut;
                    } else {
                        var whichOut = execSync('which ' + baseCmd, { encoding: 'utf8', timeout: 2000 }).trim();
                        if (whichOut) fullCmd = whichOut;
                    }
                } catch(e) {}
                process.stderr.write('[touchpoint-mcp] Found system Python: ' + fullCmd + ' (' + match[0] + ')\n');
                return fullCmd;
            }
        } catch(e) {}
    }

    // 2. ZYRAXON auto-installed Python (~/.zyraxon/python/)
    var zyraxonPython = path.join(os.homedir(), '.zyraxon', 'python');
    var localPy = isWin ? path.join(zyraxonPython, 'python.exe') : path.join(zyraxonPython, 'bin', 'python3');
    if (fs.existsSync(localPy)) {
        try {
            var out = execFileSync(localPy, ['--version'], { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
            if (out.trim().match(/Python/)) {
                process.stderr.write('[touchpoint-mcp] Found ZYRAXON Python: ' + localPy + '\n');
                return localPy;
            }
        } catch(e) {}
    }

    // 3. Common install locations (Windows)
    if (isWin) {
        var commonPaths = [
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
            path.join(process.env.ProgramFiles || '', 'Python312', 'python.exe'),
            path.join(process.env.ProgramFiles || '', 'Python311', 'python.exe'),
            'C:\\Python312\\python.exe',
            'C:\\Python311\\python.exe',
            'C:\\Python310\\python.exe',
        ];
        for (var j = 0; j < commonPaths.length; j++) {
            if (fs.existsSync(commonPaths[j])) {
                try {
                    var out = execFileSync(commonPaths[j], ['--version'], { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
                    if (out.trim().match(/Python/)) {
                        process.stderr.write('[touchpoint-mcp] Found Python: ' + commonPaths[j] + '\n');
                        return commonPaths[j];
                    }
                } catch(e) {}
            }
        }
    } else {
        // Common Unix locations
        var unixPaths = ['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3'];
        for (var k = 0; k < unixPaths.length; k++) {
            if (fs.existsSync(unixPaths[k])) {
                try {
                    var out = execFileSync(unixPaths[k], ['--version'], { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
                    if (out.trim().match(/Python/)) {
                        process.stderr.write('[touchpoint-mcp] Found Python: ' + unixPaths[k] + '\n');
                        return unixPaths[k];
                    }
                } catch(e) {}
            }
        }
    }

    return null;
}

var pythonCmd = findPython();
if (!pythonCmd) {
    process.stderr.write('[touchpoint-mcp] ERROR: Python not found anywhere!\n');
    process.stderr.write('[touchpoint-mcp] Install Python 3.10+ or let ZYRAXON auto-install it.\n');
    process.exit(1);
}

var env = Object.assign({}, process.env, {
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
