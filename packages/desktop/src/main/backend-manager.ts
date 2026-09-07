// ============================================================================
// ZYRAXON Desktop — Backend Manager
// ============================================================================
// Manages all local model backends from the Electron main process.
// Each backend runs as a separate process.
// ============================================================================

import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"
import https from "https"
import http from "http"

// ─── Types ────────────────────────────────────────────────────────────────────

export type BackendType = "llama-server" | "python-diffusion" | "python-audiocraft" | "python-bark"

export interface BackendStatus {
  type: BackendType
  running: boolean
  port: number
  pid: number | null
  error?: string
}

// ─── Port ranges ──────────────────────────────────────────────────────────────

const PORT_RANGES: Record<BackendType, [number, number]> = {
  "llama-server": [11539, 11549],
  "python-diffusion": [11550, 11559],
  "python-audiocraft": [11560, 11569],
  "python-bark": [11570, 11579],
}

// ─── Backend State ────────────────────────────────────────────────────────────

interface BackendEntry {
  type: BackendType
  process: ChildProcess
  port: number
  ready: Promise<number>
}

const backends = new Map<BackendType, BackendEntry>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getModelsDir(): string {
  const dir = path.join(os.homedir(), ".zyraxon", "models")
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getBackendsDir(): string {
  const dir = path.join(os.homedir(), ".zyraxon", "backends")
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function findPython(): string | null {
  const isWin = process.platform === "win32"
  const isMac = process.platform === "darwin"
  const homeDir = os.homedir()
  
  const candidates = isWin
    ? [
        "python",
        "python3",
        "py",
        path.join(homeDir, "AppData", "Local", "Programs", "Python", "Python312", "python.exe"),
        path.join(homeDir, "AppData", "Local", "Programs", "Python", "Python311", "python.exe"),
        path.join(homeDir, "AppData", "Local", "Programs", "Python", "Python310", "python.exe"),
      ]
    : isMac
      ? [
          "python3",
          "python",
          "/usr/local/bin/python3",
          "/opt/homebrew/bin/python3",
        ]
      : [
          "python3",
          "python",
          "/usr/bin/python3",
          "/usr/bin/python",
        ]
  for (const cmd of candidates) {
    try {
      const { execSync } = require("child_process")
      execSync(`"${cmd}" --version`, { stdio: "ignore", timeout: 5000 })
      return cmd
    } catch {}
  }
  return null
}

function findLlamaServer(): string | null {
  const homeDir = os.homedir()
  const candidates = [
    path.join(homeDir, ".zyraxon", "llama-server.exe"),
    path.join(homeDir, ".zyraxon", "llama-server"),
    "llama-server",
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function waitForHealth(port: number, timeoutMs = 30000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`)
        if (res.ok) { resolve(true); return }
      } catch {}
      if (Date.now() - start > timeoutMs) { resolve(false); return }
      setTimeout(check, 500)
    }
    check()
  })
}

function copyBuiltinScript(scriptName: string): string {
  const target = path.join(getBackendsDir(), scriptName)
  if (fs.existsSync(target)) return target

  // Try multiple source locations
  const sources = [
    path.join(__dirname, "..", "..", "resources", "python-backends", scriptName),
    path.join(__dirname, "..", "resources", "python-backends", scriptName),
    path.join(process.resourcesPath || "", "python-backends", scriptName),
  ]

  for (const src of sources) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, target)
      return target
    }
  }

  throw new Error(`Backend script ${scriptName} not found in any location`)
}

// ─── Start llama-server ───────────────────────────────────────────────────────

async function startLlamaServer(modelPath: string, serverFlags: string[] = []): Promise<BackendEntry> {
  const existing = backends.get("llama-server")
  if (existing) return existing

  const bin = findLlamaServer()
  if (!bin) throw new Error("llama-server not found. Install llama.cpp to ~/.zyraxon/")

  const port = PORT_RANGES["llama-server"][0]
  const args = ["-m", modelPath, "--host", "127.0.0.1", "--port", String(port), ...serverFlags, "--log-disable"]

  const proc = spawn(bin, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, LLAMA_N_GPU_LAYERS: "0" },
    windowsHide: true,
  })

  let started = false
  let stderr = ""

  const ready = new Promise<number>((resolve, reject) => {
    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString()
      if (!started && (text.includes("listening") || text.includes("server") || text.includes("ready"))) {
        started = true
        setTimeout(() => resolve(port), 500)
      }
    })
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
      if (!started && (stderr.includes("listening") || stderr.includes(" bound"))) {
        started = true
        setTimeout(() => resolve(port), 500)
      }
    })
    proc.on("error", (err) => { backends.delete("llama-server"); reject(err) })
    proc.on("exit", (code) => {
      backends.delete("llama-server")
      if (!started) reject(new Error(`llama-server exited ${code}: ${stderr.slice(-300)}`))
    })
    setTimeout(() => { if (!started) { proc.kill(); reject(new Error("Timeout")) } }, 60000)
  })

  const entry: BackendEntry = { type: "llama-server", process: proc, port, ready }
  backends.set("llama-server", entry)
  return entry
}

// ─── Start Python backend ─────────────────────────────────────────────────────

async function startPythonBackend(type: BackendType, scriptName: string, extraArgs: string[] = []): Promise<BackendEntry> {
  const existing = backends.get(type)
  if (existing) return existing

  const python = findPython()
  if (!python) throw new Error("Python not found — install Python 3.10+")

  const scriptPath = copyBuiltinScript(scriptName)
  const port = PORT_RANGES[type][0]
  const args = [scriptPath, "--port", String(port), ...extraArgs]

  const proc = spawn(python, args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  })

  let stderr = ""

  const ready = new Promise<number>((resolve, reject) => {
    proc.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("ready") || chunk.toString().includes("Uvicorn")) {
        setTimeout(() => resolve(port), 1000)
      }
    })
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.includes("ready") || stderr.includes("Uvicorn")) {
        setTimeout(() => resolve(port), 1000)
      }
    })
    proc.on("error", (err) => { backends.delete(type); reject(err) })
    proc.on("exit", (code) => { backends.delete(type); if (code !== 0) reject(new Error(`${type} exited ${code}`)) })
    setTimeout(() => { if (!backends.has(type)) reject(new Error(`${type} timeout`)) }, 120000)
  })

  const entry: BackendEntry = { type, process: proc, port, ready }
  backends.set(type, entry)
  return entry
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startBackend(type: BackendType, modelPath: string, serverFlags: string[] = []): Promise<{ port: number }> {
  let entry: BackendEntry
  if (type === "llama-server") {
    entry = await startLlamaServer(modelPath, serverFlags)
  } else {
    const scripts: Record<string, string> = {
      "python-diffusion": "diffusion_server.py",
      "python-audiocraft": "audiocraft_server.py",
      "python-bark": "bark_server.py",
    }
    entry = await startPythonBackend(type, scripts[type] || "", ["--model", modelPath])
  }
  return { port: await entry.ready }
}

export function stopBackend(type: BackendType): void {
  const entry = backends.get(type)
  if (entry) { entry.process.kill(); backends.delete(type) }
}

export function stopAllBackends(): void {
  for (const [type] of backends) stopBackend(type)
}

export function getAllBackendStatuses(): BackendStatus[] {
  const types: BackendType[] = ["llama-server", "python-diffusion", "python-audiocraft", "python-bark"]
  return types.map((type) => {
    const entry = backends.get(type)
    if (!entry) return { type, running: false, port: 0, pid: null }
    return { type, running: !entry.process.killed, port: entry.port, pid: entry.process.pid ?? null }
  })
}

// ─── Generation APIs ──────────────────────────────────────────────────────────

async function apiCall<T>(port: number, endpoint: string, body: any): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<T>
}

export async function generateImage(modelPath: string, request: { prompt: string; width?: number; height?: number; steps?: number; seed?: number }): Promise<any> {
  const start = Date.now()
  try {
    const { port } = await startBackend("python-diffusion", modelPath)
    const result = await apiCall<any>(port, "/generate", {
      prompt: request.prompt,
      width: request.width || 1024,
      height: request.height || 1024,
      steps: request.steps || 20,
      seed: request.seed,
    })
    return { success: true, ...result, elapsedMs: Date.now() - start }
  } catch (err: any) {
    return { success: false, error: err.message, elapsedMs: Date.now() - start }
  }
}

export async function generateMusic(modelPath: string, request: { prompt: string; duration?: number }): Promise<any> {
  const start = Date.now()
  try {
    const { port } = await startBackend("python-audiocraft", modelPath)
    const result = await apiCall<any>(port, "/generate", request)
    return { success: true, ...result, elapsedMs: Date.now() - start }
  } catch (err: any) {
    return { success: false, error: err.message, elapsedMs: Date.now() - start }
  }
}

export async function generateTTS(text: string, voice: string = "neutral"): Promise<any> {
  const start = Date.now()
  try {
    const { port } = await startBackend("python-bark", "")
    const result = await apiCall<any>(port, "/tts", { text, voice_preset: voice })
    return { success: true, ...result, elapsedMs: Date.now() - start }
  } catch (err: any) {
    return { success: false, error: err.message, elapsedMs: Date.now() - start }
  }
}

export async function generateVideo(modelPath: string, request: { prompt: string; numFrames?: number }): Promise<any> {
  const start = Date.now()
  try {
    const { port } = await startBackend("python-diffusion", modelPath, ["--mode", "video"])
    const result = await apiCall<any>(port, "/generate-video", request)
    return { success: true, ...result, elapsedMs: Date.now() - start }
  } catch (err: any) {
    return { success: false, error: err.message, elapsedMs: Date.now() - start }
  }
}

process.on("exit", stopAllBackends)
process.on("SIGINT", () => { stopAllBackends(); process.exit(0) })
process.on("SIGTERM", () => { stopAllBackends(); process.exit(0) })
