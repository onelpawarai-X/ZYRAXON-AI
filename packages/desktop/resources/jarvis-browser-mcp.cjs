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
var { spawn, execSync } = require('child_process');

// ─── Playwright MCP Launch (DEFAULT) ───────────────────────────────

function launchPlaywrightMCP(extraArgs) {
  var candidates = [
    path.join(__dirname, 'jarvis-browser', 'node_modules'),
    process.resourcesPath ? path.join(process.resourcesPath, 'jarvis-browser', 'node_modules') : null,
    path.join(__dirname, '..', 'node_modules'),
    path.join(__dirname, '..', '..', 'node_modules'),
    path.join(__dirname, '..', '..', '..', 'node_modules'),
    path.join(__dirname, '..', '..', '..', '..', 'node_modules'),
  ].filter(Boolean);

  var nodeModules = null;
  for (var i = 0; i < candidates.length; i++) {
    try {
      if (fs.existsSync(path.join(candidates[i], '@playwright', 'mcp', 'cli.js'))) {
        nodeModules = candidates[i];
        break;
      }
    } catch (e) {}
  }

  if (!nodeModules) {
    console.error('[ZYRAXON Browser] @playwright/mcp not found in any location');
    process.exit(1);
  }

  process.env.NODE_PATH = nodeModules;
  require('module').Module._initPaths();

  var cliPath = path.join(nodeModules, '@playwright', 'mcp', 'cli.js');

  var nodeExec = process.execPath;
  try {
    var possiblePaths = [
      path.join(process.env.APPDATA || '', 'nvm', 'current', 'node.exe'),
      path.join(process.env.ProgramFiles || '', 'nodejs', 'node.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'nodejs', 'node.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
    ];
    for (var i = 0; i < possiblePaths.length; i++) {
      if (possiblePaths[i] && fs.existsSync(possiblePaths[i])) { nodeExec = possiblePaths[i]; break; }
    }
    if (nodeExec === process.execPath) {
      var nodePath = execSync('where node', { encoding: 'utf8' }).trim().split('\n')[0].trim();
      if (nodePath && fs.existsSync(nodePath)) { nodeExec = nodePath; }
    }
  } catch (e) {}

  console.error('[ZYRAXON Browser] Launching Playwright Chromium (headless, background)...');
  console.error('[ZYRAXON Browser] This is the default browser for all general tasks');

  var child = spawn(nodeExec, [cliPath].concat(extraArgs), {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: Object.assign({}, process.env, { NODE_PATH: nodeModules }),
  });
  child.on('error', function(err) {
    console.error('[ZYRAXON Browser] Playwright error:', err.message);
  });
  child.on('exit', function(code) {
    process.exit(code || 0);
  });
  process.on('SIGTERM', function() { child.kill(); process.exit(0); });
  process.on('SIGINT', function() { child.kill(); process.exit(0); });
}

// ─── Main ──────────────────────────────────────────────────────────

var args = process.argv.slice(2);

console.error('');
console.error('╔══════════════════════════════════════════════════════════╗');
console.error('║      ZYRAXON Browser — Playwright Chromium (Default)   ║');
console.error('╚══════════════════════════════════════════════════════════╝');
console.error('');
console.error('[ZYRAXON Browser] Primary browser: Playwright Chromium (headless)');
console.error('[ZYRAXON Browser] For account work: AI opens real Chrome via PowerShell');
console.error('[ZYRAXON Browser] NEVER auto-launches Chrome');
console.error('');

launchPlaywrightMCP(args);
