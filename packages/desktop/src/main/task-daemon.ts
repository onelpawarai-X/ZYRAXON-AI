// Copyright (c) 2026 onelpawarai. All rights reserved.

import { execFile, spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { app, ipcMain } from "electron"

import { write } from "./logging"
import { ensurePython } from "./python-installer"
import type { TaskDaemonState } from "../preload/types"

const execFileAsync = promisify(execFile)

const root = dirname(fileURLToPath(import.meta.url))
const SCRIPT_NAME = "zyraxon_task_daemon.py"
// The daemon writes its lock, log and wake markers beside its own script, so only its
// sources are copied. Copying *.json here would clobber launcher.json on upgrade, and
// shipping *.json from the source tree would bake a developer's daemon-state.json - and
// therefore an already-fired task for the day - into every packaged install.
const RUNTIME_EXTENSIONS = [".py", ".txt", ".md"]
const LAUNCHER_FILE = "launcher.json"
const LOCK_FILE = "daemon.lock"
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
const RUN_VALUE = "ZYRAXONTaskDaemon"
const MAC_LABEL = "ai.zyraxon.task-daemon"
const LINUX_UNIT = "zyraxon-task-daemon"

// LOCK_SILENCE_SECONDS in zyraxon_task_daemon.py:91. The owner refreshes the lock on
// every pass and a pass is at most 25s, so 90s of silence means nobody is behind it.
const LOCK_SILENCE_MS = 90_000

let child: ChildProcess | null = null

/**
 * Copies the packaged daemon into a per-user, per-channel directory, registers it to
 * launch at logon and starts it. Runs on every packaged start, so a moved executable
 * or a changed interpreter re-registers itself without the user doing anything.
 */
export async function installTaskDaemon(resolvedPython?: string): Promise<TaskDaemonState> {
  if (!app.isPackaged) {
    write("task-daemon", "skipping install: app is not packaged")
    return { ...(await inspect()), supported: false, reason: "app is not packaged" }
  }

  if (!supportsAutostart()) {
    write("task-daemon", "skipping install: no autostart mechanism for this platform", { platform: process.platform })
    return { ...(await inspect()), supported: false, reason: `no ${process.platform} autostart mechanism` }
  }

  if (!existsSync(join(resourceDir(), SCRIPT_NAME))) {
    write("task-daemon", "packaged resources are missing the daemon script", { dir: resourceDir() }, "warn")
    return { ...(await inspect()), supported: false, reason: `${SCRIPT_NAME} not found in ${resourceDir()}` }
  }

  const launcher = launcherFor(resolvedPython ?? (await ensurePython()))
  const copied = copyRuntime()
  writeFileSync(join(installDir(), LAUNCHER_FILE), JSON.stringify({ launcher }, null, 2), "utf-8")
  const written = await register(launcher)
  const started = await startTaskDaemon()
  write("task-daemon", "installed", { copied, launcher, registrationWritten: written, pid: started.pid })
  return inspect()
}

export async function uninstallTaskDaemon(): Promise<TaskDaemonState> {
  await stopTaskDaemon()
  await unregister()
  rmSync(installDir(), { recursive: true, force: true })
  write("task-daemon", "uninstalled", { installDir: installDir() })
  return inspect()
}

export async function startTaskDaemon(): Promise<TaskDaemonState> {
  const script = installedScript()
  if (!existsSync(script)) return { ...(await inspect()), reason: `not installed: ${script} is missing` }
  if (child) return { ...(await inspect()), reason: "already started by this process" }

  const launcher = readLauncher()
  if (!launcher) return { ...(await inspect()), reason: "no recorded interpreter yet" }

  child = spawn(launcher, [script, ...daemonArgs()], {
    cwd: installDir(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })
  const pid = child.pid
  child.on("error", (error) => write("task-daemon", "spawn failed", { error: String(error) }, "warn"))
  child.on("exit", () => {
    child = null
  })
  child.unref()
  write("task-daemon", "started", { launcher, pid })
  // The daemon writes its lock a moment after start, so give it a beat before reporting
  // on it rather than answering "running: false" for a process that is already up.
  await sleep(1500)
  return inspect()
}

export async function stopTaskDaemon(): Promise<TaskDaemonState> {
  const pid = child?.pid ?? lockPid()
  if (!pid) return inspect()

  const killed = process.platform === "win32" ? await taskkill(pid) : signalTerm(pid)
  child = null
  write("task-daemon", "stopped", { pid, killed })
  return inspect()
}

export function registerTaskDaemonIpcHandlers() {
  ipcMain.handle("task-daemon:install", guarded(installTaskDaemon))
  ipcMain.handle("task-daemon:uninstall", guarded(uninstallTaskDaemon))
  ipcMain.handle("task-daemon:start", guarded(startTaskDaemon))
  ipcMain.handle("task-daemon:stop", guarded(stopTaskDaemon))
  ipcMain.handle("task-daemon:status", guarded(inspect))
}

function supportsAutostart() {
  return process.platform === "win32" || process.platform === "darwin" || process.platform === "linux"
}

async function inspect(): Promise<TaskDaemonState> {
  const script = installedScript()
  const pid = runningPid()
  const autostart = autostartTarget()
  return {
    supported: app.isPackaged && supportsAutostart(),
    installed: existsSync(script),
    registered: autostart !== null && (await isRegistered(autostart)),
    running: pid !== null,
    packaged: app.isPackaged,
    platform: process.platform,
    installDir: installDir(),
    tasksFile: tasksFile(),
    script: existsSync(script) ? script : null,
    python: readLauncher(),
    autostart,
    pid,
  }
}

function guarded(run: () => Promise<TaskDaemonState>) {
  return async (): Promise<TaskDaemonState> => {
    try {
      return await run()
    } catch (error) {
      write("task-daemon", "request failed", { error: String(error) }, "warn")
      return { ...(await inspect()), reason: String(error) }
    }
  }
}

// userData is keyed by appId (index.ts:148-152), so this directory is unique per channel.
// ~/.zyraxon is shared, and a dev install there would clobber the script the prod
// channel's own logon entry points at.
function installDir() {
  return join(app.getPath("userData"), "task-daemon")
}

function installedScript() {
  return join(installDir(), SCRIPT_NAME)
}

// daily-task-storage.ts:18-19 freezes TASKS_DIR at module load as
// <userData>/daily-tasks/tasks.json. That module is only ever reached through a dynamic
// import (index.ts:542, ipc.ts:932) which runs after index.ts:149 set the userData path,
// so passing this same directory as --user-data lands on the identical file the app owns.
function tasksFile() {
  return join(app.getPath("userData"), "daily-tasks", "tasks.json")
}

function resourceDir() {
  return app.isPackaged
    ? join(process.resourcesPath, "zyraxon-task-daemon")
    : join(root, "../../resources/zyraxon-task-daemon")
}

function copyRuntime(): string[] {
  const from = resourceDir()
  if (!existsSync(from)) return []
  mkdirSync(installDir(), { recursive: true })
  return readdirSync(from).filter((entry) => {
    if (!RUNTIME_EXTENSIONS.includes(extname(entry))) return false
    copyFileSync(join(from, entry), join(installDir(), entry))
    return true
  })
}

// pythonw.exe sits beside python.exe in the python.org embeddable build and in every
// python.org Windows install. It is the same interpreter without a console, which is
// what keeps a Run-key logon entry from flashing a window at every sign-in.
function launcherFor(python: string) {
  const preferred = join(dirname(python), process.platform === "win32" ? "pythonw.exe" : "python3")
  return existsSync(preferred) ? preferred : python
}

// --user-data is passed explicitly on every platform: the daemon does not read it from
// the app's environment, so leaving it out would make it guess a channel and watch the
// wrong store. --app is this build's own executable, which skips the daemon's per-
// platform discovery of a packaged install that may not be where it looks.
function daemonArgs() {
  return ["--user-data", app.getPath("userData"), "--app", process.execPath, "--hidden"]
}

function readLauncher(): string | null {
  return readStringField(join(installDir(), LAUNCHER_FILE), "launcher")
}

// The daemon publishes its own liveness: daemon.lock holds {pid, startedAt} and its owner
// touches it every pass (zyraxon_task_daemon.py:571, 576-581). Reading that heartbeat is
// both cheaper and more truthful than scraping the process table, and it needs no per-
// platform probing - notably process.kill(pid, 0), which on Windows can terminate the
// very process it is asked about. A lock that has gone quiet past the daemon's own
// threshold is debris it would steal itself (zyraxon_task_daemon.py:584-598), so it does
// not count as running here either.
function runningPid(): number | null {
  const pid = child?.pid ?? lockPid()
  if (!pid) return null
  const lock = join(installDir(), LOCK_FILE)
  if (!existsSync(lock)) return pid
  try {
    return Date.now() - statSync(lock).mtimeMs < LOCK_SILENCE_MS ? pid : null
  } catch {
    return null
  }
}

function lockPid(): number | null {
  const pid = readNumberField(join(installDir(), LOCK_FILE), "pid")
  return pid && pid > 0 ? pid : null
}

function readStringField(file: string, field: string): string | null {
  try {
    const value = (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)[field]
    return typeof value === "string" ? value : null
  } catch {
    return null
  }
}

function readNumberField(file: string, field: string): number | null {
  try {
    const value = (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)[field]
    return typeof value === "number" ? value : null
  } catch {
    return null
  }
}

async function register(launcher: string): Promise<boolean> {
  if (process.platform === "darwin") return registerDarwin(launcher)
  if (process.platform === "linux") return registerLinux(launcher)
  return registerWindows(launcher)
}

async function unregister(): Promise<void> {
  if (process.platform === "darwin") return unregisterDarwin()
  if (process.platform === "linux") return unregisterLinux()
  return unregisterWindows()
}

// Windows: one REG_SZ under HKCU needs no elevation, opens no console when it points at
// pythonw.exe, and is the one registration the NSIS uninstaller can take back by name.
async function registerWindows(launcher: string): Promise<boolean> {
  const command = `"${launcher}" "${installedScript()}" ${daemonArgs().map(quote).join(" ")}`
  if ((await readRunValue()) === command) return false
  await execFileAsync("reg.exe", ["add", RUN_KEY, "/v", RUN_VALUE, "/t", "REG_SZ", "/d", command, "/f"], {
    windowsHide: true,
  })
  return true
}

async function unregisterWindows(): Promise<void> {
  if (!(await readRunValue())) return
  await run("reg.exe", ["delete", RUN_KEY, "/v", RUN_VALUE, "/f"])
}

// macOS: a LaunchAgent is the only per-user mechanism launchd offers that runs outside a
// logged-in GUI session's app bundle, so it is what a "wake the app at 07:00" job needs.
async function registerDarwin(launcher: string): Promise<boolean> {
  const file = launchAgentPath()
  const contents = plistContents(launcher)
  const unchanged = existsSync(file) && readFileSync(file, "utf8") === contents
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents, "utf-8")
  if (unchanged) return false
  // Replacing the plist under a loaded job leaves launchd running the old command until
  // logout, so bounce it. bootout fails on the first run because nothing is loaded yet,
  // which is why it is not treated as a failure.
  await run("launchctl", ["bootout", launchdDomain(), file])
  await run("launchctl", ["bootstrap", launchdDomain(), file])
  return true
}

async function unregisterDarwin(): Promise<void> {
  const file = launchAgentPath()
  if (!existsSync(file)) return
  await run("launchctl", ["bootout", launchdDomain(), file])
  rmSync(file, { force: true })
}

// KeepAlive is keyed on SuccessfulExit=false rather than set to true: the daemon exits 0
// when it was asked to stop (zyraxon_task_daemon.py:204) and non-zero when it cannot run,
// so this restarts a crash without a bare KeepAlive=true turning any exit - including a
// clean one and a broken interpreter - into an endless respawn loop.
function plistContents(launcher: string) {
  const argv = [launcher, installedScript(), ...daemonArgs()]
  return `${[
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${MAC_LABEL}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...argv.map((value) => `    <string>${xml(value)}</string>`),
    "  </array>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <dict>",
    "    <key>SuccessfulExit</key>",
    "    <false/>",
    "  </dict>",
    // Keeps the agent out of Activity Monitor's foreground list and gives it the low
    // priority a background poller wants.
    "  <key>ProcessType</key>",
    "  <string>Background</string>",
    "  <key>StandardOutPath</key>",
    `  <string>${xml(join(installDir(), "daemon.out.log"))}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${xml(join(installDir(), "daemon.err.log"))}</string>`,
    "</dict>",
    "</plist>",
  ].join("\n")}\n`
}

function launchAgentPath() {
  return join(homedir(), "Library", "LaunchAgents", `${MAC_LABEL}.plist`)
}

function launchdDomain() {
  return `gui/${process.getuid?.() ?? 501}`
}

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Linux: a systemd user unit over ~/.config/autostart/*.desktop because the daemon is a
// long-lived poller, not a periodic job - so no timer. The desktop entry would start once
// per graphical login, die with the session and offer no restart policy, while the unit
// gives Restart=on-failure and a real systemctl --user lifecycle that matches the IPC
// surface, and can be kept alive headless with loginctl enable-linger.
async function registerLinux(launcher: string): Promise<boolean> {
  const file = unitPath()
  const contents = unitContents(launcher)
  const unchanged = existsSync(file) && readFileSync(file, "utf8") === contents
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents, "utf-8")
  if (unchanged) return false
  await run("systemctl", ["--user", "daemon-reload"])
  await run("systemctl", ["--user", "enable", "--now", LINUX_UNIT])
  return true
}

async function unregisterLinux(): Promise<void> {
  if (!existsSync(unitPath())) return
  await run("systemctl", ["--user", "disable", "--now", LINUX_UNIT])
  rmSync(unitPath(), { force: true })
  await run("systemctl", ["--user", "daemon-reload"])
}

function unitContents(launcher: string) {
  const argv = [launcher, installedScript(), ...daemonArgs()].map(unitEscape)
  return `${[
    "[Unit]",
    "Description=ZYRAXON Daily Task Daemon",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=${argv.join(" ")}`,
    // on-failure, not always: a clean exit is how the daemon is told to stop.
    "Restart=on-failure",
    "RestartSec=5",
    "",
    "[Install]",
    "WantedBy=default.target",
  ].join("\n")}\n`
}

function unitPath() {
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "systemd", "user", `${LINUX_UNIT}.service`)
}

// `%` opens a systemd specifier, so a literal one in a path has to be doubled or systemd
// expands it and the unit fails to parse.
function unitEscape(value: string) {
  const escaped = value.replace(/%/g, "%%")
  return escaped.includes(" ") ? `"${escaped.replace(/"/g, '\\"')}"` : escaped
}

function autostartTarget(): string | null {
  if (process.platform === "darwin") return launchAgentPath()
  if (process.platform === "linux") return unitPath()
  if (process.platform === "win32") return `${RUN_KEY}\\${RUN_VALUE}`
  return null
}

async function isRegistered(target: string): Promise<boolean> {
  if (process.platform === "win32") return (await readRunValue()) !== null
  return existsSync(target)
}

function quote(value: string) {
  return value.includes(" ") ? `"${value}"` : value
}

async function readRunValue(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("reg.exe", ["query", RUN_KEY, "/v", RUN_VALUE], {
      encoding: "utf8",
      windowsHide: true,
    })
    return /REG_SZ\s+(.*)$/m.exec(stdout)?.[1]?.trim() ?? null
  } catch {
    // reg.exe exits non-zero when the value is absent, which is the normal first run.
    return null
  }
}

async function taskkill(pid: number): Promise<boolean> {
  return run("taskkill.exe", ["/PID", String(pid), "/T", "/F"])
}

function signalTerm(pid: number): boolean {
  try {
    process.kill(pid, "SIGTERM")
    return true
  } catch {
    return false
  }
}

async function run(command: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(command, args, { windowsHide: true })
    return true
  } catch {
    return false
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}