// Copyright (c) 2026 onelpawarai. All rights reserved.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { normalizeMedia } from "../src/util/media-normalize"
import { MAX_INLINE_MEDIA_DECODED_BYTES } from "../src/util/media"
import { resolveFfmpegSync } from "../src/util/media-ffmpeg"

// These tests exercise the real ffmpeg pipeline on real files; they are skipped
// when no ffmpeg is resolvable so a bare checkout still passes.
const ffmpeg = resolveFfmpegSync()
const enabled = ffmpeg !== null

function run(bin: string, args: string[]) {
  const result = spawnSync(bin, args, { stdio: "ignore" })
  if (result.status !== 0) throw new Error(`${bin} ${args.join(" ")} failed with ${result.status}`)
}

function probeSeconds(file: string) {
  const probe = ffmpeg!.replace(/ffmpeg(\.exe)?$/, "ffprobe")
  const result = spawnSync(probe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], {
    encoding: "utf8",
  })
  return Number.parseFloat((result.stdout ?? "").trim())
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zyraxon-media-test-"))

// Samples recorded ahead of time live under ZYRAXON_MEDIA_FIXTURES when present;
// otherwise the fixture is generated with the resolved ffmpeg. Both are real
// files fed through the real pipeline.
const fixtures = process.env.ZYRAXON_MEDIA_FIXTURES

/** Return a real sample file, reusing a persistent fixture when it exists. */
function sample(name: string, build: (file: string) => void): string {
  const existing = fixtures ? path.join(fixtures, name) : null
  if (existing && fs.existsSync(existing)) return existing
  const file = path.join(dir, name)
  build(file)
  return file
}

beforeAll(() => {
  fs.mkdirSync(dir, { recursive: true })
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe.if(enabled)("normalizeMedia on real files", () => {
  test("a 2-minute video that already fits is passed through unchanged", async () => {
    const file = sample("short.mp4", (out) =>
      run(ffmpeg!, ["-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15", "-t", "120", "-c:v", "libx264", "-preset", "ultrafast", out]),
    )
    const src = fs.readFileSync(file)
    expect(src.byteLength).toBeLessThan(MAX_INLINE_MEDIA_DECODED_BYTES)
    const parts = await Effect.runPromise(normalizeMedia(file, "video/mp4", src))
    expect(parts).toHaveLength(1)
    expect(parts[0]!.action).toBe("unchanged")
    expect(parts[0]!.data.byteLength).toBe(src.byteLength)
  })

  // These three sample a real long recording: the fixture is generated with the
  // bundled ffmpeg on first run and is orders of magnitude slower than the
  // normalization under test, so each gets its own generous budget rather than
  // the suite-wide 30s. Point ZYRAXON_MEDIA_FIXTURES at pre-recorded files to
  // skip generation entirely.
  test("a 50-minute audio recording is re-encoded to an in-budget mp3 that keeps the timeline", async () => {
    const file = sample("long-audio-50m.mp3", (out) =>
      run(ffmpeg!, ["-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "3000", "-c:a", "libmp3lame", "-b:a", "128k", out]),
    )
    const src = fs.readFileSync(file)
    expect(src.byteLength).toBeGreaterThan(MAX_INLINE_MEDIA_DECODED_BYTES)

    const parts = await Effect.runPromise(normalizeMedia(file, "audio/mpeg", src))
    expect(parts.length).toBeGreaterThanOrEqual(1)
    for (const part of parts) {
      expect(part.action).toBe("audio-clip")
      expect(part.data.byteLength).toBeLessThanOrEqual(MAX_INLINE_MEDIA_DECODED_BYTES)
      expect(part.data.byteLength).toBeGreaterThan(0)
      expect(part.sourceSeconds).toBeGreaterThan(2900)
    }
  }, { timeout: 120_000 })

  test("a two-hour audio recording is split into ordered in-budget parts", async () => {
    const file = sample("long-audio-2h.mp3", (out) =>
      run(ffmpeg!, ["-y", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100", "-t", "7200", "-c:a", "libmp3lame", "-b:a", "128k", out]),
    )
    const src = fs.readFileSync(file)
    expect(src.byteLength).toBeGreaterThan(MAX_INLINE_MEDIA_DECODED_BYTES)

    const parts = await Effect.runPromise(normalizeMedia(file, "audio/mpeg", src))
    expect(parts.length).toBeGreaterThanOrEqual(1)
    for (const [index, part] of parts.entries()) {
      expect(part.action).toBe("audio-clip")
      expect(part.data.byteLength).toBeLessThanOrEqual(MAX_INLINE_MEDIA_DECODED_BYTES)
      expect(part.chunkIndex).toBe(index + 1)
      expect(part.chunkCount).toBe(parts.length)
    }
  }, { timeout: 180_000 })

  test("a one-hour video becomes a timelapse spanning the whole timeline", async () => {
    const file = sample("long-video-1h.mp4", (out) =>
      run(ffmpeg!, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=1280x720:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440",
        "-t",
        "3600",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        out,
      ]),
    )
    const src = fs.readFileSync(file)
    expect(src.byteLength).toBeGreaterThan(MAX_INLINE_MEDIA_DECODED_BYTES)

    const parts = await Effect.runPromise(normalizeMedia(file, "video/mp4", src))
    expect(parts).toHaveLength(1)
    const part = parts[0]!
    expect(part.data.byteLength).toBeLessThanOrEqual(MAX_INLINE_MEDIA_DECODED_BYTES)
    expect(part.data.byteLength).toBeGreaterThan(0)
    expect(part.sourceSeconds).toBeGreaterThan(3500)
    // The output must be a playable video that still spans a usable duration.
    const out = path.join(dir, "normalized-1h.mp4")
    fs.writeFileSync(out, part.data)
    expect(probeSeconds(out)).toBeGreaterThan(0)
  }, { timeout: 600_000 })
})
