// Copyright (c) 2026 onelpawarai. All rights reserved.
//
// Local media generation for the ZYRAXON server.
//
// The Python backends under desktop/resources/python-backends already know how
// to run FLUX/SD (image + video frames), MusicGen (music) and Bark (speech).
// This module starts them on demand and talks to them over HTTP, so the same
// feature works from the server without Electron in the middle.
//
// Discovery order matches the MCP resource resolver: an explicit
// ZYRAXON_RESOURCES_PATH wins, then Electron's resourcesPath, then the repo
// layout used during development.

import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import * as child_process from "child_process"

export type MediaKind = "image" | "video" | "music"

export interface MediaBackendInfo {
  name: string
  available: boolean
  script?: string
}

interface BackendSpec {
  name: string
  script: string
  /** Port the FastAPI server listens on when the caller does not pin one. */
  port: number
  modelName: string
  args: string[]
}

const SPECS: Record<MediaKind, BackendSpec> = {
  image: { name: "diffusion", script: "diffusion_server.py", port: 11550, modelName: "image", args: [] },
  video: { name: "diffusion", script: "diffusion_server.py", port: 11550, modelName: "image", args: ["--mode", "video"] },
  music: { name: "audiocraft", script: "audiocraft_server.py", port: 11560, modelName: "music", args: [] },
}

interface Running {
  proc: child_process.ChildProcess
  port: number
}

const running = new Map<string, Running>()

/** Directory that holds the bundled python-backends scripts. */
function backendsDir(): string | null {
  const candidates: string[] = []
  if (process.env.ZYRAXON_RESOURCES_PATH) {
    candidates.push(path.join(process.env.ZYRAXON_RESOURCES_PATH, "python-backends"))
  }
  const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath
  if (resourcesPath) candidates.push(path.join(resourcesPath, "python-backends"))
  candidates.push(path.resolve(import.meta.dir, "../../../../desktop/resources/python-backends"))
  candidates.push(path.resolve(import.meta.dir, "../../../desktop/resources/python-backends"))
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function pythonBin(): string | null {
  for (const candidate of ["python3", "python"]) {
    const probe = child_process.spawnSync(candidate, ["--version"], { encoding: "utf-8" })
    if (probe.status === 0) return candidate
  }
  return null
}

/** Report which media backends can actually run on this machine. */
export function detectMediaBackends(): MediaBackendInfo[] {
  const dir = backendsDir()
  const python = pythonBin()
  return Object.values(SPECS)
    .filter((spec, index, all) => all.findIndex((other) => other.script === spec.script) === index)
    .map((spec) => ({
      name: spec.name,
      available: !!dir && !!python && fs.existsSync(path.join(dir, spec.script)),
      script: dir ? path.join(dir, spec.script) : undefined,
    }))
}

function modelsDir(): string {
  const dir = path.join(os.homedir(), ".zyraxon", "models")
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** A GGUF/SafeTensors file whose name looks like the requested modality. */
function findLocalModel(kind: MediaKind): string | undefined {
  const dir = modelsDir()
  let entries: string[] = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return undefined
  }
  const pattern =
    kind === "music"
      ? /(musicgen|audiocraft)/i
      : kind === "video"
        ? /(wan|svd|cogvideo|animatediff)/i
        : /(flux|sdxl|stable-diffusion|sd3|diffusion)/i
  const match = entries.find((name) => pattern.test(name))
  return match ? path.join(dir, match) : undefined
}

async function isPortFree(port: number): Promise<boolean> {
  const net = await import("net")
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once("error", () => resolve(false))
    probe.once("listening", () => probe.close(() => resolve(true)))
    probe.listen(port, "127.0.0.1")
  })
}

async function nextFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 40; port++) {
    if (await isPortFree(port)) return port
  }
  throw new Error(`no free port near ${start}`)
}

async function waitHealthy(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error("media backend did not become healthy in time")
}

/**
 * Start (or reuse) the Python backend for a modality.
 *
 * The first run installs torch/diffusers/transformers, which can take several
 * minutes, so the health wait is generous rather than a short timeout that would
 * report a working install as broken.
 */
async function ensureBackend(kind: MediaKind): Promise<Running> {
  const spec = SPECS[kind]
  const existing = running.get(spec.name)
  if (existing && !existing.proc.killed) return existing

  const dir = backendsDir()
  if (!dir) throw new Error("python-backends directory not found")
  const python = pythonBin()
  if (!python) throw new Error("python3 not found on PATH")

  const script = path.join(dir, spec.script)
  if (!fs.existsSync(script)) throw new Error(`${spec.script} not found`)

  const port = await nextFreePort(spec.port)
  const model = findLocalModel(kind)
  const args = [script, "--port", String(port), ...spec.args]
  if (model) args.push("--model", model)

  const proc = child_process.spawn(python, args, { stdio: "ignore", cwd: dir })
  const handle: Running = { proc, port }
  running.set(spec.name, handle)
  proc.on("exit", () => running.delete(spec.name))
  await waitHealthy(port, 900_000)
  return handle
}

export interface GeneratedMedia {
  kind: MediaKind
  path: string
  mime: string
  bytes: Uint8Array
}

function mimeFor(kind: MediaKind, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".gif") return "image/gif"
  if (ext === ".mp4") return "video/mp4"
  if (ext === ".wav") return "audio/wav"
  if (ext === ".mp3") return "audio/mpeg"
  return kind === "image" ? "image/png" : kind === "video" ? "video/mp4" : "audio/wav"
}

/**
 * Generate media with the local Python backend and return the bytes.
 *
 * The backend writes the file itself and hands back a path plus base64. Both are
 * read here so callers can either stream the bytes or quote the path.
 */
export async function generate(kind: MediaKind, prompt: string, options: { durationSeconds?: number } = {}): Promise<GeneratedMedia> {
  const handle = await ensureBackend(kind)
  const endpoint = kind === "video" ? "/generate-video" : "/generate"
  const payload =
    kind === "video"
      ? { prompt, num_frames: Math.max(4, Math.min((options.durationSeconds ?? 4) * 4, 32)) }
      : kind === "music"
        ? { prompt, duration: Math.max(2, Math.min(options.durationSeconds ?? 20, 30)) }
        : { prompt, width: 512, height: 512, steps: 20 }

  const res = await fetch(`http://127.0.0.1:${handle.port}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(1_800_000),
  })
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean
    error?: string
    image_path?: string
    video_path?: string
    audio_path?: string
    image_base64?: string
    audio_base64?: string
  }
  if (!res.ok || body.success === false) {
    throw new Error(body.error ?? `media backend replied ${res.status}`)
  }

  const filePath = body.image_path ?? body.video_path ?? body.audio_path
  const base64 = body.image_base64 ?? body.audio_base64
  if (base64) {
    return { kind, path: filePath ?? "", mime: mimeFor(kind, filePath ?? ""), bytes: Uint8Array.from(Buffer.from(base64, "base64")) }
  }
  if (!filePath) throw new Error("media backend returned no file")
  return { kind, path: filePath, mime: mimeFor(kind, filePath), bytes: new Uint8Array(fs.readFileSync(filePath)) }
}

export function stopBackends(): void {
  for (const [name, handle] of running) {
    handle.proc.kill("SIGTERM")
    running.delete(name)
  }
}
