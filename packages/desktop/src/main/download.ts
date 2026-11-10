// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createWriteStream } from "node:fs"
import { rm } from "node:fs/promises"

export const defaultDownloadTimeoutMs = 60_000

/**
 * Stream a URL to a file, bounded in time, with no half-written file left behind.
 *
 * A bare `fetch` + `reader.read()` loop has no ceiling: a stalled connection
 * leaves the promise pending forever, and the partial file it already wrote
 * looks complete to the next run. Both are what make an install appear to hang
 * for minutes, so the request is aborted on timeout and the destination is
 * removed on any failure.
 */
export async function downloadFile(
  url: string,
  dest: string,
  options?: { timeoutMs?: number; onProgress?: (percent: number) => void },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? defaultDownloadTimeoutMs
  const fileStream = createWriteStream(dest)
  const cleanup = async (error: Error): Promise<never> => {
    fileStream.destroy()
    await rm(dest, { force: true }).catch(() => {})
    throw error
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return await cleanup(new Error(`Download failed: ${response.status} ${response.statusText}`))

    const reader = response.body?.getReader()
    if (!reader) return await cleanup(new Error("No response body"))

    let received = 0
    const total = Number(response.headers.get("content-length")) || 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fileStream.write(value)
      received += value.length
      if (total > 0) options?.onProgress?.(Math.round((received / total) * 100))
    }

    fileStream.end()
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve)
      fileStream.on("error", reject)
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return await cleanup(new Error(`Download failed for ${url}: ${reason}`))
  }
}
