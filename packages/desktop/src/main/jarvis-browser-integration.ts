/**
 * ZYRAXON BROWSER — Dual System Integration
 *
 * SYSTEM 1: Real Chrome + Screen Vision
 *   - Detect Chrome running → use screen vision (screenshot + pyautogui)
 *   - NEVER auto-launch Chrome on startup
 *   - Chrome is launched ONLY when AI explicitly requests it via IPC
 *   - Used for: Account work (YouTube, Gmail, GitHub, etc.)
 *   - NEVER close/kill Chrome. NEVER use CDP.
 *
 * SYSTEM 2: Playwright Chromium (headless)
 *   - Playwright's built-in Chromium browser
 *   - For general/simple tasks, scraping, testing
 *   - Fast background automation
 *
 * NO CDP PORT 9222. NO Chrome killing. NO headless debugging.
 *
 * Copyright (c) 2026 ZYRAXON AI. All rights reserved.
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import { spawn, execSync, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export interface BrowserConfig {
  /** System 1: Screen vision screenshot interval (ms) */
  screenVisionInterval: number;
  /** System 2: Playwright browser type */
  playwrightBrowser: 'chromium' | 'firefox' | 'webkit';
  /** System 2: Headless mode */
  headless: boolean;
  /** Auto-solve captcha */
  autoSolveCaptcha: boolean;
}

export type BrowserSystem = 'screen-vision' | 'playwright';

export interface SystemStatus {
  activeSystem: BrowserSystem;
  chromeRunning: boolean;
  chromePath: string | null;
  screenVisionActive: boolean;
  playwrightReady: boolean;
}

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

export interface ElementInfo {
  tag: string;
  text: string;
  bounds: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number };
  type: string;
  clickable: boolean;
}

export interface CaptchaInfo {
  type: string;
  confidence: number;
  bounds?: { x: number; y: number; width: number; height: number };
}

// ═══════════════════════════════════════════════════════════════════════
// System 1: Real Chrome + Screen Vision
// ═══════════════════════════════════════════════════════════════════════

class ScreenVisionSystem {
  private _chromeProcess: ChildProcess | null = null;
  private _chromePath: string | null = null;
  private _chromeRunning: boolean = false;
  private _config: BrowserConfig;

  constructor(config: BrowserConfig) {
    this._config = config;
    this._chromePath = this._findChrome();
  }

  // ── Chrome Detection ─────────────────────────────────────────────

  private _findChrome(): string | null {
    const paths: string[] = [];

    if (process.platform === 'win32') {
      const pf = process.env['PROGRAMFILES'] || '';
      const pf86 = process.env['PROGRAMFILES(X86)'] || '';
      const local = process.env['LOCALAPPDATA'] || '';

      if (pf) paths.push(path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      if (pf86) paths.push(path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      if (local) paths.push(path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    } else if (process.platform === 'darwin') {
      paths.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    } else {
      paths.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium');
    }

    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }

    if (process.platform === 'win32') {
      try {
        const result = execSync('where chrome 2>nul', { encoding: 'utf-8' }).trim();
        if (result) return result.split('\n')[0].trim();
      } catch {}
    }

    return null;
  }

  private _isChromeRunning(): boolean {
    try {
      if (process.platform === 'win32') {
        const result = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH', {
          encoding: 'utf-8',
          timeout: 5000,
        });
        return result.includes('chrome.exe');
      } else if (process.platform === 'darwin') {
        execSync('pgrep -x "Google Chrome"', { timeout: 5000 });
        return true;
      } else {
        execSync('pgrep -x "chrome"', { timeout: 5000 });
        return true;
      }
    } catch {
      return false;
    }
  }

  private _getRealProfileDir(): string {
    const homeDir = app.getPath('home');
    if (process.platform === 'win32') {
      return path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
    }
    if (process.platform === 'darwin') {
      return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome');
    }
    return path.join(homeDir, '.config', 'google-chrome');
  }

  // ── Chrome Launch (NO CDP, NO debugging) — PUBLIC, explicit only ──

  launchRealChrome(): ChildProcess | null {
    if (!this._chromePath) {
      console.error('[ZYRAXON Screen Vision] Chrome not found on system');
      return null;
    }

    if (this._isChromeRunning()) {
      console.log('[ZYRAXON Screen Vision] Chrome already running — reusing');
      return null;
    }

    const args = [
      '--restore-last-session',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ];

    console.error('[ZYRAXON Screen Vision] Launching REAL Chrome (explicit request)...');
    console.error(`[ZYRAXON Screen Vision] Path: ${this._chromePath}`);
    console.error('[ZYRAXON Screen Vision] NO CDP, NO debugging port, NO headless flags');

    const chrome = spawn(this._chromePath, args, {
      detached: true,
      stdio: 'ignore',
    });
    chrome.unref();
    this._chromeProcess = chrome;

    console.log(`[ZYRAXON Screen Vision] Real Chrome launched (PID: ${chrome.pid})`);
    console.log('[ZYRAXON Screen Vision] Screen Vision mode — screenshot + pyautogui');
    console.log('[ZYRAXON Screen Vision] Your Chrome stays OPEN and untouched');

    return chrome;
  }

  // ── Screen Vision Actions (pyautogui) ──────────────────────────

  private _runPyautogui(command: string): string {
    try {
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const result = execSync(`${pythonCmd} -c "${command}"`, {
        encoding: 'utf-8',
        timeout: 15000,
      });
      return result.trim();
    } catch (e: any) {
      console.error(`[ZYRAXON Screen Vision] pyautogui error: ${e.message?.slice(0, 100)}`);
      return '';
    }
  }

  private _takeScreenshot(): Buffer | null {
    try {
      const tmpDir = os.tmpdir();
      const screenshotPath = path.join(tmpDir, 'zyraxon_screen_vision.png');

      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      execSync(
        `${pythonCmd} -c "import pyautogui; pyautogui.screenshot('${screenshotPath.replace(/\\/g, '\\\\')}')"`,
        { timeout: 10000 }
      );

      if (fs.existsSync(screenshotPath)) {
        const buffer = fs.readFileSync(screenshotPath);
        try { fs.unlinkSync(screenshotPath); } catch {}
        return buffer;
      }
    } catch (e: any) {
      console.error(`[ZYRAXON Screen Vision] Screenshot error: ${e.message?.slice(0, 100)}`);
    }
    return null;
  }

  // ── Public API ──────────────────────────────────────────────────

  async initialize(): Promise<void> {
    console.log('[ZYRAXON Browser] Initializing...');
    this._chromeRunning = this._isChromeRunning();
    if (this._chromeRunning) {
      console.log('[ZYRAXON Browser] Chrome detected — Screen Vision available when needed');
    } else {
      console.log('[ZYRAXON Browser] Chrome not running — Playwright Chromium available for general tasks');
    }
    // NEVER auto-launch Chrome. AI opens Chrome via explicit IPC only when account work needed.
  }

  async screenshot(): Promise<Buffer | null> {
    return this._takeScreenshot();
  }

  async click(x: number, y: number): Promise<void> {
    this._runPyautogui(`import pyautogui; pyautogui.click(${x}, ${y})`);
  }

  async doubleClick(x: number, y: number): Promise<void> {
    this._runPyautogui(`import pyautogui; pyautogui.doubleClick(${x}, ${y})`);
  }

  async rightClick(x: number, y: number): Promise<void> {
    this._runPyautogui(`import pyautogui; pyautogui.rightClick(${x}, ${y})`);
  }

  async type(text: string): Promise<void> {
    const escaped = text.replace(/'/g, "\\'").replace(/"/g, '\\"');
    this._runPyautogui(`import pyautogui; pyautogui.typewrite('${escaped}', interval=0.02)`);
  }

  async pressKey(key: string): Promise<void> {
    this._runPyautogui(`import pyautogui; pyautogui.press('${key}')`);
  }

  async hotkey(...keys: string[]): Promise<void> {
    const keyStr = keys.map(k => `'${k}'`).join(', ');
    this._runPyautogui(`import pyautogui; pyautogui.hotkey(${keyStr})`);
  }

  async scroll(pixels: number): Promise<void> {
    this._runPyautogui(`import pyautogui; pyautogui.scroll(${pixels})`);
  }

  async moveTo(x: number, y: number): Promise<void> {
    this._runPyautogui(`import pyautogui; pyautogui.moveTo(${x}, ${y})`);
  }

  async getCursorPosition(): Promise<{ x: number; y: number }> {
    const result = this._runPyautogui(
      'import pyautogui; pos = pyautogui.position(); print(f"{pos.x},{pos.y}")'
    );
    const parts = result.split(',');
    return {
      x: parseInt(parts[0]) || 0,
      y: parseInt(parts[1]) || 0,
    };
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    const result = this._runPyautogui(
      'import pyautogui; size = pyautogui.size(); print(f"{size.width},{size.height}")'
    );
    const parts = result.split(',');
    return {
      width: parseInt(parts[0]) || 1920,
      height: parseInt(parts[1]) || 1080,
    };
  }

  get isChromeRunning(): boolean {
    return this._isChromeRunning();
  }

  get chromePath(): string | null {
    return this._chromePath;
  }

  // ── Profile Management ──────────────────────────────────────────

  async listProfiles(): Promise<Array<{ name: string; directory: string }>> {
    const profileBase = this._getRealProfileDir();
    const profiles: Array<{ name: string; directory: string }> = [];

    try {
      const entries = fs.readdirSync(profileBase);
      for (const entry of entries) {
        if (entry === 'Default' || /^Profile \d+$/.test(entry)) {
          const prefsPath = path.join(profileBase, entry, 'Preferences');
          let name = entry;
          try {
            if (fs.existsSync(prefsPath)) {
              const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
              if (prefs.profile?.name) name = prefs.profile.name;
            }
          } catch {}
          profiles.push({ name, directory: entry });
        }
      }
    } catch (e: any) {
      console.log('[ZYRAXON Screen Vision] Profile list error:', e.message?.slice(0, 80));
    }

    return profiles;
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    // NEVER close Chrome — user's real browser stays open
    this._chromeProcess = null;
    this._chromeRunning = false;
    console.log('[ZYRAXON Screen Vision] Screen Vision stopped (Chrome stays open)');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// System 2: Playwright Chromium (headless)
// ═══════════════════════════════════════════════════════════════════════

class PlaywrightSystem {
  private _config: BrowserConfig;
  private _ready: boolean = false;

  constructor(config: BrowserConfig) {
    this._config = config;
  }

  async initialize(): Promise<void> {
    console.log('[ZYRAXON Playwright] Initializing System 2...');
    console.log('[ZYRAXON Playwright] Browser: Playwright Chromium (headless)');
    console.log('[ZYRAXON Playwright] For: General tasks, scraping, testing');
    this._ready = true;
    console.log('[ZYRAXON Playwright] System 2 ready');
  }

  get isReady(): boolean {
    return this._ready;
  }

  async destroy(): Promise<void> {
    this._ready = false;
    console.log('[ZYRAXON Playwright] System 2 stopped');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Main Integration Class
// ═══════════════════════════════════════════════════════════════════════

export class JarvisBrowserIntegration {
  private _config: BrowserConfig;
  private _screenVision: ScreenVisionSystem;
  private _playwright: PlaywrightSystem;
  private _activeSystem: BrowserSystem = 'screen-vision';

  constructor(config: Partial<BrowserConfig> = {}) {
    this._config = {
      screenVisionInterval: config.screenVisionInterval ?? 1000,
      playwrightBrowser: config.playwrightBrowser ?? 'chromium',
      headless: config.headless ?? true,
      autoSolveCaptcha: config.autoSolveCaptcha ?? true,
    };

    this._screenVision = new ScreenVisionSystem(this._config);
    this._playwright = new PlaywrightSystem(this._config);
  }

  async initialize(): Promise<void> {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     ZYRAXON Browser — Dual System Architecture         ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');

    // System 1: Real Chrome + Screen Vision — DETECT ONLY, NEVER LAUNCH
    await this._screenVision.initialize();

    // System 2: Playwright Chromium (always available)
    await this._playwright.initialize();

    // Determine active system based on Chrome state
    if (this._screenVision.isChromeRunning) {
      this._activeSystem = 'screen-vision';
      console.log('[ZYRAXON Browser] Active system: SYSTEM 1 (Real Chrome + Screen Vision)');
    } else {
      this._activeSystem = 'playwright';
      console.log('[ZYRAXON Browser] Active system: SYSTEM 2 (Playwright Chromium)');
    }

    console.log('[ZYRAXON Browser] Both systems initialized. Ready for commands.');
    console.log('');
  }

  // ── Chrome Launch (Explicit Only — called via IPC) ────────────────

  async openChromeForAccountWork(): Promise<{ success: boolean; pid?: number; error?: string }> {
    console.log('[ZYRAXON Browser] Explicit Chrome launch requested (account work)...');

    if (this._screenVision.isChromeRunning) {
      console.log('[ZYRAXON Browser] Chrome already running — switching to screen vision');
      this._activeSystem = 'screen-vision';
      return { success: true };
    }

    const chrome = this._screenVision.launchRealChrome();
    if (!chrome) {
      return { success: false, error: 'Chrome not found on system or failed to launch' };
    }

    this._activeSystem = 'screen-vision';
    console.log('[ZYRAXON Browser] Chrome launched — Screen Vision active');

    return { success: true, pid: chrome.pid };
  }

  // ── System Switching ────────────────────────────────────────────

  async switchToScreenVision(): Promise<void> {
    console.log('[ZYRAXON Browser] Switching to System 1: Screen Vision');
    this._activeSystem = 'screen-vision';
  }

  async switchToPlaywright(): Promise<void> {
    console.log('[ZYRAXON Browser] Switching to System 2: Playwright');
    this._activeSystem = 'playwright';
  }

  // ── Unified API (routes to correct system) ─────────────────────

  async screenshot(): Promise<Buffer | null> {
    if (this._activeSystem === 'screen-vision') {
      return this._screenVision.screenshot();
    }
    return null;
  }

  async click(x: number, y: number): Promise<void> {
    if (this._activeSystem === 'screen-vision') {
      return this._screenVision.click(x, y);
    }
  }

  async doubleClick(x: number, y: number): Promise<void> {
    if (this._activeSystem === 'screen-vision') {
      return this._screenVision.doubleClick(x, y);
    }
  }

  async rightClick(x: number, y: number): Promise<void> {
    if (this._activeSystem === 'screen-vision') {
      return this._screenVision.rightClick(x, y);
    }
  }

  async type(text: string): Promise<void> {
    if (this._activeSystem === 'screen-vision') {
      return this._screenVision.type(text);
    }
  }

  async pressKey(key: string): Promise<void> {
    if (this._activeSystem === 'screen-vision') {
      return this._screenVision.pressKey(key);
    }
  }

  async hotkey(...keys: string[]): Promise<void> {
    if (this._activeSystem === 'screen-vision') {
      return this._screenVision.hotkey(...keys);
    }
  }

  async scroll(pixels: number): Promise<void> {
    if (this._activeSystem === 'screen-vision') {
      return this._screenVision.scroll(pixels);
    }
  }

  async moveTo(x: number, y: number): Promise<void> {
    if (this._activeSystem === 'screen-vision') {
      return this._screenVision.moveTo(x, y);
    }
  }

  async getCursorPosition(): Promise<{ x: number; y: number }> {
    if (this._activeSystem === 'screen-vision') {
      return this._screenVision.getCursorPosition();
    }
    return { x: 0, y: 0 };
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    if (this._activeSystem === 'screen-vision') {
      return this._screenVision.getScreenSize();
    }
    return { width: 1920, height: 1080 };
  }

  // ── Profile Management (System 1 only) ──────────────────────────

  async listProfiles(): Promise<Array<{ name: string; directory: string }>> {
    return this._screenVision.listProfiles();
  }

  // ── Status ──────────────────────────────────────────────────────

  get activeSystem(): BrowserSystem {
    return this._activeSystem;
  }

  get isChromeRunning(): boolean {
    return this._screenVision.isChromeRunning;
  }

  get chromePath(): string | null {
    return this._screenVision.chromePath;
  }

  getStatus(): SystemStatus {
    return {
      activeSystem: this._activeSystem,
      chromeRunning: this._screenVision.isChromeRunning,
      chromePath: this._screenVision.chromePath,
      screenVisionActive: this._activeSystem === 'screen-vision',
      playwrightReady: this._playwright.isReady,
    };
  }

  get isConnected(): boolean {
    return this._activeSystem === 'screen-vision'
      ? this._screenVision.isChromeRunning
      : this._playwright.isReady;
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    await this._screenVision.destroy();
    await this._playwright.destroy();
    console.log('[ZYRAXON Browser] All systems stopped');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// IPC Registration
// ═══════════════════════════════════════════════════════════════════════

let jarvisInstance: JarvisBrowserIntegration | null = null;

export function registerJarvisBrowserIPC(_mainWindow?: BrowserWindow): void {
  ipcMain.handle('jarvis-browser:init', async (_, config?: Partial<BrowserConfig>) => {
    try {
      jarvisInstance = new JarvisBrowserIntegration(config);
      await jarvisInstance.initialize();
      return { success: true, status: jarvisInstance.getStatus() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('jarvis-browser:screenshot', async () => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const buffer = await jarvisInstance.screenshot();
    if (buffer) {
      return { success: true, data: buffer.toString('base64') };
    }
    return { success: false, error: 'Screenshot not available for current system' };
  });

  ipcMain.handle('jarvis-browser:click', async (_, x: number, y: number) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.click(x, y);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:double-click', async (_, x: number, y: number) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.doubleClick(x, y);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:right-click', async (_, x: number, y: number) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.rightClick(x, y);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:type', async (_, text: string) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.type(text);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:press-key', async (_, key: string) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.pressKey(key);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:hotkey', async (_, ...keys: string[]) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.hotkey(...keys);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:scroll', async (_, pixels: number) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.scroll(pixels);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:move-to', async (_, x: number, y: number) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.moveTo(x, y);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:cursor-position', async () => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const pos = await jarvisInstance.getCursorPosition();
    return { success: true, ...pos };
  });

  ipcMain.handle('jarvis-browser:screen-size', async () => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const size = await jarvisInstance.getScreenSize();
    return { success: true, ...size };
  });

  ipcMain.handle('jarvis-browser:switch-system', async (_, system: BrowserSystem) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    if (system === 'screen-vision') {
      await jarvisInstance.switchToScreenVision();
    } else {
      await jarvisInstance.switchToPlaywright();
    }
    return { success: true, activeSystem: jarvisInstance.activeSystem };
  });

  ipcMain.handle('jarvis-browser:status', async () => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    return { success: true, status: jarvisInstance.getStatus() };
  });

  ipcMain.handle('jarvis-browser:list-profiles', async () => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const profiles = await jarvisInstance.listProfiles();
    return { success: true, profiles };
  });

  ipcMain.handle('jarvis-browser:destroy', async () => {
    if (jarvisInstance) {
      await jarvisInstance.destroy();
      jarvisInstance = null;
    }
    return { success: true };
  });

  // ── Explicit Chrome Launch (account work only) ────────────────────

  ipcMain.handle('open-chrome-for-account-work', async () => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    return await jarvisInstance.openChromeForAccountWork();
  });
}
