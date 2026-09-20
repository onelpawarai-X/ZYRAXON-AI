#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// ZYRAXON Browser MCP — Playwright Chromium (Primary Browser)
// ═══════════════════════════════════════════════════════════════════════
//
// DEFAULT: Playwright Chromium (headless, background)
//   - All general tasks, scraping, testing, browsing
//   - Captcha solving, all tools available
//   - Fast background automation
//
// ACCOUNT WORK: Real Chrome + Screen Vision
//   - AI opens real Chrome via PowerShell when needed
//   - Uses screenshots + pyautogui to interact
//   - NEVER auto-launch Chrome on app startup
//
// NO CDP. NO Chrome auto-launch. NO headless debugging.
// ═══════════════════════════════════════════════════════════════════════

var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');

function log(msg) {
  process.stderr.write('[ZYRAXON Browser] ' + msg + '\n');
}

// ─── Resolve @playwright/mcp/cli.js ──────────────────────────────

function findPlaywrightMCP() {
  var dir = __dirname;

  var candidates = [
    path.join(dir, 'jarvis-browser', 'node_modules'),
    path.join(dir, 'nuphus-mcp', 'node_modules'),
    path.join(dir, '..', 'jarvis-browser', 'node_modules'),
    path.join(dir, '..', 'node_modules'),
    path.join(dir, '..', '..', 'jarvis-browser', 'node_modules'),
    path.join(dir, '..', '..', 'node_modules'),
    path.join(dir, '..', '..', '..', 'jarvis-browser', 'node_modules'),
    path.join(dir, '..', '..', '..', 'node_modules'),
    path.join(dir, '..', '..', '..', '..', 'jarvis-browser', 'node_modules'),
    path.join(dir, '..', '..', '..', '..', 'node_modules'),
    path.join(dir, '..', '..', '..', '..', '..', 'jarvis-browser', 'node_modules'),
    path.join(dir, '..', '..', '..', '..', '..', 'node_modules'),
  ];

  if (process.resourcesPath) {
    candidates.unshift(
      path.join(process.resourcesPath, 'jarvis-browser', 'node_modules'),
    );
  }

  log('Searching for @playwright/mcp in ' + candidates.length + ' locations...');
  log('__dirname = ' + dir);

  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    try {
      var cliPath = path.join(candidate, '@playwright', 'mcp', 'cli.js');
      if (fs.existsSync(cliPath)) {
        var pwCore = path.join(candidate, 'playwright-core', 'package.json');
        var hasPwCore = fs.existsSync(pwCore);
        log('Found @playwright/mcp at: ' + candidate + ' (playwright-core: ' + hasPwCore + ')');
        return { nodeModules: candidate, cliPath: cliPath };
      }
    } catch (e) {}
  }

  log('ERROR: @playwright/mcp not found in any location');
  for (var j = 0; j < candidates.length; j++) {
    log('  Tried: ' + candidates[j]);
  }
  return null;
}

// ─── Resolve system Node.js executable ───────────────────────────

function findNodeExec() {
  var nodeExec = process.execPath;

  var possiblePaths = [
    path.join(process.env.APPDATA || '', 'nvm', 'current', 'node.exe'),
    path.join(process.env.ProgramFiles || '', 'nodejs', 'node.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'nodejs', 'node.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
  ];

  for (var i = 0; i < possiblePaths.length; i++) {
    try {
      if (possiblePaths[i] && fs.existsSync(possiblePaths[i])) {
        nodeExec = possiblePaths[i];
        break;
      }
    } catch (e) {}
  }

  if (nodeExec === process.execPath && process.platform === 'win32') {
    try {
      var { execSync } = require('child_process');
      var nodePath = execSync('where node', { encoding: 'utf8', timeout: 3000 })
        .trim().split('\n')[0].trim();
      if (nodePath && fs.existsSync(nodePath)) {
        nodeExec = nodePath;
      }
    } catch (e) {}
  }

  return nodeExec;
}

// ─── Playwright MCP Launch ───────────────────────────────────────

function launchPlaywrightMCP(extraArgs) {
  var result = findPlaywrightMCP();
  if (!result) {
    process.exit(1);
  }

  var nodeExec = findNodeExec();
  log('Using node: ' + nodeExec);
  log('Spawning Playwright MCP...');

  var fullArgs = [result.cliPath].concat(extraArgs);

  var child = spawn(nodeExec, fullArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { NODE_PATH: result.nodeModules }),
  });

  var startupTimeout = setTimeout(function () {
    log('ERROR: Child process did not exit within 5 seconds — it may be running normally (MCP server).');
  }, 5000);

  child.on('error', function (err) {
    clearTimeout(startupTimeout);
    log('ERROR: Failed to spawn node process: ' + err.message);
    log('  nodeExec: ' + nodeExec);
    log('  cliPath: ' + result.cliPath);
    process.exit(1);
  });

  child.on('exit', function (code, signal) {
    clearTimeout(startupTimeout);
    if (signal) {
      log('Child killed by signal: ' + signal);
    } else if (code !== 0) {
      log('Child exited with code: ' + code);
    }
    process.exit(code || 0);
  });

  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  process.on('SIGTERM', function () { child.kill(); process.exit(0); });
  process.on('SIGINT', function () { child.kill(); process.exit(0); });
  process.on('exit', function () { try { child.kill(); } catch (e) {} });
}

// ─── Main ────────────────────────────────────────────────────────

var args = process.argv.slice(2);

log('');
log('ZYRAXON Browser — Playwright Chromium (Default)');
log('Primary browser: Playwright Chromium (headless)');
log('Arguments: ' + args.join(' '));
log('');

launchPlaywrightMCP(args);
