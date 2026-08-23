/**
 * ZYRAXON X — Local Model Provider
 * Runs GGUF models locally via llama-server.exe (OpenAI-compatible API).
 * No cloud dependency. Users own their models.
 */
import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"
import net from "net"

// ─── GGUF Magic ──────────────────────────────────────────────────────────────
const GGUF_MAGIC = 0x46475547

function isValidGGUF(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r")
    const buf = Buffer.alloc(4)
    fs.readSync(fd, buf, 0, 4, 0)
    fs.closeSync(fd)
    return buf.readUInt32LE(0) === GGUF_MAGIC
  } catch {
    return false
  }
}

// ─── Model Info ──────────────────────────────────────────────────────────────
export interface LocalModel {
  id: string
  name: string
  path: string
  sizeBytes: number
  sizeMB: number
  quantization: string
  family: string
}

// ─── Find llama-server ───────────────────────────────────────────────────────
export function findLlamaServer(): string | null {
  const candidates = [
    path.join("C:", "zyraxon-workspace", "llama-cpp", "llama-server.exe"),
    path.join("C:", "zyraxon-workspace", "llama.cpp", "llama-server.exe"),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

// ─── Scan for GGUF models ───────────────────────────────────────────────────
export function scanLocalModels(): LocalModel[] {
  const dirs = [
    path.join(os.homedir(), ".zyraxon", "models"),
    path.join("C:", "zyraxon-workspace", "models"),
    path.join(os.homedir(), "models"),
    path.join(os.homedir(), "Downloads"),
  ]

  const models: LocalModel[] = []
  const seen = new Set<string>()

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".gguf")) continue
        const fullPath = path.join(dir, entry.name)
        if (seen.has(fullPath) || !isValidGGUF(fullPath)) continue
        seen.add(fullPath)

        const stat = fs.statSync(fullPath)
        const name = entry.name.replace(/\.gguf$/i, "")
        const nameLower = name.toLowerCase()

        const quantMatch = nameLower.match(
          /(q2_k|q3_k_s|q3_k_m|q3_k_l|q4_0|q4_k_s|q4_k_m|q4_k_l|q5_0|q5_k_s|q5_k_m|q5_k_l|q6_k|q8_0|f16|f32)/
        )
        const familyMatch = nameLower.match(
          /(deepseek|qwen|llama|mistral|phi|gemma|yi|falcon|codellama|mixtral|tinyllama)/
        )

        models.push({
          id: `local-${name}`,
          name,
          path: fullPath,
          sizeBytes: stat.size,
          sizeMB: +(stat.size / 1024 / 1024).toFixed(1),
          quantization: quantMatch?.[1]?.toUpperCase() ?? "UNKNOWN",
          family: familyMatch?.[1] ?? "unknown",
        })
      }
    } catch {}
  }

  return models.sort((a, b) => a.sizeMB - b.sizeMB)
}

// ─── Find free port ──────────────────────────────────────────────────────────
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port
      srv.close(() => resolve(port))
    })
    srv.on("error", reject)
  })
}

// ─── Server Manager ──────────────────────────────────────────────────────────
const LOCAL_PORT = 11539
let serverProcess: ChildProcess | null = null
let serverReady: Promise<number> | null = null

export function getServerPort(): number {
  return LOCAL_PORT
}

export function isServerRunning(): boolean {
  return serverProcess !== null && !serverProcess.killed
}

export async function startServer(modelPath: string): Promise<number> {
  if (isServerRunning() && serverReady) {
    return serverReady
  }

  const serverBin = findLlamaServer()
  if (!serverBin) throw new Error("llama-server.exe not found at C:\\zyraxon-workspace\\llama-cpp\\")

  serverReady = new Promise<number>((resolve, reject) => {
    const args = [
      "-m", modelPath,
      "--host", "127.0.0.1",
      "--port", String(LOCAL_PORT),
      "--ctx-size", "4096",
      "--n-gpu-layers", "0",
      "--log-disable",
    ]

    serverProcess = spawn(serverBin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LLAMA_N_GPU_LAYERS: "0" },
      windowsHide: true,
    })

    let started = false
    let stderr = ""

    serverProcess.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString()
      if (!started && (text.includes("listening") || text.includes("server") || text.includes("ready"))) {
        started = true
        setTimeout(() => resolve(LOCAL_PORT), 500)
      }
    })

    serverProcess.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
      if (!started && (stderr.includes("listening") || stderr.includes(" bound"))) {
        started = true
        setTimeout(() => resolve(LOCAL_PORT), 500)
      }
    })

    serverProcess.on("error", (err) => {
      serverProcess = null
      reject(new Error(`Failed to start llama-server: ${err.message}`))
    })

    serverProcess.on("exit", (code) => {
      serverProcess = null
      if (!started) {
        reject(new Error(`llama-server exited with code ${code}: ${stderr.slice(-500)}`))
      }
    })

    setTimeout(() => {
      if (!started) {
        serverProcess?.kill()
        serverProcess = null
        reject(new Error("llama-server failed to start within 30 seconds"))
      }
    }, 30000)
  })

  return serverReady
}

export function stopServer(): void {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
}

// ─── Wait for server health ──────────────────────────────────────────────────
async function waitForHealth(port: number, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

// ─── Full connect flow ───────────────────────────────────────────────────────
export async function connectModel(
  modelPath: string,
  onStatus?: (status: string) => void
): Promise<{ port: number; baseUrl: string; modelId: string }> {
  onStatus?.("Starting llama-server...")
  const port = await startServer(modelPath)

  onStatus?.("Waiting for server to be ready...")
  const healthy = await waitForHealth(port)
  if (!healthy) throw new Error("llama-server failed health check")

  const modelName = path.basename(modelPath, ".gguf")
  onStatus?.(`Connected! Model: ${modelName}`)

  return {
    port: LOCAL_PORT,
    baseUrl: `http://127.0.0.1:${LOCAL_PORT}/v1`,
    modelId: modelName,
  }
}
