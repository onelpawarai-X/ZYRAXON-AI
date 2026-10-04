#!/usr/bin/env python3
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""ZYRAXON Daily Task Daemon - wakes the packaged ZYRAXON app when a Daily Task is due.

WHAT THIS IS
    ZYRAXON's in-process scheduler (packages/desktop/src/main/daily-task-scheduler.ts)
    can only deliver a Daily Task to a renderer that already exists. Its
    `ensureAppReady()` (daily-task-scheduler.ts:44) focuses an existing
    BrowserWindow and has no way to start the app, so a task whose time passes
    while ZYRAXON is closed can never fire on its own - it is only ever picked up
    as a catch-up run the next time somebody opens the app by hand.

    This daemon fills exactly that one gap. It watches the same store the app
    owns, and when a task becomes due it launches the PACKAGED app so the app's
    own scheduler wakes up, sees the same due task, and delivers it.

    THIS DAEMON DOES NOT DO THE WORK. It never runs prompts, never talks to a
    model, never writes `lastRun` into the task store and never sends IPC. The
    Electron main process remains the only thing that delivers a task, stamps
    `lastRun` (daily-task-storage.ts:114) and records status. The daemon's whole
    job is to make sure that process is alive at the right minute. That is also
    why it must not fight the scheduler: it defers to `lastRun` when the app has
    already handled a task, and it keeps a wake marker of its own so the same
    due slot is never woken twice.

STORE IT WATCHES
    <userData>/daily-tasks/tasks.json  (daily-task-storage.ts:18-19)
    userData = <app.getPath("appData")>/<appId>  (index.ts:148-151), where appId
    is ai.zyraxon.desktop | .beta | .dev depending on build channel (index.ts:58).
    appData is %APPDATA% on Windows, ~/Library/Application Support on macOS and
    ${XDG_CONFIG_HOME:-~/.config} on Linux.
    The app only ever overrides userData for its onboarding test root
    (index.ts:131-152), so the daemon ships its own override for a custom or
    portable profile: --user-data <dir> or ZYRAXON_USER_DATA=<dir>.

REQUIREMENTS
    Python 3.8+, standard library only. No pip install, no third-party modules,
    nothing to build. Runs on a bare interpreter on Windows, macOS and Linux.
"""

import argparse
import atexit
import ctypes
import hashlib
import json
import logging
import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Dict, List, Mapping, Optional, Sequence, Tuple, TypedDict

# A frozen build (PyInstaller --windows-console-mode=hide) unpacks to a temp dir,
# so state and log must live next to the exe, not next to __file__.
DAEMON_DIR = (
    Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
)
STATE_FILE = DAEMON_DIR / "daemon-state.json"
LOCK_FILE = DAEMON_DIR / "daemon.lock"
LOG_FILE = DAEMON_DIR / "daemon.log"

# Polls stay in the 20-30s band the app itself uses (CHECK_INTERVAL_MS = 30000).
# Sleeping is adaptive: it wakes on the due minute instead of burning a poll on
# every task, but never loops faster than MIN_SLEEP_SECONDS.
POLL_INTERVAL_SECONDS = 25.0
MIN_SLEEP_SECONDS = 0.5
MAX_INTERVAL_SECONDS = 300.0
SLEEP_SLICE_SECONDS = 1.0

# Wake a couple of seconds *after* the due minute so the app's own
# `minutesSinceMidnight(now) >= due` check (daily-task-scheduler.ts:79) has
# actually flipped rather than racing the minute boundary.
WAKE_LEAD_SECONDS = 2.0

# A missing or portable install will not appear between two polls; and a store
# that cannot be read is retried, not re-logged, every 25 seconds. Both notices
# are therefore rate limited to one per window instead of one per poll.
NOTICE_LOG_SECONDS = 300.0

# A lock file whose owner is gone (crash, kill -9, reboot) is debris, not a live
# instance, and must not block the daemon forever. The owner refreshes the lock's
# mtime on every pass, so a lock that has gone quiet that long has nobody behind
# it. A live pid always wins: a long-running daemon is not "stale" just because
# it is older than a threshold.
LOCK_SILENCE_SECONDS = 90.0

# Bigger than any NTP step or DST jump; beyond it the cached sense of "how long
# until the next due task" is meaningless and gets re-derived from the wall clock.
CLOCK_JUMP_TOLERANCE_SECONDS = 120.0

STATE_VERSION = 1
STATE_KEEP_DAYS = 14.0
MAX_LOG_BYTES = 1024 * 1024

# Mirrors TIME_PATTERN in daily-task-storage.ts:28.
TIME_PATTERN = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
# Mirrors DAY_NAMES in daily-task-storage.ts:27.
DAY_NAMES = ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

# (app id, product name) per build channel - index.ts:58 and
# electron-builder.config.ts:87. Resolution probes all three so a beta or dev
# install is found just as readily as the prod one.
APP_IDS: Tuple[Tuple[str, str], ...] = (
    ("ai.zyraxon.desktop", "ZYRAXON"),
    ("ai.zyraxon.desktop.beta", "ZYRAXON Beta"),
    ("ai.zyraxon.desktop.dev", "ZYRAXON Dev"),
)

# Linux executableName is the app id (electron-builder.config.ts:233) and the
# shipped .desktop runs /opt/<productName>/<appId> (resources/linux/
# zyraxon-desktop.desktop), so that is the packaged path to exec.
LINUX_APP_ROOTS = ("/opt", "/usr/lib", "/usr/local/lib")

logger = logging.getLogger("zyraxon-task-daemon")


class Task(TypedDict):
    """One Daily Task record, after the coercion daily-task-storage.ts:39 does."""

    id: str
    prompt: str
    time: str
    days: List[str]
    enabled: bool
    createdAt: str
    lastRun: Optional[str]


class WakeState(TypedDict):
    version: int
    # wake key -> ISO timestamp the app was woken. A key is
    # "<task id>|<local date>|<HH:MM>", so editing a task's time legitimately
    # re-arms it while the same slot can never be woken twice.
    woken: Dict[str, str]


class Throttle:
    """Lets a warning through at most once per window."""

    def __init__(self, seconds: float) -> None:
        self.seconds = seconds
        self.last = 0.0

    def allow(self) -> bool:
        now = time.time()
        if now - self.last < self.seconds:
            return False
        self.last = now
        return True


_stop_requested = False


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    interval = max(1.0, min(args.interval, MAX_INTERVAL_SECONDS))
    if args.hidden:
        hide_windows_console()

    configure_logging(console=args.console, debug=args.debug)
    logger.info("daemon starting: python %s, pid %d, interval %.0fs", python_version(), os.getpid(), interval)

    if not acquire_lock(LOCK_FILE):
        logger.error("another daemon already holds %s - exiting", LOCK_FILE)
        return 3
    atexit.register(release_lock, LOCK_FILE)
    install_signal_handlers()

    tasks_file = resolve_user_data(args.user_data) / "daily-tasks" / "tasks.json"
    logger.info("watching %s", tasks_file)

    state = load_state()
    read_throttle = Throttle(NOTICE_LOG_SECONDS)
    missing_app_throttle = Throttle(NOTICE_LOG_SECONDS)
    last_wall_clock = time.time()

    try:
        while not _stop_requested:
            now = datetime.now()
            last_wall_clock = detect_clock_jump(last_wall_clock, now)
            refresh_lock(LOCK_FILE)

            tasks = load_tasks(tasks_file, read_throttle)
            if tasks is None:
                sleep_until_stopped(min(interval, 5.0))
                continue

            blocked = not wake_due_tasks(tasks, now, state, args, missing_app_throttle)
            if args.once or _stop_requested:
                break
            sleep_until_stopped(seconds_until_next_wake(tasks, now, state, interval, blocked))
    except KeyboardInterrupt:
        logger.info("interrupted")
    finally:
        release_lock(LOCK_FILE)
        logger.info("daemon stopped")
    return 0


def parse_args(argv: Optional[Sequence[str]]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="zyraxon_task_daemon",
        description="Watches ZYRAXON Daily Tasks and launches the packaged app when one is due.",
    )
    parser.add_argument(
        "--user-data",
        default=None,
        help="override <userData> (default: resolved from the channel app ids under appData)",
    )
    parser.add_argument(
        "--app",
        default=None,
        help="full path to the packaged ZYRAXON executable; skips per-platform resolution",
    )
    parser.add_argument(
        "--app-arg",
        action="append",
        default=[],
        dest="app_args",
        help="extra argument for the app, repeatable; use --app-arg=<value> for values starting with -",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=POLL_INTERVAL_SECONDS,
        help=f"max seconds between checks (default {POLL_INTERVAL_SECONDS:g})",
    )
    parser.add_argument("--once", action="store_true", help="run a single pass and exit")
    parser.add_argument("--dry-run", action="store_true", help="log the launch command instead of running it")
    parser.add_argument("--debug", action="store_true", help="log every poll")
    parser.add_argument("--console", action="store_true", help="also log to stdout (debugging only)")
    parser.add_argument("--hidden", action="store_true", help="hide this console window on Windows")
    return parser.parse_args(argv)


def python_version() -> str:
    return ".".join(str(part) for part in sys.version_info[:3])


def configure_logging(console: bool, debug: bool) -> None:
    logger.setLevel(logging.DEBUG if debug else logging.INFO)
    logger.handlers = []
    logger.propagate = False
    try:
        handler: logging.Handler = RotatingFileHandler(
            str(LOG_FILE), maxBytes=MAX_LOG_BYTES, backupCount=1, encoding="utf-8"
        )
    except OSError:
        handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(message)s"))
    logger.addHandler(handler)
    if console:
        stream = logging.StreamHandler(sys.stdout)
        stream.setFormatter(handler.formatter)
        logger.addHandler(stream)


def resolve_user_data(explicit: Optional[str]) -> Path:
    """<userData> = appData/<appId>, honouring an explicit override first."""
    override = explicit or os.environ.get("ZYRAXON_USER_DATA")
    if override:
        return Path(override).expanduser()
    app_data = electron_app_data_dir()
    for app_id, _product in APP_IDS:
        candidate = app_data / app_id
        if (candidate / "daily-tasks").is_dir():
            return candidate
    return app_data / APP_IDS[0][0]


def electron_app_data_dir() -> Path:
    """Electron's app.getPath("appData")."""
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support"
    return Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")


def normalize_task(raw: Mapping[str, object]) -> Task:
    """Same coercion as daily-task-storage.ts:39, so an unusable record is skipped here too."""
    time_value = raw.get("time")
    days_value = raw.get("days")
    id_value = raw.get("id")
    prompt_value = raw.get("prompt")
    created_value = raw.get("createdAt")
    last_run_value = raw.get("lastRun")
    return Task(
        id=str(id_value) if id_value is not None else "",
        prompt=str(prompt_value) if prompt_value is not None else "",
        time=time_value if isinstance(time_value, str) and TIME_PATTERN.match(time_value) else "",
        days=[day for day in days_value if day in DAY_NAMES] if isinstance(days_value, list) else [],
        enabled=raw.get("enabled") is not False,
        createdAt=str(created_value) if created_value is not None else "",
        lastRun=str(last_run_value) if last_run_value is not None else None,
    )


def load_tasks(path: Path, throttle: Throttle) -> Optional[List[Task]]:
    """Parsed tasks, or None when the store could not be read or parsed (retry next poll)."""
    try:
        raw_text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.debug("store %s does not exist yet", path)
        return []
    except OSError as error:
        if throttle.allow():
            logger.warning("cannot read %s (%s) - retrying", path, error)
        return None
    try:
        parsed = json.loads(raw_text)
    except ValueError as error:
        # The app writes this file non-atomically (daily-task-storage.ts:68), so a
        # half-written file is a normal transient state, not corruption.
        if throttle.allow():
            logger.warning("cannot parse %s (%s) - retrying", path, error)
        return None
    entries = parsed.get("tasks") if isinstance(parsed, dict) else None
    if not isinstance(entries, list):
        if throttle.allow():
            logger.warning("no task list in %s - retrying", path)
        return None
    return [normalize_task(entry) for entry in entries if isinstance(entry, dict)]


def parse_task_time(value: str) -> Optional[Tuple[int, int]]:
    match = TIME_PATTERN.match(value)
    if not match:
        return None
    hours = int(match.group(1))
    minutes = int(match.group(2))
    if hours > 23 or minutes > 59:
        return None
    return hours, minutes


def weekday_name(now: datetime) -> str:
    # Python weekday() is 0=Monday, JavaScript getDay() is 0=Sunday.
    return DAY_NAMES[(now.weekday() + 1) % 7]


def parse_iso_local(value: str) -> Optional[datetime]:
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed.astimezone() if parsed.tzinfo else parsed


def runs_today(task: Task, now: datetime) -> bool:
    """True when the app's own scheduler already handled this task today (daily-task-scheduler.ts:89)."""
    if not task["lastRun"]:
        return False
    stamp = parse_iso_local(task["lastRun"])
    return stamp is not None and stamp.date() == now.date()


def wake_key(task: Task, now: datetime) -> str:
    # Older records may carry no id; fall back to a digest of the prompt so the key
    # still means "the same task at the same slot". hash() is salted per process, so
    # it would produce a different key on every restart and re-fire the task.
    identity = task["id"] or hashlib.sha1(task["prompt"].encode("utf-8")).hexdigest()[:12]
    return f"{identity}|{now.date().isoformat()}|{task['time']}"


def is_due(task: Task, now: datetime, state: WakeState) -> bool:
    parsed = parse_task_time(task["time"])
    if not parsed or not task["enabled"] or weekday_name(now) not in task["days"]:
        return False
    if runs_today(task, now) or wake_key(task, now) in state["woken"]:
        return False
    hours, minutes = parsed
    # ">= time", not "== time", so a sleeping machine or a late daemon start still
    # wakes the app and lets the app run its normal catch-up pass.
    return now.hour * 60 + now.minute >= hours * 60 + minutes


def wake_due_tasks(
    tasks: Sequence[Task], now: datetime, state: WakeState, args: argparse.Namespace, notice: Throttle
) -> bool:
    """Wake the app for everything due this pass. False means "blocked, nothing woken"."""
    pending = [task for task in tasks if is_due(task, now, state)]
    if not pending:
        return True

    command = resolve_app_command(args.app, args.app_args)
    if command is None:
        # No marker is written on purpose: an overdue task must stay armed so the
        # daemon wakes the app the moment an install shows up.
        if notice.allow():
            logger.warning("packaged ZYRAXON app not found - no wake, no marker written")
        return False

    # One wake covers every task due in this pass: the app re-reads the same store
    # on start and delivers them all, so waking per task would only spam the OS.
    logger.info("waking ZYRAXON for %d due task(s): %s", len(pending), describe(pending))
    if args.dry_run:
        logger.info("dry run: would run %s", " ".join(command))
    else:
        launched = launch_app(command)
        if launched is None:
            return False
    stamp_wake(state, pending, now)
    return True


def seconds_until_next_wake(
    tasks: Sequence[Task], now: datetime, state: WakeState, interval: float, blocked: bool
) -> float:
    """Sleep just long enough to wake on the next due minute, capped at one poll."""
    if blocked:
        # Nothing was woken (app missing, or the spawn failed). Do not re-check
        # every 25s for a task that is already overdue - that is the spin case.
        return interval
    now_seconds = now.hour * 3600 + now.minute * 60 + now.second
    soonest: Optional[float] = None
    for task in tasks:
        parsed = parse_task_time(task["time"])
        if not parsed or not task["enabled"] or weekday_name(now) not in task["days"]:
            continue
        if runs_today(task, now) or wake_key(task, now) in state["woken"]:
            continue
        hours, minutes = parsed
        due_at = hours * 3600 + minutes * 60 + WAKE_LEAD_SECONDS
        if due_at <= now_seconds:
            return MIN_SLEEP_SECONDS
        if soonest is None or due_at - now_seconds < soonest:
            soonest = due_at - now_seconds
    return interval if soonest is None else max(MIN_SLEEP_SECONDS, min(soonest, interval))


def describe(tasks: Sequence[Task]) -> str:
    return ", ".join(
        f"{task['time']} [{','.join(task['days']) or 'no-days'}] {task['prompt'][:40]}" for task in tasks
    )


def detect_clock_jump(previous: float, now: datetime) -> float:
    wall = now.timestamp()
    if abs(wall - previous) > CLOCK_JUMP_TOLERANCE_SECONDS:
        logger.warning("wall clock moved %.0fs - re-evaluating schedule", wall - previous)
    return wall


def load_state() -> WakeState:
    empty = WakeState(version=STATE_VERSION, woken={})
    try:
        parsed = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return empty
    if not isinstance(parsed, dict) or parsed.get("version") != STATE_VERSION:
        return empty
    woken = parsed.get("woken")
    if not isinstance(woken, dict):
        return empty
    return WakeState(version=STATE_VERSION, woken={str(key): str(stamp) for key, stamp in woken.items()})


def persist_state(state: WakeState) -> None:
    """Atomic replace: a crash mid-write must not lose or corrupt the wake markers."""
    cutoff = datetime.fromtimestamp(time.time() - STATE_KEEP_DAYS * 86400).astimezone()
    state["woken"] = {
        key: stamp for key, stamp in state["woken"].items() if (parse_iso_local(stamp) or cutoff) >= cutoff
    }
    tmp = STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
    os.replace(str(tmp), str(STATE_FILE))


def stamp_wake(state: WakeState, tasks: Sequence[Task], now: datetime) -> None:
    for task in tasks:
        state["woken"].setdefault(wake_key(task, now), now.astimezone().isoformat())
    persist_state(state)
    logger.info("recorded %d wake marker(s), %d total", len(tasks), len(state["woken"]))


def resolve_app_command(override: Optional[str], app_args: Sequence[str]) -> Optional[List[str]]:
    """Full argv that starts the PACKAGED app. Never a dev server, never `bun dev`."""
    explicit = override or os.environ.get("ZYRAXON_APP_PATH")
    candidates = [explicit] if explicit else packaged_candidates()
    for candidate in candidates:
        path = Path(candidate).expanduser()
        # A macOS .app is a bundle directory, not an executable file, so it must
        # be matched as a directory or the installed app is never found.
        if sys.platform == "darwin" and path.suffix == ".app":
            if not path.is_dir():
                continue
            if app_args:
                logger.warning("ignoring --app-arg values for the bundle %s: %s", path, " ".join(app_args))
            # `open -a` activates an already-running bundle - the macOS equivalent of
            # the single-instance lock - instead of starting a second copy.
            return ["/usr/bin/open", "-a", str(path)]
        if not path.is_file() or not os.access(str(path), os.X_OK):
            continue
        return [str(path), *app_args]
    logger.debug("no packaged ZYRAXON executable found; tried: %s", ", ".join(candidates))
    return None


def packaged_candidates() -> List[str]:
    paths: List[str] = []
    if sys.platform == "win32":
        local = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
        program_files = [os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")]
        # NSIS oneClick + perMachine:false (electron-builder.config.ts:216-222) puts
        # the app in %LOCALAPPDATA%\Programs\<productName>, exe named after it.
        for _app_id, product in APP_IDS:
            paths.append(str(local / "Programs" / product / f"{product}.exe"))
            paths.append(str(local / product / f"{product}.exe"))
            paths.extend(str(Path(root) / product / f"{product}.exe") for root in program_files if root)
        return paths
    if sys.platform == "darwin":
        for _app_id, product in APP_IDS:
            paths.append(f"/Applications/{product}.app")
            paths.append(str(Path.home() / "Applications" / f"{product}.app"))
        return paths
    for app_id, product in APP_IDS:
        paths.extend(str(Path(root) / product / app_id) for root in LINUX_APP_ROOTS)
        paths.append(f"/usr/bin/{app_id}")
        paths.append(f"/usr/local/bin/{app_id}")
        paths.append(str(Path.home() / ".local" / "bin" / app_id))
    for folder in (Path.home() / "Applications", Path.home() / ".local" / "opt"):
        if folder.is_dir():
            paths.extend(str(found) for found in sorted(folder.glob("*[Zz][Yy][Rr][Aa][Xx][Oo][Nn]*.AppImage")))
    return paths


def launch_app(command: Sequence[str]) -> Optional[int]:
    try:
        process = subprocess.Popen(
            list(command),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=str(Path.home()),
            close_fds=True,
            # CREATE_NO_WINDOW keeps the launch from flashing a console, and
            # start_new_session detaches on POSIX so the daemon outlives nothing.
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0,
            start_new_session=os.name != "nt",
        )
    except OSError as error:
        logger.error("launch failed (%s): %s", " ".join(command), error)
        return None
    logger.info("launched %s (pid %s)", " ".join(command), process.pid)
    return process.pid


def acquire_lock(path: Path) -> bool:
    for _attempt in (0, 1):
        try:
            handle = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            if not steal_stale_lock(path):
                return False
            continue
        except OSError as error:
            logger.error("cannot create lock %s: %s", path, error)
            return False
        with os.fdopen(handle, "w", encoding="utf-8") as file:
            json.dump({"pid": os.getpid(), "startedAt": datetime.now().astimezone().isoformat()}, file)
        return True
    return False


def refresh_lock(path: Path) -> None:
    """Heartbeat: touch the lock so a peer can tell a live owner from a crashed one."""
    try:
        os.utime(str(path), None)
    except OSError:
        pass


def steal_stale_lock(path: Path) -> bool:
    try:
        info = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        info = {}
    pid = info.get("pid") if isinstance(info, dict) else None
    if isinstance(pid, int) and process_alive(pid):
        logger.info("lock %s is held by live pid %s", path, pid)
        return False
    silence = lock_silence_seconds(path)
    if silence < LOCK_SILENCE_SECONDS:
        logger.info("lock %s was refreshed %.0fs ago - treating it as owned", path, silence)
        return False
    logger.warning("clearing stale lock (pid %s) with no owner for %.0fs", pid, silence)
    path.unlink(missing_ok=True)
    return True


def lock_silence_seconds(path: Path) -> float:
    try:
        return time.time() - path.stat().st_mtime
    except OSError:
        return 0.0


def release_lock(path: Path) -> None:
    try:
        info = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(info, dict) and info.get("pid") != os.getpid():
            return
    except (OSError, ValueError):
        pass
    path.unlink(missing_ok=True)


def process_alive(pid: int) -> bool:
    if os.name == "nt":
        # os.kill(pid, 0) on Windows calls TerminateProcess(handle, 0) - it would
        # KILL the very process it was asked about. Query the exit code instead.
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return False
        try:
            code = ctypes.c_ulong()
            return bool(kernel32.GetExitCodeProcess(handle, ctypes.byref(code))) and code.value == 259  # STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def install_signal_handlers() -> None:
    def handler(signum: int, _frame: object) -> None:
        global _stop_requested
        _stop_requested = True
        logger.info("received signal %d - shutting down", signum)

    for name in ("SIGTERM", "SIGINT", "SIGBREAK", "SIGHUP"):
        number = getattr(signal, name, None)
        if number is not None:
            signal.signal(number, handler)


def sleep_until_stopped(seconds: float) -> None:
    """Sliced so a SIGTERM arriving mid-poll is acted on within a second, not a whole poll."""
    deadline = time.monotonic() + seconds
    while not _stop_requested:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        time.sleep(min(SLEEP_SLICE_SECONDS, remaining))


def hide_windows_console() -> None:
    if os.name != "nt":
        return
    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
    handle = kernel32.GetConsoleWindow()
    if handle:
        kernel32.ShowWindow(handle, 0)  # SW_HIDE


if __name__ == "__main__":
    sys.exit(main())
