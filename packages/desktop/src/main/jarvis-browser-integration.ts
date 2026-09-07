/**
 * ZYRAXON BROWSER — Integration Module
 * Connects ZYRAXON to Jarvis Browser (real Chrome automation)
 * 10x faster than any human, undetectable, fully autonomous
 *
 * Copyright (c) 2026 ZYRAXON AI. All rights reserved.
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import { spawn, execSync, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';
import WebSocket from 'ws';

export interface JarvisConfig {
  port: number;
  userDataDir: string;
  headless: boolean;
  stealth: boolean;
  autoSolveCaptcha: boolean;
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

export class JarvisBrowserIntegration {
  private _chromeProcess: ChildProcess | null = null;
  private _wsConnection: WebSocket | null = null;
  private _config: JarvisConfig;
  private _connected: boolean = false;
  private _tabs: Map<string, TabInfo> = new Map();
  private _messageId: number = 0;
  private _pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map();
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempts: number = 0;
  private _maxReconnectAttempts: number = 10;
  private _reconnecting: boolean = false;

  private _getRealChromeProfileDir(): string {
    const homeDir = app.getPath('home')
    const platform = process.platform
    if (platform === 'win32') return path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
    if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome')
    return path.join(homeDir, '.config', 'google-chrome')
  }

  private _getDebugProfileDir(): string {
    return path.join(this._getRealChromeProfileDir(), 'ZYRAXON-Debug')
  }

  constructor(config: Partial<JarvisConfig> = {}) {
    const realChromeProfile = this._getRealChromeProfileDir()
    this._config = {
      port: config.port || 9222,
      userDataDir: config.userDataDir || realChromeProfile,
      headless: config.headless ?? false,
      stealth: config.stealth ?? true,
      autoSolveCaptcha: config.autoSolveCaptcha ?? true,
    };
  }

  async initialize(): Promise<void> {
    console.log('[Jarvis Browser] Initializing...');

    // Step 1: Try to connect to existing Chrome with debugging enabled
    if (await this._isDebuggingAvailable()) {
      console.log('[Jarvis Browser] Found Chrome with debugging enabled!');
      await this._connectWebSocket();
      if (this._config.stealth) await this._applyStealthMode();
      this._connected = true;
      console.log('[Jarvis Browser] Ready! Connected to real Chrome with all your logins.');
      return;
    }

    // Step 2: Chrome running WITHOUT debugging port
    // DO NOT KILL CHROME — instead, launch a SECOND Chrome with debugging + separate profile
    // User's original Chrome stays open with all tabs and logins
    if (this._isChromeRunning()) {
      console.log('[Jarvis Browser] Chrome running without debugging. Launching second instance with debugging enabled...');
      // Use a separate profile for the debugging instance so it doesn't conflict
      const debugProfile = this._getDebugProfileDir();
      const chromePath = this._findChrome();
      if (!chromePath) {
        throw new Error('Google Chrome not found.');
      }
      await this._launchChromeWithProfile(chromePath, debugProfile);
      await this._waitForChrome();
      await this._connectWebSocket();
      if (this._config.stealth) await this._applyStealthMode();
      this._connected = true;
      console.log('[Jarvis Browser] Ready! Connected to Chrome debug instance. Your main Chrome is untouched.');
      return;
    }

    // Step 3: Chrome not running — launch with debugging + default profile
    const chromePath = this._findChrome();
    if (!chromePath) {
      throw new Error('Google Chrome not found. Please install Chrome from https://www.google.com/chrome/');
    }

    console.log(`[Jarvis Browser] Found Chrome at: ${chromePath}`);
    await this._launchChrome(chromePath);
    await this._waitForChrome();
    await this._connectWebSocket();
    
    if (this._config.stealth) {
      await this._applyStealthMode();
    }

    this._connected = true;
    console.log('[Jarvis Browser] Ready! Connected to real Chrome with ALL your logins.');
  }

  private _findChrome(): string | null {
    const paths: string[] = [];
    
    if (process.platform === 'win32') {
      const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files';
      const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
      const local = process.env['LOCALAPPDATA'] || '';
      
      paths.push(
        path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      );
    } else if (process.platform === 'darwin') {
      paths.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    } else {
      paths.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium');
    }

    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private _isChromeRunning(): boolean {
    try {
      if (process.platform === 'win32') {
        const result = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH', { encoding: 'utf-8', timeout: 5000 });
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

  private async _isDebuggingAvailable(): Promise<boolean> {
    try {
      await new Promise<void>((resolve, reject) => {
        http.get(`http://127.0.0.1:${this._config.port}/json/version`, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try { JSON.parse(data); resolve(); } catch { reject(new Error('Invalid')); }
          });
        }).on('error', reject);
      });
      return true;
    } catch {
      return false;
    }
  }

  private async _gracefullyCloseChrome(): Promise<void> {
    console.log('[Jarvis Browser] Gracefully closing Chrome (saving state)...');
    try {
      if (process.platform === 'win32') {
        // Send WM_CLOSE to all Chrome windows — this saves tabs, cookies, session
        // Does NOT force kill — Chrome saves everything before closing
        try {
          execSync('powershell -Command "Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }"', {
            encoding: 'utf-8',
            timeout: 10000,
          });
        } catch {}

        // Wait up to 8 seconds for Chrome to close gracefully
        for (let i = 0; i < 16; i++) {
          await new Promise(r => setTimeout(r, 500));
          const result = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH', { encoding: 'utf-8', timeout: 3000 });
          if (!result.includes('chrome.exe')) {
            console.log('[Jarvis Browser] Chrome closed gracefully.');
            return;
          }
        }

        // If still running after 8 seconds, try again with Alt+F4 approach
        console.log('[Jarvis Browser] Chrome still running, trying Alt+F4...');
        try {
          execSync('powershell -Command "Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }"', {
            encoding: 'utf-8',
            timeout: 5000,
          });
        } catch {}

        await new Promise(r => setTimeout(r, 3000));
      } else if (process.platform === 'darwin') {
        execSync('osascript -e \'tell application "Google Chrome" to quit\'', { timeout: 10000 });
        await new Promise(r => setTimeout(r, 2000));
      } else {
        execSync('pkill -x chrome', { timeout: 10000 });
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e: any) {
      console.log('[Jarvis Browser] Graceful close note:', e.message?.slice(0, 100));
    }
  }

  private async _launchChrome(chromePath: string): Promise<void> {
    // Use user's real Chrome profile — preserves all logged-in accounts
    const args = [
      `--remote-debugging-port=${this._config.port}`,
      `--user-data-dir=${this._config.userDataDir}`,
      '--restore-last-session',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
      'about:blank',
    ];

    if (this._config.headless) {
      args.push('--headless=new');
    }

    this._chromeProcess = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
    });
    this._chromeProcess.unref();

    console.log(`[Jarvis Browser] Chrome launched with PID: ${this._chromeProcess.pid} (real profile, debugging on port ${this._config.port})`);
  }

  private async _launchChromeWithProfile(chromePath: string, profileDir: string): Promise<void> {
    // Launch Chrome with a separate profile + debugging port
    // This does NOT affect the user's main Chrome — it stays open with all tabs
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    const args = [
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${this._config.port}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
      'about:blank',
    ];

    if (this._config.headless) {
      args.push('--headless=new');
    }

    this._chromeProcess = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
    });
    this._chromeProcess.unref();

    console.log(`[Jarvis Browser] Chrome debug instance launched (PID: ${this._chromeProcess.pid}, profile: ${profileDir}, port: ${this._config.port})`);
    console.log(`[Jarvis Browser] NOTE: Your main Chrome is untouched. This is a separate debug instance.`);
  }

  private async _waitForChrome(timeout: number = 15000): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      try {
        await new Promise<void>((resolve, reject) => {
          http.get(`http://127.0.0.1:${this._config.port}/json/version`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                JSON.parse(data);
                resolve();
              } catch {
                reject(new Error('Invalid response'));
              }
            });
          }).on('error', reject);
        });
        console.log('[Jarvis Browser] Chrome is ready!');
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    throw new Error('Chrome did not start in time');
  }

  private async _connectWebSocket(): Promise<void> {
    const wsUrl = await this._getWebSocketUrl();
    console.log(`[Jarvis Browser] Connecting to WebSocket: ${wsUrl}`);
    
    return new Promise((resolve, reject) => {
      this._wsConnection = new WebSocket(wsUrl);
      
      this._wsConnection.on('open', () => {
        console.log('[Jarvis Browser] WebSocket connected!');
        this._reconnectAttempts = 0;
        this._reconnecting = false;
        resolve();
      });
      
      this._wsConnection.on('message', (data: { toString(): string }) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.id && this._pendingRequests.has(message.id)) {
            const pending = this._pendingRequests.get(message.id)!;
            this._pendingRequests.delete(message.id);
            if (message.error) {
              pending.reject(new Error(message.error.message));
            } else {
              pending.resolve(message.result);
            }
          }
        } catch (e) {}
      });
      
      this._wsConnection.on('close', () => {
        console.log('[Jarvis Browser] WebSocket disconnected.');
        if (this._connected && !this._reconnecting) {
          this._scheduleReconnect();
        }
      });
      
      this._wsConnection.on('error', (err) => {
        console.log('[Jarvis Browser] WebSocket error:', (err as Error).message?.slice(0, 80));
        if (!this._reconnecting) {
          reject(err);
        }
      });
    });
  }

  private async _scheduleReconnect(): Promise<void> {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.log('[Jarvis Browser] Max reconnection attempts reached. Disconnected.');
      this._connected = false;
      return;
    }
    
    this._reconnecting = true;
    this._reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts - 1), 30000);
    console.log(`[Jarvis Browser] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})...`);
    
    this._reconnectTimer = setTimeout(async () => {
      try {
        await this._connectWebSocket();
        console.log('[Jarvis Browser] Reconnected successfully!');
      } catch (e: any) {
        console.log('[Jarvis Browser] Reconnect failed:', e.message?.slice(0, 80));
        this._reconnecting = false;
        this._scheduleReconnect();
      }
    }, delay);
  }

  private async _getWebSocketUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${this._config.port}/json/version`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          const json = JSON.parse(data);
          resolve(json.webSocketDebuggerUrl);
        });
      }).on('error', reject);
    });
  }

  private async _sendCommand(method: string, params: any = {}): Promise<any> {
    if (!this._wsConnection || this._wsConnection.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Chrome');
    }

    const id = ++this._messageId;
    
    return new Promise((resolve, reject) => {
      this._pendingRequests.set(id, { resolve, reject });
      
      this._wsConnection!.send(JSON.stringify({ id, method, params }));
      
      setTimeout(() => {
        if (this._pendingRequests.has(id)) {
          this._pendingRequests.delete(id);
          reject(new Error(`Command ${method} timed out`));
        }
      }, 30000);
    });
  }

  private async _applyStealthMode(): Promise<void> {
    const stealthScript = `
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete navigator.__proto__.webdriver;
      
      window.chrome = {
        runtime: {},
        loadTimes: function() { return {}; },
        csi: function() { return {}; },
      };
      
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' },
        ],
      });
      
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    `;

    await this._sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: stealthScript,
    });
    
    console.log('[Jarvis Browser] Stealth mode applied');
  }

  async navigate(url: string): Promise<void> {
    await this._sendCommand('Page.navigate', { url });
    await this.waitForLoad();
  }

  async waitForLoad(timeout: number = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const result = await this._sendCommand('Runtime.evaluate', {
          expression: 'document.readyState',
        });
        if (result.result.value === 'complete') return;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async screenshot(fullPage: boolean = false): Promise<Buffer> {
    const result = await this._sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: fullPage,
    });
    return Buffer.from(result.data, 'base64');
  }

  async click(x: number, y: number): Promise<void> {
    await this._sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x, y, button: 'none', buttons: 0, modifiers: 0, force: 0,
    });
    await new Promise(resolve => setTimeout(resolve, 10));
    await this._sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'left', buttons: 1, modifiers: 0, clickCount: 1, force: 0.5,
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    await this._sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', buttons: 0, modifiers: 0, clickCount: 1, force: 0,
    });
  }

  async type(text: string): Promise<void> {
    for (const char of text) {
      await this._sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown', text: char, key: char, windowsVirtualKeyCode: char.charCodeAt(0),
      });
      await this._sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp', key: char, windowsVirtualKeyCode: char.charCodeAt(0),
      });
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  async evaluate(expression: string): Promise<any> {
    const result = await this._sendCommand('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result.result?.value;
  }

  async getElementAt(x: number, y: number): Promise<ElementInfo | null> {
    const result = await this.evaluate(`
      (() => {
        const el = document.elementFromPoint(${x}, ${y});
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return JSON.stringify({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().substring(0, 100) || '',
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
          type: el.tagName.toLowerCase(),
          clickable: el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button',
        });
      })()
    `);
    return result ? JSON.parse(result) : null;
  }

  async detectCaptcha(): Promise<CaptchaInfo> {
    const result = await this.evaluate(`
      (() => {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          const src = iframe.src || '';
          if (src.includes('recaptcha')) {
            const rect = iframe.getBoundingClientRect();
            return JSON.stringify({ type: 'recaptcha', confidence: 0.95, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
          }
          if (src.includes('hcaptcha')) {
            const rect = iframe.getBoundingClientRect();
            return JSON.stringify({ type: 'hcaptcha', confidence: 0.95, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
          }
          if (src.includes('cloudflare')) {
            const rect = iframe.getBoundingClientRect();
            return JSON.stringify({ type: 'turnstile', confidence: 0.9, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
          }
        }
        return JSON.stringify({ type: 'none', confidence: 0 });
      })()
    `);
    return JSON.parse(result);
  }

  async solveCaptcha(): Promise<boolean> {
    const captcha = await this.detectCaptcha();
    if (captcha.type === 'none') return true;

    if (captcha.type === 'recaptcha' && captcha.bounds) {
      await this.click(captcha.bounds.x + 28, captcha.bounds.y + 28);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return true;
    }

    if (captcha.type === 'turnstile' && captcha.bounds) {
      await this.click(captcha.bounds.x + 35, captcha.bounds.y + 35);
      await new Promise(resolve => setTimeout(resolve, 3000));
      return true;
    }

    return false;
  }

  async listTabs(): Promise<TabInfo[]> {
    const targets = await this._sendCommand('Target.getTargets');
    return targets.targetInfos
      .filter((t: any) => t.type === 'page')
      .map((t: any) => ({
        id: t.targetId,
        url: t.url,
        title: t.title,
        active: t.attached || false,
      }));
  }

  async createTab(url: string = 'about:blank'): Promise<string> {
    const result = await this._sendCommand('Target.createTarget', { url });
    return result.targetId;
  }

  async closeTab(targetId: string): Promise<void> {
    await this._sendCommand('Target.closeTarget', { targetId });
  }

  async switchTab(targetId: string): Promise<void> {
    await this._sendCommand('Target.activateTarget', { targetId });
  }

  async getPageContent(): Promise<string> {
    return await this.evaluate('document.documentElement.outerHTML') || '';
  }

  async getPageTitle(): Promise<string> {
    return await this.evaluate('document.title') || '';
  }

  async getCurrentUrl(): Promise<string> {
    return await this.evaluate('window.location.href') || '';
  }

  async scrollDown(pixels: number = 500): Promise<void> {
    await this._sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: 400, y: 300, deltaX: 0, deltaY: pixels, modifiers: 0,
    });
  }

  async scrollUp(pixels: number = 500): Promise<void> {
    await this._sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: 400, y: 300, deltaX: 0, deltaY: -pixels, modifiers: 0,
    });
  }

  async fillForm(selector: string, value: string): Promise<void> {
    await this.evaluate(`
      (() => {
        const el = document.querySelector('${selector}');
        if (el) {
          el.value = '${value.replace(/'/g, "\\'")}';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
  }

  async submitForm(selector: string): Promise<void> {
    await this.evaluate(`
      (() => {
        const el = document.querySelector('${selector}');
        if (el) el.submit();
      })()
    `);
  }

  async destroy(): Promise<void> {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._wsConnection) {
      this._wsConnection.close();
    }
    this._connected = false;
    this._reconnecting = false;
    this._chromeProcess = null;
    console.log('[Jarvis Browser] Disconnected from Chrome (browser stays open)');
  }

  async listProfiles(): Promise<Array<{name: string; directory: string}>> {
    const profileBase = this._getRealChromeProfileDir();
    const profiles: Array<{name: string; directory: string}> = [];
    
    try {
      // Chrome stores profiles in "Default", "Profile 1", "Profile 2", etc.
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
      console.log('[Jarvis Browser] Profile list error:', e.message?.slice(0, 80));
    }
    
    return profiles;
  }

  async switchProfile(profileDirectory: string): Promise<void> {
    if (this._connected) {
      this._wsConnection?.close();
      this._connected = false;
    }

    const chromePath = this._findChrome();
    if (!chromePath) throw new Error('Chrome not found');

    // Use a separate debug profile to avoid conflicting with running Chrome
    const debugProfile = this._getDebugProfileDir();
    if (!fs.existsSync(debugProfile)) {
      fs.mkdirSync(debugProfile, { recursive: true });
    }

    // Use a different port if Chrome is already running to avoid port conflict
    const port = this._isChromeRunning() ? this._config.port + 1 : this._config.port;
    this._config.port = port;

    const args = [
      `--user-data-dir=${debugProfile}`,
      `--remote-debugging-port=${port}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
      'about:blank',
    ];

    this._chromeProcess = spawn(chromePath, args, { detached: true, stdio: 'ignore' });
    this._chromeProcess.unref();

    await this._waitForChrome();
    await this._connectWebSocket();
    if (this._config.stealth) await this._applyStealthMode();
    this._connected = true;
    console.log(`[Jarvis Browser] Switched to debug profile (port ${port})`);
  }

  get isConnected(): boolean {
    return this._connected;
  }
}

let jarvisInstance: JarvisBrowserIntegration | null = null;

export function registerJarvisBrowserIPC(_mainWindow?: BrowserWindow): void {
  ipcMain.handle('jarvis-browser:init', async (_, config?: Partial<JarvisConfig>) => {
    try {
      jarvisInstance = new JarvisBrowserIntegration(config);
      await jarvisInstance.initialize();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('jarvis-browser:navigate', async (_, url: string) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.navigate(url);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:screenshot', async (_, fullPage?: boolean) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const buffer = await jarvisInstance.screenshot(fullPage);
    return { success: true, data: buffer.toString('base64') };
  });

  ipcMain.handle('jarvis-browser:click', async (_, x: number, y: number) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.click(x, y);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:type', async (_, text: string) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.type(text);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:evaluate', async (_, expression: string) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const result = await jarvisInstance.evaluate(expression);
    return { success: true, result };
  });

  ipcMain.handle('jarvis-browser:detect-captcha', async () => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const captcha = await jarvisInstance.detectCaptcha();
    return { success: true, captcha };
  });

  ipcMain.handle('jarvis-browser:solve-captcha', async () => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const solved = await jarvisInstance.solveCaptcha();
    return { success: true, solved };
  });

  ipcMain.handle('jarvis-browser:list-tabs', async () => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const tabs = await jarvisInstance.listTabs();
    return { success: true, tabs };
  });

  ipcMain.handle('jarvis-browser:list-profiles', async () => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const profiles = await jarvisInstance.listProfiles();
    return { success: true, profiles };
  });

  ipcMain.handle('jarvis-browser:switch-profile', async (_, profileDir: string) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.switchProfile(profileDir);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:create-tab', async (_, url?: string) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const tabId = await jarvisInstance.createTab(url);
    return { success: true, tabId };
  });

  ipcMain.handle('jarvis-browser:close-tab', async (_, tabId: string) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.closeTab(tabId);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:fill-form', async (_, selector: string, value: string) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    await jarvisInstance.fillForm(selector, value);
    return { success: true };
  });

  ipcMain.handle('jarvis-browser:get-element', async (_, x: number, y: number) => {
    if (!jarvisInstance) return { success: false, error: 'Not initialized' };
    const element = await jarvisInstance.getElementAt(x, y);
    return { success: true, element };
  });

  ipcMain.handle('jarvis-browser:destroy', async () => {
    if (jarvisInstance) {
      await jarvisInstance.destroy();
      jarvisInstance = null;
    }
    return { success: true };
  });
}
