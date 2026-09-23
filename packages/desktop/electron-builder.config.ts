import { execFile } from "node:child_process"
import { existsSync, cpSync } from "node:fs"
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
      filter: ["*.py", "*.cjs", "*.js", "*.json", "*.md", "libs/**/*"],
    },
    {
      from: "resources/desktop-commander",
      to: "desktop-commander",
      filter: ["*.cjs", "*.js", "*.json", "*.md", "LICENSE", "dist/**/*", "node_modules/**/*"],
    },
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
    artifactName: "${productName}-${os}-installer.${ext}",
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
        publish: { provider: "github", owner: "onelpawarai", repo: "ZYRAXON-AI", channel: "latest" },
        rpm: { packageName: "zyraxon-dev" },
      }
    }
    case "beta": {
      return {
        ...base,
        appId,
        productName: "ZYRAXON Beta",
        protocols: { name: "ZYRAXON Beta", schemes: ["zyraxon"] },
        publish: { provider: "github", owner: "onelpawarai", repo: "ZYRAXON-AI", channel: "latest" },
        rpm: { packageName: "zyraxon-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId,
        productName: "ZYRAXON",
        protocols: { name: "ZYRAXON", schemes: ["zyraxon"] },
        publish: { provider: "github", owner: "onelpawarai", repo: "ZYRAXON-AI", channel: "latest" },
        deb: { fpm: [legacyDesktopEntryFpm] },
        rpm: { packageName: "zyraxon", fpm: [legacyDesktopEntryFpm] },
      }
    }
  }
}

export default getConfig()
