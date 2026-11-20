#!/usr/bin/env bash
# Copyright (c) 2026 onelpawarai. All rights reserved.
#
# Start the ZYRAXON server with every piece of state kept inside the workspace.
#
# The server normally writes its database, credentials, logs and config under the
# user's home directory (~/.local/share/zyraxon, ~/.config/zyraxon, ...). That means
# a restart of the machine can lose it, and it is outside the checkout this project
# is meant to own. This script points every XDG location at .zyraxon-data/ inside the
# workspace instead, so the data survives a restart and stays with the project.
#
# Usage:
#   ./scripts/zyraxon-serve-workspace.sh [extra args...]
#
# Override the port with ZYRAXON_PORT, the host with ZYRAXON_HOST.

set -u

WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_ROOT="$WORKSPACE/.zyraxon-data"

mkdir -p \
  "$DATA_ROOT/data" \
  "$DATA_ROOT/config" \
  "$DATA_ROOT/state" \
  "$DATA_ROOT/cache" \
  "$DATA_ROOT/tmp" \
  "$DATA_ROOT/home"

# Keep every XDG location inside the workspace. `zyraxon` is appended by the server
# itself, so these are the parent directories.
export XDG_DATA_HOME="$DATA_ROOT/data"
export XDG_CONFIG_HOME="$DATA_ROOT/config"
export XDG_STATE_HOME="$DATA_ROOT/state"
export XDG_CACHE_HOME="$DATA_ROOT/cache"
export TMPDIR="$DATA_ROOT/tmp"
# Config resolution prefers this when set, which pins it even on Windows layouts.
export ZYRAXON_CONFIG_DIR="$DATA_ROOT/config/zyraxon"
# A stable home so anything that resolves ~ lands in the workspace too.
export HOME="$DATA_ROOT/home"

export ZYRAXON_PORT="${ZYRAXON_PORT:-4096}"
export ZYRAXON_HOST="${ZYRAXON_HOST:-0.0.0.0}"

# The bundled MCP servers (Jarvis Browser, desktop-commander, nuphus, touchpoint)
# live in packages/desktop/resources and are referenced through a
# `__RESOURCES_PATH__` placeholder in the command. The resolver guesses that path
# from its own module location, which in a compiled binary collapses to
# `/desktop/resources` and fails, so every bundled server reports "Failed to
# start". Naming the directory explicitly here is what makes them launch.
export ZYRAXON_RESOURCES_PATH="$WORKSPACE/packages/desktop/resources"

# A sign-in page has to be able to open a browser. On a headless machine (a server, a
# container, CI) there is no DISPLAY, so every launch fails with "Missing X server" and
# the OAuth handshake stalls with no page ever shown. When no display is present and
# Xvfb is installed, this starts a virtual one and points DISPLAY at it, so the browser
# launches and the consent page is reachable (for example through a forwarded VNC).
if [ -z "${DISPLAY:-}" ] && command -v Xvfb >/dev/null 2>&1; then
  XVFB_DISPLAY="${ZYRAXON_XVFB_DISPLAY:-:99}"
  if ! xdpyinfo -display "$XVFB_DISPLAY" >/dev/null 2>&1; then
    Xvfb "$XVFB_DISPLAY" -screen 0 1920x1080x24 -nolisten tcp >"$DATA_ROOT/tmp/xvfb.log" 2>&1 &
    XVFB_PID=$!
    # Give X a moment to accept connections before the browser tries to use it.
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      xdpyinfo -display "$XVFB_DISPLAY" >/dev/null 2>&1 && break
      sleep 0.3
    done
    echo "virtual display: $XVFB_DISPLAY (pid $XVFB_PID)"
  fi
  export DISPLAY="$XVFB_DISPLAY"
fi

BIN="$WORKSPACE/packages/zyraxon/dist/zyraxon-linux-x64/bin/zyraxon"
if [ ! -x "$BIN" ]; then
  echo "zyraxon binary not found at $BIN" >&2
  echo "Build it first: bun run --cwd packages/zyraxon build" >&2
  exit 1
fi

echo "workspace data: $DATA_ROOT"
echo "listening on:   http://$ZYRAXON_HOST:$ZYRAXON_PORT"
exec "$BIN" serve --port "$ZYRAXON_PORT" --hostname "$ZYRAXON_HOST" --print-logs "$@"
