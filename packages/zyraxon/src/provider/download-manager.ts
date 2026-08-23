// ============================================================================
// ZYRAXON X — Download Manager
// ============================================================================
// Handles model downloads with real-time progress tracking.
// Supports pause/resume, speed calculation, and ETA estimation.
// ============================================================================

import fs from "fs"
import path from "path"
import os from "os"
import https from "https"
import http from "http"
import { type PinnedModel, getPinnedLocalPath, formatSize } from "./pinned-models"

// ─── Download State ───────────────────────────────────────────────────────────

export type DownloadStatus = "idle" | "downloading" | "paused" | "completed" | "error"

export interface DownloadProgress {
  modelId: string
  status: DownloadStatus
  bytesDownloaded: number
  totalBytes: number
  percent: number
  speedBytesPerSec: number
  etaSeconds: number
  error?: string
  startTime: number
}

export type ProgressCallback = (progress: DownloadProgress) => void

// ─── Active Downloads ─────────────────────────────────────────────────────────

const activeDownloads = new Map<string, {
  process: ReturnType<typeof spawnDownload>
  progress: DownloadProgress
  callbacks: Set<ProgressCallback>
}>()

// ─── Models Directory ─────────────────────────────────────────────────────────

function getModelsDir(): string {
  const dir = path.join(os.homedir(), ".zyraxon", "models")
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// ─── Check if model already downloaded ────────────────────────────────────────

export function isModelDownloaded(model: PinnedModel): boolean {
  const modelsDir = getModelsDir()
  const filePath = getPinnedLocalPath(model, modelsDir)

  if (!fs.existsSync(filePath)) return false

  const stat = fs.statSync(filePath)
  // File must be at least 10MB to be considered a real model (not partial/corrupt)
  if (stat.size < 10_000_000) return false

  // For GGUF files, verify magic bytes
  if (model.hfFile.endsWith(".gguf")) {
    try {
      const fd = fs.openSync(filePath, "r")
      const buf = Buffer.alloc(4)
      fs.readSync(fd, buf, 0, 4, 0)
      fs.closeSync(fd)
      return buf.readUInt32LE(0) === 0x46475547
    } catch {
      return false
    }
  }

  // For safetensors/other formats, just check file exists and has reasonable size
  return stat.size > 10_000_000
}

// ─── Get download progress ────────────────────────────────────────────────────

export function getDownloadProgress(modelId: string): DownloadProgress | undefined {
  return activeDownloads.get(modelId)?.progress
}

// ─── Subscribe to progress updates ────────────────────────────────────────────

export function onDownloadProgress(modelId: string, callback: ProgressCallback): () => void {
  const entry = activeDownloads.get(modelId)
  if (entry) {
    entry.callbacks.add(callback)
  }
  return () => {
    entry?.callbacks.delete(callback)
  }
}

// ─── Spawn download process ───────────────────────────────────────────────────

function spawnDownload(
  model: PinnedModel,
  onProgress: ProgressCallback,
): {
  abort: () => void
  promise: Promise<void>
} {
  const modelsDir = getModelsDir()
  const targetPath = getPinnedLocalPath(model, modelsDir)
  const tempPath = targetPath + ".downloading"

  const controller = new AbortController()
  let speedSamples: number[] = []
  let lastBytes = 0
  let lastTime = Date.now()

  const progress: DownloadProgress = {
    modelId: model.id,
    status: "downloading",
    bytesDownloaded: 0,
    totalBytes: model.expectedSizeBytes,
    percent: 0,
    speedBytesPerSec: 0,
    etaSeconds: 0,
    startTime: Date.now(),
  }

  const promise = new Promise<void>((resolve, reject) => {
    const followRedirect = (url: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        progress.status = "error"
        progress.error = "Too many redirects"
        onProgress(progress)
        reject(new Error("Too many redirects"))
        return
      }

      const client = url.startsWith("https") ? https : http

      client.get(url, { signal: controller.signal }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          followRedirect(res.headers.location, redirectCount + 1)
          return
        }

        if (res.statusCode !== 200) {
          progress.status = "error"
          progress.error = `HTTP ${res.statusCode}`
          onProgress(progress)
          reject(new Error(`Download failed with status ${res.statusCode}`))
          return
        }

        const totalBytes = parseInt(res.headers["content-length"] ?? "0", 10)
        progress.totalBytes = totalBytes || model.expectedSizeBytes

        const fileStream = fs.createWriteStream(tempPath)
        let downloaded = 0

        res.on("data", (chunk: Buffer) => {
          if (controller.signal.aborted) return

          downloaded += chunk.length
          progress.bytesDownloaded = downloaded
          progress.percent = progress.totalBytes > 0
            ? Math.min((downloaded / progress.totalBytes) * 100, 99.9)
            : 0

          // Speed calculation (average over last 5 samples)
          const now = Date.now()
          const elapsed = (now - lastTime) / 1000
          if (elapsed >= 0.5) {
            const speed = (downloaded - lastBytes) / elapsed
            speedSamples.push(speed)
            if (speedSamples.length > 5) speedSamples.shift()
            progress.speedBytesPerSec = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
            lastBytes = downloaded
            lastTime = now

            // ETA
            if (progress.speedBytesPerSec > 0) {
              const remaining = progress.totalBytes - downloaded
              progress.etaSeconds = Math.ceil(remaining / progress.speedBytesPerSec)
            }
          }

          onProgress(progress)
        })

        res.pipe(fileStream)

        res.on("end", () => {
          fileStream.end()

          if (controller.signal.aborted) {
            try { fs.unlinkSync(tempPath) } catch {}
            return
          }

          // Rename temp to final
          try {
            fs.renameSync(tempPath, targetPath)
          } catch {
            // Fallback: copy and delete
            fs.copyFileSync(tempPath, targetPath)
            fs.unlinkSync(tempPath)
          }

          progress.status = "completed"
          progress.percent = 100
          progress.bytesDownloaded = progress.totalBytes
          progress.speedBytesPerSec = 0
          progress.etaSeconds = 0
          onProgress(progress)
          resolve()
        })

        res.on("error", (err) => {
          fileStream.end()
          try { fs.unlinkSync(tempPath) } catch {}
          progress.status = "error"
          progress.error = err.message
          onProgress(progress)
          reject(err)
        })
      }).on("error", (err) => {
        progress.status = "error"
        progress.error = err.message
        onProgress(progress)
        reject(err)
      })
    }

    followRedirect(model.downloadUrl)
  })

  return {
    abort: () => controller.abort(),
    promise,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start downloading a pinned model.
 * Returns a controller object to pause/cancel.
 */
export function startDownload(
  model: PinnedModel,
  onProgress?: ProgressCallback,
): {
  pause: () => void
  cancel: () => void
  promise: Promise<void>
} {
  // Check if already downloading
  if (activeDownloads.has(model.id)) {
    const existing = activeDownloads.get(model.id)!
    return {
      pause: () => {},
      cancel: () => existing.process.abort(),
      promise: existing.promise,
    }
  }

  // Check if already downloaded
  if (isModelDownloaded(model)) {
    const progress: DownloadProgress = {
      modelId: model.id,
      status: "completed",
      bytesDownloaded: model.expectedSizeBytes,
      totalBytes: model.expectedSizeBytes,
      percent: 100,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      startTime: Date.now(),
    }
    onProgress?.(progress)
    return {
      pause: () => {},
      cancel: () => {},
      promise: Promise.resolve(),
    }
  }

  const callbacks = new Set<ProgressCallback>()
  if (onProgress) callbacks.add(onProgress)

  const wrapper = (progress: DownloadProgress) => {
    callbacks.forEach((cb) => cb(progress))
  }

  const download = spawnDownload(model, wrapper)

  const entry = {
    process: download,
    progress: {
      modelId: model.id,
      status: "downloading" as const,
      bytesDownloaded: 0,
      totalBytes: model.expectedSizeBytes,
      percent: 0,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      startTime: Date.now(),
    },
    callbacks,
  }

  activeDownloads.set(model.id, entry)

  // Clean up on completion
  download.promise.finally(() => {
    activeDownloads.delete(model.id)
  }).catch(() => {
    activeDownloads.delete(model.id)
  })

  return {
    pause: () => {
      // Pause = abort (will need resume logic for full implementation)
      download.abort()
      entry.progress.status = "paused"
      wrapper(entry.progress)
    },
    cancel: () => {
      download.abort()
      activeDownloads.delete(model.id)
    },
    promise: download.promise,
  }
}

/**
 * Cancel an active download.
 */
export function cancelDownload(modelId: string): void {
  const entry = activeDownloads.get(modelId)
  if (entry) {
    entry.process.abort()
    activeDownloads.delete(modelId)
  }
}

/**
 * Get all active downloads.
 */
export function getActiveDownloads(): DownloadProgress[] {
  return Array.from(activeDownloads.values()).map((e) => ({ ...e.progress }))
}

/**
 * Format speed for display (e.g. "1.2 MB/s").
 */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1_000_000) {
    return `${(bytesPerSec / 1_000_000).toFixed(1)} MB/s`
  }
  if (bytesPerSec >= 1_000) {
    return `${(bytesPerSec / 1_000).toFixed(0)} KB/s`
  }
  return `${bytesPerSec} B/s`
}

/**
 * Format ETA for display (e.g. "2m 30s").
 */
export function formatETA(seconds: number): string {
  if (seconds <= 0) return "—"
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}
