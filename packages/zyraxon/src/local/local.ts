// Copyright (c) 2026 onelpawarai. All rights reserved.
//
// Local model runtime for the ZYRAXON server.
//
// Responsibilities:
//   - discover GGUF models the user already has on disk (no hardcoded list)
//   - search the HuggingFace Hub live, without an access token
//   - download a chosen GGUF into the shared model directory
//   - run inference through a managed llama.cpp server (OpenAI-compatible)
//
// Nothing here talks to the UI. The HTTP route group in
// server/routes/instance/httpapi/groups/local.ts exposes these functions.

import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import * as child_process from "child_process"

// The file begins with the ASCII bytes "GGUF" (47 47 55 46). Compared as a
// string rather than a little-endian integer: the previous integer constant
// (0x46475547) did not match those bytes, so every GGUF failed validation and
// the local model system could never see a model that was already on disk.
const GGUF_MAGIC = "GGUF"
const HF_API = "https://huggingface.co/api"

export type ModelKind = "text" | "image" | "video" | "audio"

export interface LocalModel {
  id: string
  name: string
  path: string
  sizeBytes: number
  quantization?: string
  family?: string
  /** Inferred from the file or repo name. */
  kind: ModelKind
}

export interface BackendInfo {
  name: string
  available: boolean
  path?: string
}

export interface HfModel {
  id: string
  downloads: number
  likes: number
  pipelineTag?: string
  kind: ModelKind
}

export interface HfFile {
  name: string
  sizeBytes: number
}

export interface DownloadProgress {
  id: string
  filename: string
  receivedBytes: number
  totalBytes: number
  done: boolean
  error?: string
}

// ─── Paths ────────────────────────────────────────────────────────────────────

export function modelDir(): string {
  const dir = path.join(os.homedir(), ".zyraxon", "models")
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function searchDirs(): string[] {
  return [
    modelDir(),
    path.join(os.homedir(), "Downloads"),
    path.join(os.homedir(), ".ollama", "models"),
    path.join(os.homedir(), ".cache", "huggingface", "hub"),
  ]
}

// ─── Discovery ────────────────────────────────────────────────────────────────

function isGguf(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r")
    const buf = Buffer.alloc(4)
    fs.readSync(fd, buf, 0, 4, 0)
    fs.closeSync(fd)
    return buf.toString("ascii") === GGUF_MAGIC
  } catch {
    return false
  }
}

const QUANT = /(Q2_K|Q3_K_S|Q3_K_M|Q3_K_L|Q4_0|Q4_K_S|Q4_K_M|Q5_0|Q5_K_S|Q5_K_M|Q6_K|Q8_0|F16|F32|IQ\d_\w+)/i
const FAMILY = /(llama|mistral|codellama|phi|qwen|gemma|deepseek|yi|mixtral|command|smollm|tinyllama)/i

function classify(name: string): ModelKind {
  const n = name.toLowerCase()
  if (/(flux|sdxl|stable-diffusion|sd3|kolors|image)/.test(n)) return "image"
  if (/(wan|video|svd|cogvideo|ltx|animatediff|hunyuan)/.test(n)) return "video"
  if (/(musicgen|audiocraft|bark|tts|xtts|whisper|vocoder|audio|speech)/.test(n)) return "audio"
  return "text"
}

function walk(dir: string, out: string[], depth = 0) {
  if (depth > 6) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out, depth + 1)
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".gguf")) out.push(full)
  }
}

/** Scan the user's machine for GGUF models that are already present. */
export function scanModels(): LocalModel[] {
  const files: string[] = []
  for (const dir of searchDirs()) if (fs.existsSync(dir)) walk(dir, files)
  const models: LocalModel[] = []
  const seen = new Set<string>()
  for (const full of files) {
    if (seen.has(full)) continue
    seen.add(full)
    if (!isGguf(full)) continue
    let size = 0
    try {
      size = fs.statSync(full).size
    } catch {
      continue
    }
    const base = path.basename(full).replace(/\.gguf$/i, "")
    models.push({
      id: base,
      name: base,
      path: full,
      sizeBytes: size,
      quantization: base.match(QUANT)?.[0]?.toUpperCase(),
      family: base.match(FAMILY)?.[1]?.toLowerCase(),
      kind: classify(base),
    })
  }
  return models.sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Backends ─────────────────────────────────────────────────────────────────

/** Locate a llama.cpp server binary, checking the bundled toolchain first. */
export function findLlamaServer(): string | null {
  const candidates = [
    path.join(os.homedir(), ".zyraxon", "llama-server"),
    "/workspace/.tooling/llama/build/bin/llama-server",
    path.join(os.homedir(), ".zyraxon", "llama-server.exe"),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  const which = child_process.spawnSync("which", ["llama-server"], { encoding: "utf-8" })
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split("\n")[0]
  return null
}

export function detectBackends(): BackendInfo[] {
  const server = findLlamaServer()
  const ollama = child_process.spawnSync("which", ["ollama"], { encoding: "utf-8" })
  return [
    { name: "llama-server", available: server !== null, path: server ?? undefined },
    { name: "ollama", available: ollama.status === 0, path: ollama.stdout?.trim() || undefined },
  ]
}

// ─── HuggingFace (no token) ───────────────────────────────────────────────────

/** Live Hub search. Uses the public API, which needs no access token. */
export async function searchHf(query: string, limit = 24): Promise<HfModel[]> {
  const url = `${HF_API}/models?search=${encodeURIComponent(query)}&filter=gguf&sort=downloads&direction=-1&limit=${limit}`
  const res = await fetchWithRetry(url, { headers: { accept: "application/json" } })
  // The Hub's JSON search endpoint intermittently answers 5xx while the site's
  // own full-text search stays up, so fall back to scraping that page rather
  // than failing the panel. The rows carry no download counts, but the repo ids
  // are the part the user needs to pick a model.
  if (!res.ok) return searchHfFallback(query, limit)
  const rows = (await res.json()) as Array<{
    id: string
    downloads?: number
    likes?: number
    pipeline_tag?: string
  }>
  return rows.map((r) => ({
    id: r.id,
    downloads: r.downloads ?? 0,
    likes: r.likes ?? 0,
    pipelineTag: r.pipeline_tag,
    kind: classify(r.id),
  }))
}

const HF_HTML_SEARCH = "https://huggingface.co/search/full-text"
const NON_REPO_PATHS = new Set(["join", "inference", "api", "avatars", "blog", "docs", "pricing", "spaces", "datasets", "models", "search"])

async function searchHfFallback(query: string, limit: number): Promise<HfModel[]> {
  const res = await fetchWithRetry(`${HF_HTML_SEARCH}?q=${encodeURIComponent(`${query} gguf`)}&type=model`)
  if (!res.ok) throw new Error(`HuggingFace search failed: ${res.status}`)
  const html = await res.text()
  const seen = new Set<string>()
  const models: HfModel[] = []
  for (const match of html.matchAll(/href="\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)"/g)) {
    const id = match[1]
    const owner = id.split("/")[0]
    if (NON_REPO_PATHS.has(owner) || seen.has(id)) continue
    seen.add(id)
    models.push({ id, downloads: 0, likes: 0, kind: classify(id) })
    if (models.length >= limit) break
  }
  return models
}

async function fetchWithRetry(url: string, init?: RequestInit, attempts = 3): Promise<Response> {
  let last: Response | undefined
  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await fetch(url, init)
    if (last.ok) return last
    // 4xx other than 429 is a real answer, so only retry transient 5xx/429.
    if (last.status < 500 && last.status !== 429) return last
  }
  return last!
}

/** List the GGUF files inside a Hub repo, with sizes. */
export async function listHfFiles(repo: string): Promise<HfFile[]> {
  const res = await fetch(`${HF_API}/models/${repo}?blobs=true`, { headers: { accept: "application/json" } })
  if (!res.ok) throw new Error(`HuggingFace repo lookup failed: ${res.status}`)
  const data = (await res.json()) as { siblings?: Array<{ rfilename: string; size?: number }> }
  return (data.siblings ?? [])
    .filter((s) => s.rfilename.toLowerCase().endsWith(".gguf"))
    .map((s) => ({ name: s.rfilename, sizeBytes: s.size ?? 0 }))
    .sort((a, b) => a.sizeBytes - b.sizeBytes)
}

// ─── Download ─────────────────────────────────────────────────────────────────

const downloads = new Map<string, DownloadProgress>()

export function downloadProgress(id: string): DownloadProgress | undefined {
  return downloads.get(id)
}

export function allDownloads(): DownloadProgress[] {
  return [...downloads.values()]
}

/**
 * Stream a file from the Hub into the model directory. Progress is recorded in
 * memory so the UI can poll it; the promise resolves when the file is complete.
 */
export async function downloadHfFile(repo: string, file: string): Promise<LocalModel> {
  const id = `${repo}::${file}`
  const filename = path.basename(file)
  const target = path.join(modelDir(), filename)
  const url = `https://huggingface.co/${repo}/resolve/main/${file}`

  if (fs.existsSync(target) && isGguf(target)) {
    const stat = fs.statSync(target)
    downloads.set(id, { id, filename, receivedBytes: stat.size, totalBytes: stat.size, done: true })
    return { id: filename.replace(/\.gguf$/i, ""), name: filename.replace(/\.gguf$/i, ""), path: target, sizeBytes: stat.size, kind: classify(filename) }
  }

  const progress: DownloadProgress = { id, filename, receivedBytes: 0, totalBytes: 0, done: false }
  downloads.set(id, progress)

  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok || !res.body) {
    progress.error = `Download failed: ${res.status}`
    throw new Error(progress.error)
  }
  progress.totalBytes = Number(res.headers.get("content-length") ?? 0)

  const tmp = `${target}.downloading`
  const out = fs.createWriteStream(tmp)
  const reader = res.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        out.write(Buffer.from(value))
        progress.receivedBytes += value.length
      }
    }
  } finally {
    await new Promise<void>((resolve) => out.end(resolve))
  }

  if (!isGguf(tmp)) {
    fs.rmSync(tmp, { force: true })
    progress.error = "Downloaded file is not a valid GGUF"
    throw new Error(progress.error)
  }
  fs.renameSync(tmp, target)
  progress.done = true
  const stat = fs.statSync(target)
  return { id: filename.replace(/\.gguf$/i, ""), name: filename.replace(/\.gguf$/i, ""), path: target, sizeBytes: stat.size, kind: classify(filename) }
}

export function deleteModel(name: string): boolean {
  const target = path.join(modelDir(), name)
  if (!fs.existsSync(target)) return false
  fs.rmSync(target, { force: true })
  return true
}

// ─── Inference (managed llama-server) ─────────────────────────────────────────

interface ServerHandle {
  proc: child_process.ChildProcess
  port: number
  modelPath: string
}

const servers = new Map<string, ServerHandle>()

async function waitHealthy(port: number, timeoutMs = 180000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error("llama-server did not become healthy in time")
}

// A stale llama-server from an earlier run can still hold a port, and binding a
// new one to the same number fails silently: the old process keeps answering and
// the new flags (notably `--jinja`) never take effect. Probe before choosing so
// every server owns a genuinely free port.
async function isPortFree(port: number): Promise<boolean> {
  const net = await import("net")
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once("error", () => resolve(false))
    probe.once("listening", () => probe.close(() => resolve(true)))
    probe.listen(port, "127.0.0.1")
  })
}

async function nextFreePort(): Promise<number> {
  for (let port = 11539; port < 11639; port++) {
    if (await isPortFree(port)) return port
  }
  throw new Error("no free port for llama-server")
}

async function ensureServer(modelPath: string): Promise<ServerHandle> {
  const existing = servers.get(modelPath)
  if (existing && !existing.proc.killed) return existing

  const bin = findLlamaServer()
  if (!bin) throw new Error("llama-server binary not found")

  const port = await nextFreePort()
  // The released binary carries a RUNPATH from its build host, so it cannot
  // find the .so files that ship beside it. Point the loader at its own folder.
  // `--jinja` enables the chat template, which is what lets the server accept
  // the `tools` param the session sends; without it every chat with tools 500s.
  const proc = child_process.spawn(
    bin,
    [
      "-m", modelPath,
      "--host", "127.0.0.1",
      "--port", String(port),
      // The session sends the whole tool catalog plus history. 8K truncates the
      // prompt mid-schema, which makes small models emit garbage or loop; 32K
      // leaves room for the schemas and a real conversation.
      "--ctx-size", "32768",
      "--jinja",
      "--log-disable",
    ],
    { stdio: "ignore", env: { ...process.env, LD_LIBRARY_PATH: path.dirname(bin) } },
  )
  const handle: ServerHandle = { proc, port, modelPath }
  servers.set(modelPath, handle)
  proc.on("exit", () => servers.delete(modelPath))
  await waitHealthy(port)
  return handle
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export async function chat(modelPath: string, messages: ChatMessage[]): Promise<string> {
  const handle = await ensureServer(modelPath)
  const res = await fetch(`http://127.0.0.1:${handle.port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, max_tokens: 512, temperature: 0.7 }),
  })
  if (!res.ok) throw new Error(`llama-server chat failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ""
}

export function stopServer(modelPath: string): boolean {
  const handle = servers.get(modelPath)
  if (!handle) return false
  handle.proc.kill("SIGTERM")
  servers.delete(modelPath)
  return true
}

// ─── Provider shape ───────────────────────────────────────────────────────────

const MODALITIES = { text: true, audio: false, image: false, video: false, pdf: false }

/**
 * Describe the models on disk as a provider entry. The shape matches
 * `Provider.Info`; the caller casts it, which keeps this module free of a
 * dependency on the provider package (and the cycle that would create).
 */
export function buildLocalProvider(baseURL: string, modelDirPath: string) {
  const models: Record<string, unknown> = {}
  for (const model of scanModels()) {
    const text = model.kind === "text"
    models[model.id] = {
      id: model.id,
      providerID: "local",
      api: { id: model.id, url: baseURL, npm: "@ai-sdk/openai-compatible" },
      name: model.name,
      family: model.family,
      capabilities: {
        temperature: text,
        reasoning: false,
        attachment: false,
        toolcall: text,
        input: MODALITIES,
        output: MODALITIES,
        interleaved: false,
      },
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: { context: 32768, output: 4096 },
      status: "active",
      options: {},
      headers: {},
      release_date: "2024-01-01",
    }
  }
  return {
    id: "local",
    name: "Local Models",
    source: "custom" as const,
    env: [],
    options: { baseURL },
    models,
  }
}

// ─── OpenAI-compatible proxy ──────────────────────────────────────────────────

/**
 * Forward an OpenAI-shaped request to the llama-server holding `modelName`.
 * The upstream server is started on demand, so the caller only has to name the
 * model it wants — never a port or a file path.
 */
export async function proxy(modelName: string, pathname: string, method: string, body: string | undefined, headers: Record<string, string>): Promise<Response> {
  // `/v1/models` is a catalog, not an inference call, so answer it from disk
  // without starting a llama-server for every model.
  if (pathname.endsWith("/models") && method === "GET") {
    const data = scanModels().map((m) => ({ id: m.id, object: "model", owned_by: "local" }))
    return new Response(JSON.stringify({ object: "list", data }), { status: 200, headers: { "content-type": "application/json" } })
  }
  const found = scanModels().find((m) => m.id === modelName || m.name === modelName)
  if (!found) return new Response(JSON.stringify({ error: { message: `Local model not found: ${modelName}` } }), { status: 404, headers: { "content-type": "application/json" } })
  const handle = await ensureServer(found.path)
  const upstream = await fetch(`http://127.0.0.1:${handle.port}${pathname}`, {
    method,
    headers: { "content-type": headers["content-type"] ?? "application/json" },
    body: method === "GET" || method === "HEAD" ? undefined : normalizeBody(body),
  })
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      ...(upstream.headers.get("cache-control") ? { "cache-control": upstream.headers.get("cache-control")! } : {}),
    },
  })
}

// llama-server rejects `tool_choice` outright ("Unsupported param") even though
// the OpenAI client always sends it. Its grammar constrains tool use by presence
// alone, so dropping the field keeps tool calling working.
function normalizeBody(body: string | undefined): string | undefined {
  if (!body) return body
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return body
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return body
  const record = parsed as Record<string, unknown>
  if (!("tool_choice" in record)) return body
  delete record.tool_choice
  return JSON.stringify(record)
}
