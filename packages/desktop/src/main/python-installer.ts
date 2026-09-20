// Auto Python Installer — Downloads and installs Python if not found
// Supports Windows, macOS, Linux. Silent background install.
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { execSync } from "node:child_process"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { pipeline } from "node:stream/promises"
import { createWriteStream } from "node:fs"

const execFileAsync = promisify(execFile)

const PYTHON_DIR = join(homedir(), ".zyraxon", "python")
const PYTHON_MARKER = join(PYTHON_DIR, ".installed")
const INSTALL_TIMEOUT = 120_000 // 2 minutes for download + install

// Python versions to try (embeddable for Windows, system for others)
const PYTHON_VERSION = "3.12.8"
const PYTHON_VERSION_SHORT = "3.12"

interface PythonInfo {
  path: string
  version: string
  available: boolean
}

/**
 * Detect if Python is already available on the system
 */
function detectSystemPython(): PythonInfo | null {
  const isWindows = process.platform === "win32"

  // Try multiple Python commands
  const commands = isWindows
    ? ["python3", "python", "py -3", "py"]
    : ["python3", "python", "python3.12", "python3.11", "python3.10"]

  for (const cmd of commands) {
    try {
      const { stdout } = execSync(`${cmd} --version`, {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      })
      const match = stdout.trim().match(/Python (\d+\.\d+\.\d+)/)
      if (match) {
        // Resolve full path
        let fullPath = cmd
        try {
          if (isWindows) {
            const { stdout: whereOut } = execSync(`where ${cmd.split(" ")[0]}`, {
              encoding: "utf8",
              timeout: 3000,
              stdio: ["pipe", "pipe", "pipe"],
            })
            fullPath = whereOut.trim().split("\n")[0].trim()
          } else {
            const { stdout: whichOut } = execSync(`which ${cmd}`, {
              encoding: "utf8",
              timeout: 3000,
              stdio: ["pipe", "pipe", "pipe"],
            })
            fullPath = whichOut.trim()
          }
        } catch {}

        return {
          path: fullPath,
          version: match[1],
          available: true,
        }
      }
    } catch {}
  }

  // Check if we installed Python ourselves
  if (existsSync(PYTHON_MARKER)) {
    const markerContent = require("node:fs").readFileSync(PYTHON_MARKER, "utf8").trim()
    const localPython = join(PYTHON_DIR, process.platform === "win32" ? "python.exe" : "bin/python3")
    if (existsSync(localPython)) {
      return {
        path: localPython,
        version: markerContent,
        available: true,
      }
    }
  }

  return null
}

/**
 * Download file with progress (using Node.js fetch + stream)
 */
async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }

  const fileStream = createWriteStream(dest)
  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body")

  let received = 0
  const total = Number(response.headers.get("content-length")) || 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fileStream.write(value)
    received += value.length

    if (total > 0) {
      const pct = Math.round((received / total) * 100)
      process.stdout.write(`\r[Python Installer] Downloading... ${pct}%`)
    }
  }

  fileStream.end()
  await new Promise<void>((resolve, reject) => {
    fileStream.on("finish", resolve)
    fileStream.on("error", reject)
  })
}

/**
 * Install Python on Windows (embeddable package)
 */
async function installPythonWindows(): Promise<PythonInfo> {
  const zipPath = join(PYTHON_DIR, "python.zip")
  const pythonExe = join(PYTHON_DIR, "python.exe")

  if (!existsSync(PYTHON_DIR)) {
    mkdirSync(PYTHON_DIR, { recursive: true })
  }

  // Download Python embeddable package
  const url = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`
  console.log(`[Python Installer] Downloading Python ${PYTHON_VERSION} for Windows...`)

  await downloadFile(url, zipPath)
  console.log("\n[Python Installer] Extracting...")

  // Extract using PowerShell
  execSync(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${PYTHON_DIR}' -Force"`,
    { timeout: 60_000, stdio: "pipe" }
  )

  // Enable pip — uncomment import site in python312._pth
  const pthFiles = require("node:fs")
    .readdirSync(PYTHON_DIR)
    .filter((f: string) => f.endsWith("._pth"))
  for (const pthFile of pthFiles) {
    const pthPath = join(PYTHON_DIR, pthFile)
    let content = require("node:fs").readFileSync(pthPath, "utf8")
    content = content.replace(/^#import site$/m, "import site")
    require("node:fs").writeFileSync(pthPath, content, "utf8")
  }

  // Install pip (get-pip.py)
  const getPipPath = join(PYTHON_DIR, "get-pip.py")
  try {
    console.log("[Python Installer] Installing pip...")
    await downloadFile("https://bootstrap.pypa.io/get-pip.py", getPipPath)
    execSync(`"${pythonExe}" "${getPipPath}"`, {
      timeout: 60_000,
      stdio: "pipe",
      cwd: PYTHON_DIR,
    })
  } catch (e) {
    console.log("[Python Installer] pip install failed (non-fatal):", e)
  }

  // Install required packages for touchpoint-mcp
  try {
    console.log("[Python Installer] Installing touchpoint dependencies...")
    const libsDir = join(PYTHON_DIR, "Lib", "site-packages")
    execSync(
      `"${pythonExe}" -m pip install --no-warn-script-location touchpoint mcp pywin32 Pillow 2>nul`,
      {
        timeout: 120_000,
        stdio: "pipe",
        cwd: PYTHON_DIR,
      }
    )
  } catch (e) {
    console.log("[Python Installer] Package install failed (non-fatal):", e)
  }

  // Cleanup
  try { require("node:fs").unlinkSync(zipPath) } catch {}
  try { require("node:fs").unlinkSync(getPipPath) } catch {}

  // Write marker
  writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
  console.log(`[Python Installer] Python ${PYTHON_VERSION} installed to ${PYTHON_DIR}`)

  return {
    path: pythonExe,
    version: PYTHON_VERSION,
    available: true,
  }
}

/**
 * Install Python on macOS (using Homebrew or dead-snakes)
 */
async function installPythonMacOS(): Promise<PythonInfo> {
  const localPython = join(PYTHON_DIR, "bin", "python3")

  if (!existsSync(PYTHON_DIR)) {
    mkdirSync(PYTHON_DIR, { recursive: true })
  }

  // Try Homebrew first
  try {
    console.log("[Python Installer] Installing Python via Homebrew...")
    execSync("brew install python@3.12", {
      timeout: INSTALL_TIMEOUT,
      stdio: "pipe",
    })
    const { stdout } = execSync("brew --prefix python@3.12", {
      encoding: "utf8",
      timeout: 5000,
      stdio: "pipe",
    })
    const brewPath = stdout.trim()
    const brewPython = join(brewPath, "bin", "python3.12")
    if (existsSync(brewPython)) {
      writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
      return { path: brewPython, version: PYTHON_VERSION, available: true }
    }
  } catch {}

  // Fallback: download from python.org
  console.log("[Python Installer] Downloading Python from python.org...")
  const dmgPath = join(PYTHON_DIR, "python.dmg")
  const url = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-macos11.pkg`

  try {
    await downloadFile(url, dmgPath)
    execSync(`sudo installer -pkg "${dmgPath}" -target /`, {
      timeout: INSTALL_TIMEOUT,
      stdio: "pipe",
    })
    writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
    return { path: "/usr/local/bin/python3.12", version: PYTHON_VERSION, available: true }
  } catch (e) {
    console.error("[Python Installer] macOS install failed:", e)
    throw e
  }
}

/**
 * Install Python on Linux (apt, yum, or compile)
 */
async function installPythonLinux(): Promise<PythonInfo> {
  if (!existsSync(PYTHON_DIR)) {
    mkdirSync(PYTHON_DIR, { recursive: true })
  }

  // Try apt (Debian/Ubuntu)
  try {
    console.log("[Python Installer] Installing Python via apt...")
    execSync("sudo apt-get update -qq && sudo apt-get install -y -qq python3.12 python3.12-venv python3-pip", {
      timeout: INSTALL_TIMEOUT,
      stdio: "pipe",
    })
    const { stdout } = execSync("which python3.12", { encoding: "utf8", timeout: 5000, stdio: "pipe" })
    const pythonPath = stdout.trim()
    writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
    return { path: pythonPath, version: PYTHON_VERSION, available: true }
  } catch {}

  // Try yum (CentOS/RHEL)
  try {
    console.log("[Python Installer] Installing Python via yum...")
    execSync("sudo yum install -y python3.12", {
      timeout: INSTALL_TIMEOUT,
      stdio: "pipe",
    })
    const { stdout } = execSync("which python3.12", { encoding: "utf8", timeout: 5000, stdio: "pipe" })
    const pythonPath = stdout.trim()
    writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
    return { path: pythonPath, version: PYTHON_VERSION, available: true }
  } catch {}

  // Try dnf (Fedora)
  try {
    console.log("[Python Installer] Installing Python via dnf...")
    execSync("sudo dnf install -y python3.12", {
      timeout: INSTALL_TIMEOUT,
      stdio: "pipe",
    })
    const { stdout } = execSync("which python3.12", { encoding: "utf8", timeout: 5000, stdio: "pipe" })
    const pythonPath = stdout.trim()
    writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
    return { path: pythonPath, version: PYTHON_VERSION, available: true }
  } catch {}

  throw new Error("Could not install Python on this Linux distribution")
}

/**
 * Main entry point: ensure Python is available
 * Returns the Python executable path
 */
export async function ensurePython(): Promise<PythonInfo> {
  // 1. Check if Python already exists
  const existing = detectSystemPython()
  if (existing) {
    console.log(`[Python Installer] Python ${existing.version} found at ${existing.path}`)
    return existing
  }

  // 2. Python not found — install automatically
  console.log("[Python Installer] Python not found. Installing automatically...")

  try {
    switch (process.platform) {
      case "win32":
        return await installPythonWindows()
      case "darwin":
        return await installPythonMacOS()
      case "linux":
        return await installPythonLinux()
      default:
        throw new Error(`Unsupported platform: ${process.platform}`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[Python Installer] Auto-install failed: ${msg}`)
    console.error("[Python Installer] Please install Python 3.12+ manually from https://python.org")
    throw e
  }
}

/**
 * Get Python path for MCP use — returns cached result or detects
 */
let _cachedPythonPath: string | null = null

export function getPythonPath(): string {
  if (_cachedPythonPath) return _cachedPythonPath

  // Try system Python first
  const info = detectSystemPython()
  if (info) {
    _cachedPythonPath = info.path
    return info.path
  }

  // Try our installed Python
  if (existsSync(PYTHON_MARKER)) {
    const localPython = join(PYTHON_DIR, process.platform === "win32" ? "python.exe" : "bin/python3")
    if (existsSync(localPython)) {
      _cachedPythonPath = localPython
      return localPython
    }
  }

  // Fallback — will trigger install on next ensurePython() call
  return process.platform === "win32" ? "python" : "python3"
}
