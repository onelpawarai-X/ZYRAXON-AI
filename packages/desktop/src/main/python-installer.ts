// Auto Python Installer — Downloads and installs Python if not found
// Supports Windows, macOS, Linux. Silent background install.
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { createWriteStream } from "node:fs"

const execFileAsync = promisify(execFile)

const PYTHON_DIR = join(homedir(), ".zyraxon", "python")
const PYTHON_MARKER = join(PYTHON_DIR, ".installed")
const INSTALL_TIMEOUT = 120_000 // 2 minutes for download + install
const DETECT_TIMEOUT = 3000 // 3s per detection attempt (async, non-blocking)

const PYTHON_VERSION = "3.12.8"

interface PythonInfo {
  path: string
  version: string
  available: boolean
}

/**
 * Async Python detection — runs all candidates in parallel, returns first hit
 */
async function detectSystemPython(): Promise<PythonInfo | null> {
  const isWindows = process.platform === "win32"
  const commands = isWindows
    ? ["python3", "python", "py"]
    : ["python3", "python", "python3.12", "python3.11"]

  // Run all detection attempts in parallel for speed
  const results = await Promise.allSettled(
    commands.map(async (cmd) => {
      try {
        const baseCmd = cmd.split(" ")[0]
        const { stdout } = await execFileAsync(baseCmd, ["--version"], {
          encoding: "utf8",
          timeout: DETECT_TIMEOUT,
        })
        const match = stdout.trim().match(/Python (\d+\.\d+\.\d+)/)
        if (!match) return null

        let fullPath = cmd
        try {
          if (isWindows) {
            const { stdout: whereOut } = await execFileAsync("where", [baseCmd], {
              encoding: "utf8",
              timeout: 2000,
            })
            fullPath = whereOut.trim().split("\n")[0].trim()
          } else {
            const { stdout: whichOut } = await execFileAsync("which", [baseCmd], {
              encoding: "utf8",
              timeout: 2000,
            })
            fullPath = whichOut.trim()
          }
        } catch {}

        return {
          path: fullPath,
          version: match[1],
          available: true,
        }
      } catch {
        return null
      }
    }),
  )

  // Return first successful detection
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      return result.value
    }
  }

  // Check if we installed Python ourselves
  if (existsSync(PYTHON_MARKER)) {
    const markerContent = require("node:fs").readFileSync(PYTHON_MARKER, "utf8").trim()
    const localPython = join(PYTHON_DIR, process.platform === "win32" ? "python.exe" : "bin/python3")
    if (existsSync(localPython)) {
      return { path: localPython, version: markerContent, available: true }
    }
  }

  return null
}

/**
 * Download file with streaming
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

  const url = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`
  console.log(`[Python Installer] Downloading Python ${PYTHON_VERSION} for Windows...`)

  await downloadFile(url, zipPath)
  console.log("\n[Python Installer] Extracting...")

  await execFileAsync("powershell", [
    "-Command",
    `Expand-Archive -Path '${zipPath}' -DestinationPath '${PYTHON_DIR}' -Force`,
  ], { timeout: 60_000 })

  // Enable pip — uncomment import site
  const pthFiles = require("node:fs")
    .readdirSync(PYTHON_DIR)
    .filter((f: string) => f.endsWith("._pth"))
  for (const pthFile of pthFiles) {
    const pthPath = join(PYTHON_DIR, pthFile)
    let content = require("node:fs").readFileSync(pthPath, "utf8")
    content = content.replace(/^#import site$/m, "import site")
    require("node:fs").writeFileSync(pthPath, content, "utf8")
  }

  // Install pip
  const getPipPath = join(PYTHON_DIR, "get-pip.py")
  try {
    console.log("[Python Installer] Installing pip...")
    await downloadFile("https://bootstrap.pypa.io/get-pip.py", getPipPath)
    await execFileAsync(pythonExe, [getPipPath], {
      timeout: 60_000,
      cwd: PYTHON_DIR,
    })
  } catch (e) {
    console.log("[Python Installer] pip install failed (non-fatal):", e)
  }

  // Install touchpoint dependencies
  try {
    console.log("[Python Installer] Installing touchpoint dependencies...")
    await execFileAsync(pythonExe, [
      "-m", "pip", "install", "--no-warn-script-location",
      "touchpoint", "mcp", "pywin32", "Pillow",
    ], { timeout: 120_000, cwd: PYTHON_DIR })
  } catch (e) {
    console.log("[Python Installer] Package install failed (non-fatal):", e)
  }

  // Cleanup
  try { require("node:fs").unlinkSync(zipPath) } catch {}
  try { require("node:fs").unlinkSync(getPipPath) } catch {}

  writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
  console.log(`[Python Installer] Python ${PYTHON_VERSION} installed to ${PYTHON_DIR}`)

  return { path: pythonExe, version: PYTHON_VERSION, available: true }
}

/**
 * Install Python on macOS (Homebrew or download)
 */
async function installPythonMacOS(): Promise<PythonInfo> {
  const localPython = join(PYTHON_DIR, "bin", "python3")

  if (!existsSync(PYTHON_DIR)) {
    mkdirSync(PYTHON_DIR, { recursive: true })
  }

  try {
    console.log("[Python Installer] Installing Python via Homebrew...")
    await execFileAsync("brew", ["install", "python@3.12"], { timeout: INSTALL_TIMEOUT })
    const { stdout } = await execFileAsync("brew", ["--prefix", "python@3.12"], {
      encoding: "utf8", timeout: 5000,
    })
    const brewPython = join(stdout.trim(), "bin", "python3.12")
    if (existsSync(brewPython)) {
      writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
      return { path: brewPython, version: PYTHON_VERSION, available: true }
    }
  } catch {}

  console.log("[Python Installer] Downloading Python from python.org...")
  const dmgPath = join(PYTHON_DIR, "python.dmg")
  const url = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-macos11.pkg`
  await downloadFile(url, dmgPath)
  await execFileAsync("sudo", ["installer", "-pkg", dmgPath, "-target", "/"], {
    timeout: INSTALL_TIMEOUT,
  })
  writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
  return { path: "/usr/local/bin/python3.12", version: PYTHON_VERSION, available: true }
}

/**
 * Install Python on Linux (apt, yum, or dnf)
 */
async function installPythonLinux(): Promise<PythonInfo> {
  if (!existsSync(PYTHON_DIR)) {
    mkdirSync(PYTHON_DIR, { recursive: true })
  }

  // Try apt
  try {
    console.log("[Python Installer] Installing Python via apt...")
    await execFileAsync("sudo", [
      "apt-get", "update", "-qq",
    ], { timeout: 30_000 })
    await execFileAsync("sudo", [
      "apt-get", "install", "-y", "-qq", "python3.12", "python3.12-venv", "python3-pip",
    ], { timeout: INSTALL_TIMEOUT })
    const { stdout } = await execFileAsync("which", ["python3.12"], {
      encoding: "utf8", timeout: 5000,
    })
    const pythonPath = stdout.trim()
    writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
    return { path: pythonPath, version: PYTHON_VERSION, available: true }
  } catch {}

  // Try yum
  try {
    console.log("[Python Installer] Installing Python via yum...")
    await execFileAsync("sudo", [
      "yum", "install", "-y", "python3.12", "python3.12-pip",
    ], { timeout: INSTALL_TIMEOUT })
    const { stdout } = await execFileAsync("which", ["python3.12"], {
      encoding: "utf8", timeout: 5000,
    })
    writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
    return { path: stdout.trim(), version: PYTHON_VERSION, available: true }
  } catch {}

  // Try dnf
  try {
    console.log("[Python Installer] Installing Python via dnf...")
    await execFileAsync("sudo", [
      "dnf", "install", "-y", "python3.12", "python3.12-pip",
    ], { timeout: INSTALL_TIMEOUT })
    const { stdout } = await execFileAsync("which", ["python3.12"], {
      encoding: "utf8", timeout: 5000,
    })
    writeFileSync(PYTHON_MARKER, PYTHON_VERSION, "utf8")
    return { path: stdout.trim(), version: PYTHON_VERSION, available: true }
  } catch {}

  throw new Error("Failed to install Python on Linux. Please install Python 3.12 manually.")
}

/**
 * Main entry point: detect or install Python, return path
 */
export async function ensurePython(): Promise<string> {
  // 1. Fast path: check marker file first (sub-ms)
  if (existsSync(PYTHON_MARKER)) {
    const markerContent = require("node:fs").readFileSync(PYTHON_MARKER, "utf8").trim()
    const localPython = join(PYTHON_DIR, process.platform === "win32" ? "python.exe" : "bin/python3")
    if (existsSync(localPython)) {
      return localPython
    }
  }

  // 2. Detect system Python (async, parallel — ~3s max)
  const detected = await detectSystemPython()
  if (detected) {
    console.log(`[Python Installer] Found system Python: ${detected.path} (${detected.version})`)
    return detected.path
  }

  // 3. Install Python (slow path — only on first run)
  console.log("[Python Installer] Python not found. Installing...")
  const installed = await installForPlatform()
  return installed.path
}

function installForPlatform(): Promise<PythonInfo> {
  switch (process.platform) {
    case "win32":
      return installPythonWindows()
    case "darwin":
      return installPythonMacOS()
    default:
      return installPythonLinux()
  }
}
