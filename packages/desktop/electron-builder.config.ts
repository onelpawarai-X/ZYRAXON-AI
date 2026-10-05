// Copyright (c) 2026 onelpawarai. All rights reserved.

import { execFile } from "node:child_process"
import { existsSync, cpSync, chmodSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const packageDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(packageDir, "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")
const legacyDesktopEntry = path.join(packageDir, "resources", "linux", "zyraxon-desktop.desktop")
const legacyDesktopEntryFpm = `${legacyDesktopEntry}=/usr/share/applications/zyraxon-desktop.desktop`

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

function copyMcpBundles(configuration: { appOutDir: string }) {
  const resourcesDst = path.join(configuration.appOutDir, "resources")

  // Copy jarvis-browser node_modules
  const jarvisSrc = path.join(packageDir, "resources", "jarvis-browser", "node_modules")
  const jarvisDst = path.join(resourcesDst, "jarvis-browser", "node_modules")
  if (existsSync(jarvisSrc)) {
    cpSync(jarvisSrc, jarvisDst, { recursive: true })
    console.log("[afterPack] Copied jarvis-browser node_modules to", jarvisDst)
  }

  // Copy nuphus-mcp bundle (build script creates this)
  const nuphusSrc = path.join(packageDir, "resources", "nuphus-mcp")
  const nuphusDst = path.join(resourcesDst, "nuphus-mcp")
  if (existsSync(nuphusSrc)) {
    cpSync(nuphusSrc, nuphusDst, { recursive: true })
    // Git tracks these binaries 755, but a checkout with core.filemode=false (CI does
    // this) drops the exec bit and every Linux/macOS build then fails with EACCES.
    // Set it here so packaging does not depend on how the tree was checked out.
    if (process.platform !== "win32") {
      for (const arch of ["linux-x64", "osx-arm64", "osx-x64"]) {
        const bin = path.join(nuphusDst, arch, "nuphus-mcp")
        if (existsSync(bin)) {
          chmodSync(bin, 0o755)
          console.log("[afterPack] chmod +x", bin)
        }
      }
    }
    console.log("[afterPack] Copied nuphus-mcp to", nuphusDst)
  }

  // Copy touchpoint-mcp bundle (accessibility-based desktop automation)
  const touchpointSrc = path.join(packageDir, "resources", "touchpoint-mcp")
  const touchpointDst = path.join(resourcesDst, "touchpoint-mcp")
  if (existsSync(touchpointSrc)) {
    cpSync(touchpointSrc, touchpointDst, { recursive: true })
    console.log("[afterPack] Copied touchpoint-mcp to", touchpointDst)
  }

  // Copy desktop-commander bundle (wrapper + ESM dist + node_modules)
  const commanderSrc = path.join(packageDir, "resources", "desktop-commander")
  const commanderDst = path.join(resourcesDst, "desktop-commander")
  if (existsSync(commanderSrc)) {
    cpSync(commanderSrc, commanderDst, { recursive: true })
    console.log("[afterPack] Copied desktop-commander to", commanderDst)
  }
}

const afterPack = (context: { appOutDir: string }) => {
  copyMcpBundles(context)
}

const channel = (() => {
  const raw = process.env.ZYRAXON_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const APP_IDS = {
  dev: "ai.zyraxon.desktop.dev",
  beta: "ai.zyraxon.desktop.beta",
  prod: "ai.zyraxon.desktop",
} as const

// The display name carries a space ("ZYRAXON Dev"), but a space in a release
// asset name becomes a dot in the GitHub download URL while electron-updater
// looks the asset up under the sanitized name written into latest.yml. Keep a
// space-free slug for file names and use it for the installer artifact.
const PRODUCT_SLUGS = {
  dev: "ZYRAXON-Dev",
  beta: "ZYRAXON-Beta",
  prod: "ZYRAXON",
} as const

const getBase = (appId: string): Configuration => ({
  afterPack,
  artifactName: "zyraxon-desktop-${os}-${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  // Linux launchers are .desktop files, so this is the desktop file name,
  // not just the app id. For prod, app id "ai.zyraxon.desktop" becomes
  // "ai.zyraxon.desktop.desktop".
  // https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html
  // https://www.electron.build/docs/linux/
  extraMetadata: {
    desktopName: `${appId}.desktop`,
  },
  files: ["out/**/*", "resources/icons/**", "resources/entitlements.plist"],
  asarUnpack: [
    "node_modules/@playwright/**",
    "node_modules/playwright-core/**",
    "node_modules/playwright/**",
    "node_modules/chromium-bidi/**",
    "jarvis-browser/**",
    "nuphus-mcp/**",
    "touchpoint-mcp/**",
    "desktop-commander/**",
  ],
  extraResources: [
    {
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
    },
    {
      from: "resources/bin/",
      to: "bin/",
    },
    {
      from: "resources/jarvis-browser-mcp.cjs",
      to: "jarvis-browser-mcp.cjs",
    },
    {
      from: "resources/voice-bridge.html",
      to: "voice-bridge.html",
    },
    {
      from: "resources/voice-preload.js",
      to: "voice-preload.js",
    },
    {
      from: "scripts/voice-bridge-server.cjs",
      to: "voice-bridge-server.cjs",
    },
    {
      from: "resources/default-mcp-config.json",
      to: "default-mcp-config.json",
    },
    {
      from: "resources/utilsBundle.js",
      to: "utilsBundle.js",
    },
    {
      from: "resources/jarvis-browser",
      to: "jarvis-browser",
      filter: ["package.json", "node_modules/**/*"],
    },
    {
      from: "resources/nuphus-mcp",
      to: "nuphus-mcp",
      filter: ["*.cjs", "*.js", "*.json", "*.md"],
    },
    {
      from: "resources/touchpoint-mcp",
      to: "touchpoint-mcp",
      // libs/ holds win_amd64 wheels only. Shipping them to Linux/macOS wastes
      // ~90MB and shadowed the platform's own packages; those builds resolve
      // touchpoint from the interpreter's site-packages instead.
      filter:
        process.platform === "win32"
          ? ["*.py", "*.cjs", "*.js", "*.json", "*.md", "libs/**/*"]
          : ["*.py", "*.cjs", "*.js", "*.json", "*.md"],
    },
    {
      from: "resources/desktop-commander",
      to: "desktop-commander",
      filter: ["*.cjs", "*.js", "*.json", "*.md", "LICENSE", "dist/**/*", "node_modules/**/*"],
    },
    ...(existsSync(path.join(packageDir, "resources", "zyraxon-task-daemon"))
      ? [
          {
            from: "resources/zyraxon-task-daemon",
            to: "zyraxon-task-daemon",
            // Only the daemon's own sources. The daemon also writes daemon-state.json,
            // daemon.lock and daemon.log next to the script, so a developer who ran it
            // in place would otherwise have their wake markers - and a task already
            // consumed for the day - packaged into every install.
            filter: ["*.py", "*.md"],
          },
        ]
      : []),
    {
      from: "assets/videos",
      to: "videos",
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: true,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: true,
  },
  protocols: {
    name: "ZYRAXON",
    schemes: ["zyraxon"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    signtoolOptions: {
      sign: signWindows,
    },
    target: ["nsis"],
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
    // The task daemon registers itself for logon under HKCU on first run, so the
    // uninstaller has to take that entry (and the copied script) back out.
    include: "resources/installer.nsh",
    // ${productName} carries the channel name with a space in it ("ZYRAXON Dev"),
    // and spaces in a release asset name become dots in the GitHub download URL
    // while electron-updater looks the asset up under the sanitized name written
    // into latest.yml. Build the name from the channel directly so both agree.
    artifactName: `${PRODUCT_SLUGS[channel]}-\${os}-installer.\${ext}`,
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    executableName: appId,
    desktop: {
      entry: {
        // Match the installed .desktop file and hicolor icon basename so
        // Linux shells can associate the running Electron window with its launcher.
        StartupWMClass: appId,
      },
    },
    target: ["AppImage", "deb", "rpm"],
  },
})

function getConfig() {
  const appId = APP_IDS[channel]
  const base = getBase(appId)

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId,
        productName: "ZYRAXON Dev",
        publish: { provider: "github", owner: "onelpawarai-X", repo: "ZYRAXON-AI", channel: "latest" },
        rpm: { packageName: "zyraxon-dev" },
      }
    }
    case "beta": {
      return {
        ...base,
        appId,
        productName: "ZYRAXON Beta",
        protocols: { name: "ZYRAXON Beta", schemes: ["zyraxon"] },
        publish: { provider: "github", owner: "onelpawarai-X", repo: "ZYRAXON-AI", channel: "latest" },
        rpm: { packageName: "zyraxon-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId,
        productName: "ZYRAXON",
        protocols: { name: "ZYRAXON", schemes: ["zyraxon"] },
        publish: { provider: "github", owner: "onelpawarai-X", repo: "ZYRAXON-AI", channel: "latest" },
        deb: { fpm: [legacyDesktopEntryFpm] },
        rpm: { packageName: "zyraxon", fpm: [legacyDesktopEntryFpm] },
      }
    }
  }
}

export default getConfig()
