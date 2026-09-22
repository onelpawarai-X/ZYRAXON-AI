#!/bin/bash
# ZYRAXON build environment setup - idempotent, run anytime after session reset
set -e

# 1. System deps (skip if already installed)
echo "=== [1/4] System deps ==="
if ! command -v unzip &>/dev/null; then
  sudo apt-get update -qq 2>&1 | tail -1
  sudo apt-get install -y -qq unzip libkrb5-dev pkg-config libx11-dev libxkbfile-dev \
    libsecret-1-dev libasound2-dev libnss3-dev libnspr4-dev libgbm-dev libgtk-3-dev \
    libcairo2-dev libpango1.0-dev 2>&1 | tail -2
fi

# 2. Bun
echo "=== [2/4] Bun ==="
if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash 2>&1 | tail -2
fi
sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun

# 3. Node v24.18.0 (zyraxon-code .nvmrc requires it)
echo "=== [3/4] Node v24.18.0 ==="
if [ "$(node --version 2>/dev/null)" != "v24.18.0" ]; then
  cd /tmp
  rm -f node-v24.18.0-linux-x64.tar.xz
  curl -fsSLO "https://nodejs.org/dist/v24.18.0/node-v24.18.0-linux-x64.tar.xz"
  rm -rf /home/openhands/node24
  mkdir -p /home/openhands/node24
  tar -xf node-v24.18.0-linux-x64.tar.xz -C /home/openhands/node24 --strip-components=1
  cd /workspace/project/ZYRAXON-AI
fi
sudo ln -sf /home/openhands/node24/bin/node /usr/local/bin/node
sudo ln -sf /home/openhands/node24/bin/npm /usr/local/bin/npm
sudo ln -sf /home/openhands/node24/bin/npx /usr/local/bin/npx

# 4. Wine (for rcedit.exe cross-compile on Linux)
echo "=== [4/4] Wine ==="
if ! command -v wine &>/dev/null; then
  sudo dpkg --add-architecture i386 2>/dev/null
  sudo apt-get update -qq 2>&1 | tail -1
  sudo apt-get install -y -qq wine32 wine64 2>&1 | tail -2
fi
sudo ln -sf /usr/lib/wine/wine64 /usr/bin/wine64 2>/dev/null
sudo ln -sf /usr/lib/wine/wine64 /usr/bin/wine 2>/dev/null
rm -rf /home/openhands/.wine
WINEDEBUG=-all wineboot --init 2>&1 | tail -1 || true

echo ""
echo "=== Setup complete ==="
echo "bun:    $(bun --version)"
echo "node:   $(node --version)"
echo "npm:    $(npm --version)"
echo "wine:   $(wine --version 2>/dev/null || echo 'N/A')"
echo "unzip:  $(command -v unzip)"
