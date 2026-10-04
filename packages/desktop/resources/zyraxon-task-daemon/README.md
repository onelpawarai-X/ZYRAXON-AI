# ZYRAXON Daily Task Daemon

One file, Python 3.8+ standard library only. No pip install, no build step.

## What it does

ZYRAXON's own scheduler (`packages/desktop/src/main/daily-task-scheduler.ts`) can only deliver a
Daily Task to a renderer that already exists - its `ensureAppReady()` focuses an open window and
cannot start the app. So a task whose time passes while ZYRAXON is closed never fires on its own.

This daemon watches the same store the app owns, `<userData>/daily-tasks/tasks.json`, and when a
task becomes due it launches the **packaged** ZYRAXON app so the app's scheduler wakes up and
delivers it.

It does nothing else. It never runs prompts, never calls a model, never writes `lastRun` into the
task store, never sends IPC. The Electron main process remains the only thing that does the work -
the daemon only makes sure that process is alive at the right minute. It also defers to `lastRun`,
so a task the app already handled is never re-woken.

- One wake per task per due slot, recorded in `daemon-state.json`. Editing a task's time re-arms it.
- Poll interval adapts: it sleeps until the due minute instead of burning a poll, capped at 25s.
- Corrupt or half-written `tasks.json` is retried, never fatal (the app writes the file
  non-atomically, so a partial read is a normal transient state).
- Missing / non-packaged app is logged once and retried later; no marker is written, so the task
  stays armed.
- `daemon.lock` keeps a single instance alive; a lock whose owner died is reclaimed automatically.

## Install

Copy this folder somewhere stable (next to the app is fine) and point your OS autostart at
`zyraxon_task_daemon.py`. Use `pythonw.exe` (Windows) or a service/agent (macOS, Linux) so no
console ever appears.

### Windows

```powershell
$daemon = "$env:LOCALAPPDATA\Programs\ZYRAXON Task Daemon"   # wherever you copied the folder
$startup = [Environment]::GetFolderPath('Startup')
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut("$startup\ZYRAXON Task Daemon.lnk")
$sc.TargetPath = "C:\Python312\pythonw.exe"                  # your pythonw.exe
$sc.Arguments = "`"$daemon\zyraxon_task_daemon.py`""
$sc.Save()
```

Equivalent one-liner (runs at logon, no console):

```powershell
schtasks /create /tn "ZYRAXON Task Daemon" /sc onlogon /rl limited `
  /tr "`"C:\Python312\pythonw.exe`" `"$daemon\zyraxon_task_daemon.py`"" /f
```

### macOS

`~/Library/LaunchAgents/ai.zyraxon.task-daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Label</key><string>ai.zyraxon.task-daemon</string>
  <key>ProgramArguments</key>
  <array><string>/usr/local/bin/python3</string><string>/path/to/zyraxon_task_daemon.py</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/zyraxon-task-daemon.out</string>
  <key>StandardErrorPath</key><string>/tmp/zyraxon-task-daemon.err</string>
</dict></plist>
```

```bash
launchctl load ~/Library/LaunchAgents/ai.zyraxon.task-daemon.plist   # or: launchctl bootstrap gui/$UID <plist>
```

Needs a real Python 3: `/usr/bin/python3` only exists with the Xcode command line tools.

### Linux

`~/.config/systemd/user/zyraxon-task-daemon.service`:

```ini
[Unit]
Description=ZYRAXON Daily Task Daemon

[Service]
ExecStart=/usr/bin/python3 %h/.local/share/zyraxon-task-daemon/zyraxon_task_daemon.py
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now zyraxon-task-daemon
loginctl enable-linger "$USER"    # only if it must run with nobody logged in
```

## Uninstall

```powershell
# Windows
schtasks /delete /tn "ZYRAXON Task Daemon" /f
Remove-Item "$([Environment]::GetFolderPath('Startup'))\ZYRAXON Task Daemon.lnk"
```
```bash
# macOS
launchctl unload ~/Library/LaunchAgents/ai.zyraxon.task-daemon.plist
rm ~/Library/LaunchAgents/ai.zyraxon.task-daemon.plist

# Linux
systemctl --user disable --now zyraxon-task-daemon
rm ~/.config/systemd/user/zyraxon-task-daemon.service
```

Then delete the daemon folder. That also removes `daemon.log`, `daemon-state.json` and
`daemon.lock`. The task store is never touched.

## Options

| Flag | Default | Meaning |
| --- | --- | --- |
| `--user-data <dir>` | resolved | override `<userData>` (also `ZYRAXON_USER_DATA`) |
| `--app <path>` | resolved | full path to the packaged executable (also `ZYRAXON_APP_PATH`) |
| `--app-arg=<value>` | - | extra app argument, repeatable; use `=` for values starting with `-` |
| `--interval <s>` | `25` | max seconds between checks |
| `--once` | off | single pass, then exit |
| `--dry-run` | off | log the launch command instead of running it |
| `--debug` / `--console` / `--hidden` | off | verbose / also log to stdout / hide the console window |

`<userData>` defaults to `<appData>/<appId>`, matching `index.ts`: `ai.zyraxon.desktop`,
`.beta` or `.dev` depending on build channel, under `%APPDATA%`, `~/Library/Application Support`
or `${XDG_CONFIG_HOME:-~/.config}`. The first channel whose `daily-tasks` directory exists wins,
otherwise `ai.zyraxon.desktop`.

## Packaging as a Windows exe (optional)

```powershell
pyinstaller --onefile --noconfirm --name ZYRAXONTaskDaemon `
  --windows-console-mode=hide --distpath dist --workpath build `
  zyraxon_task_daemon.py
```

`--windows-console-mode=hide` gives a GUI-subsystem binary with no console at all; `--hidden` does
the same job when running from source. A frozen build writes its log, state and lock next to the
exe instead of next to `__file__`.

## Files it writes

All in this folder, all safe to delete:

- `daemon.log` - rotating, 1 MiB x 2. This is the only output; stdout stays empty.
- `daemon-state.json` - wake markers, pruned after 14 days.
- `daemon.lock` - single-instance lock with the owner pid, removed on clean exit.
