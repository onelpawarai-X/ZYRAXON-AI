// Copyright (c) 2026 onelpawarai. All rights reserved.
//
// Server-side handling for oversized video/audio attachments.
//
// The free-tier gateway rejects a request whose inline base64 media pushes the
// body past its payload limit (an opaque `400 Param Incorrect`). No provider
// accepts a multi-gigabyte request body either, and a user can and will attach a
// two-hour recording or a multi-gigabyte clip. The whole file must still reach
// the model as real media — never as a transcript and never truncated.
//
// Three strategies, chosen by modality:
//   - Audio that does not fit is re-encoded at a lower bitrate and, when even the
//     lowest usable bitrate is too large, split into several ordered parts so the
//     model receives every second of the recording across multiple attachments.
//   - A short video becomes a small re-encoded clip that keeps the whole timeline.
//   - A long video becomes a timelapse that samples frames across the entire
//     timeline, and an unprobeable/failed video becomes a contact sheet. Sampling
//     is O(number of frames), not O(file size), so any duration is processable.
//
// ffmpeg always either already exists or is fetched automatically; the user is
// never asked to install anything.

import { spawn, spawnSync } from "child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { isAudioAttachment, isVideoAttachment, MAX_INLINE_MEDIA_DECODED_BYTES } from "./media"
import { ensureFfmpeg } from "./media-ffmpeg"

export interface NormalizedMedia {
  /** Decoded bytes to inline in the request. */
  readonly data: Buffer
  /** Mime of `data`; may differ from the source when a contact sheet was built. */
  readonly mime: string
  /** What the source became, so callers can note dropped content. */
  readonly action: "unchanged" | "video-clip" | "timelapse" | "audio-clip"
  /** Source duration in seconds, when it could be probed. */
  readonly sourceSeconds?: number
  /** Frames sampled into the contact sheet. */
  readonly sampledFrames?: number
  /** 1-based index of this part when the source was split across several files. */
  readonly chunkIndex?: number
  /** Total number of parts the source was split into. */
  readonly chunkCount?: number
}

// Leave headroom under the hard inline ceiling for the base64/JSON overhead and
// the surrounding prompt, so a single part never trips the gateway limit.
const BUDGET_BYTES = Math.floor(MAX_INLINE_MEDIA_DECODED_BYTES * 0.85)
const MIN_VIDEO_BITRATE = 100_000
const MAX_VIDEO_BITRATE = 4_000_000
const MIN_AUDIO_BITRATE = 24_000
const MAX_AUDIO_BITRATE = 128_000
const AUDIO_BITRATE = 64_000
// Longest real moving segment that still fits the inline budget at the lowest
// usable video bitrate plus audio.
const MAX_CLIP_SECONDS = Math.floor((BUDGET_BYTES * 8) / (MIN_VIDEO_BITRATE + AUDIO_BITRATE))
// A very long video becomes a timelapse: one frame every few seconds, re-encoded
// as a short video so the model still watches the whole timeline in order.
const TIMELAPSE_FRAMES = 300
const TIMELAPSE_WIDTH = 640
// Never split a recording into more than this many parts; a longer recording is
// re-encoded at the floor bitrate inside this many evenly sized parts.
const MAX_AUDIO_PARTS = 24

// ffmpeg and ffprobe are resolved lazily so a first use can download them when
// the machine has neither a bundled copy nor one on PATH.
let ffmpegBinary: string | null = null
let ffprobeBinary: string | null = null

export function mediaNormalizerAvailable() {
  return ffmpegBinary !== null
}

const resolveProbe = (ffmpeg: string) => {
  if (ffprobeBinary) return ffprobeBinary
  const sibling = ffmpeg.replace(/ffmpeg(\.exe)?$/, process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
  if (sibling !== ffmpeg && fs.existsSync(sibling)) return (ffprobeBinary = sibling)
  if (spawnSync("ffprobe", ["-version"], { stdio: "ignore", timeout: 5000 }).status === 0) return (ffprobeBinary = "ffprobe")
  return null
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

const run = (bin: string, args: string[]) =>
  Effect.tryPromise({
    try: () =>
      new Promise<RunResult>((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] }) as import("child_process").ChildProcess
        let stderr = ""
        let stdout = ""
        child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
        child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()))
        child.on("error", reject)
        child.on("close", (code) => resolve({ code, stdout, stderr }))
      }),
    catch: (error) => error,
  })

/** Duration in seconds, from ffprobe when present, otherwise from ffmpeg's banner. */
const probeDuration = (input: string) =>
  Effect.gen(function* () {
    if (ffprobeBinary) {
      const result = yield* run(ffprobeBinary, [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        input,
      ])
      const parsed = Number.parseFloat(result.stdout.trim())
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
    if (!ffmpegBinary) return undefined
    const result = yield* run(ffmpegBinary, ["-i", input])
    const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(result.stderr)
    if (!match) return undefined
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number.parseFloat(match[3])
  }).pipe(Effect.catch(() => Effect.succeed(undefined as number | undefined)))

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Encode a moving clip of at most `seconds` that fits the inline budget. */
function transcodeClip(input: string, output: string, seconds: number, attempt: number) {
  const budget = BUDGET_BYTES * 8 * 0.9 * (attempt === 0 ? 1 : 0.5 ** attempt)
  const bitrate = clamp(Math.floor(budget / seconds) - AUDIO_BITRATE, MIN_VIDEO_BITRATE, MAX_VIDEO_BITRATE)
  return run(ffmpegBinary!, [
    "-y",
    "-i",
    input,
    "-t",
    String(seconds),
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    String(bitrate),
    "-maxrate",
    String(Math.floor(bitrate * 1.3)),
    "-bufsize",
    String(bitrate * 2),
    "-c:a",
    "aac",
    "-b:a",
    String(AUDIO_BITRATE),
    "-movflags",
    "+faststart",
    "-fs",
    String(BUDGET_BYTES),
    output,
  ])
}

/**
 * Re-encode an oversized audio file into one or more ordered MP3 parts.
 *
 * A single part is used whenever the whole recording fits the budget at a
 * reasonable bitrate. When the recording is long enough that even the floor
 * bitrate would exceed a single file, `-f segment` splits it at equal intervals
 * so every second reaches the model, split across parts of the same recording.
 */
function transcodeAudioParts(input: string, workDir: string, duration: number | undefined, attempt: number) {
  // Effective budget shrinks on retry so a marginal overflow still resolves.
  const budget = Math.floor(BUDGET_BYTES * (attempt === 0 ? 1 : 0.6 ** attempt))
  const secondsKnown = duration !== undefined && Number.isFinite(duration) && duration > 0
  // Bitrate a single file would need so the whole recording fits the budget.
  const needed = secondsKnown ? Math.floor((budget * 8) / duration!) : Number.POSITIVE_INFINITY
  // A single part only works when that bitrate is inside the usable band. Below
  // the floor, one file is still too big because it cannot be encoded smaller;
  // above the ceiling, even the highest bitrate overflows. Both cases must split.
  const singleFits = secondsKnown && needed >= MIN_AUDIO_BITRATE && needed <= MAX_AUDIO_BITRATE
  const bitrate = singleFits ? clamp(needed, MIN_AUDIO_BITRATE, MAX_AUDIO_BITRATE) : MIN_AUDIO_BITRATE
  // Segment length that keeps each part comfortably inside the budget.
  const segmentSeconds = Math.max(1, Math.floor((budget * 8) / bitrate))

  const prefix = path.join(workDir, `part-${attempt}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const toOutcome = (result: RunResult, pattern: boolean): AudioOutcome => ({ result, prefix, pattern })
  if (singleFits) {
    return run(ffmpegBinary!, [
      "-y",
      "-i",
      input,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      String(bitrate),
      "-ar",
      "22050",
      "-ac",
      "1",
      `${prefix}.mp3`,
    ]).pipe(Effect.map((result): AudioOutcome => toOutcome(result, false)))
  }

  // Split into ordered segments; `-reset_timestamps` keeps each part playable.
  const pattern = `${prefix}-%05d.mp3`
  return run(ffmpegBinary!, [
    "-y",
    "-i",
    input,
    "-vn",
    "-c:a",
    "libmp3lame",
    "-b:a",
    String(bitrate),
    "-ar",
    "22050",
    "-ac",
    "1",
    "-f",
    "segment",
    "-segment_time",
    String(segmentSeconds),
    "-reset_timestamps",
    "1",
    pattern,
  ]).pipe(Effect.map((result): AudioOutcome => toOutcome(result, true)))
}

interface AudioOutcome {
  readonly result: RunResult
  readonly prefix: string
  readonly pattern: boolean
}

/** Read every produced audio part (single file or `prefix-NNNNN.mp3` segments). */
function readAudioParts(workDir: string, prefix: string, pattern: boolean): Buffer[] {
  const base = path.basename(prefix)
  const files = pattern
    ? fs
        .readdirSync(workDir)
        .filter((name) => name.startsWith(base) && name.endsWith(".mp3"))
        .sort()
    : [`${base}.mp3`]
  const parts: Buffer[] = []
  for (const name of files) {
    const full = path.join(workDir, name)
    try {
      if (fs.existsSync(full)) {
        const bytes = fs.readFileSync(full)
        if (bytes.byteLength > 0 && bytes.byteLength <= MAX_INLINE_MEDIA_DECODED_BYTES) parts.push(bytes)
      }
    } finally {
      try {
        fs.rmSync(full, { force: true })
      } catch {}
    }
  }
  return parts
}

/** Tile `frames` sampled evenly across the whole timeline into one JPEG. */
function transcodeContactSheet(input: string, output: string, duration: number | undefined, frames: number) {
  const rate = duration && duration > 0 ? frames / duration : 1
  return run(ffmpegBinary!, [
    "-y",
    "-i",
    input,
    "-vf",
    `fps=${rate.toFixed(6)},scale=512:-2,tile=6x${Math.ceil(frames / 6)}`,
    "-frames:v",
    "1",
    "-q:v",
    "4",
    output,
  ])
}

/**
 * Turn a very long video into a short timelapse video that spans the whole
 * timeline. Frames are sampled evenly and played back as a real video, so the
 * model watches the full clip in order instead of one static image.
 */
function transcodeTimelapse(input: string, output: string, duration: number | undefined) {
  const frameCount = TIMELAPSE_FRAMES
  // Choose an output frame rate so all sampled frames are played over a short
  // duration. The input filter `fps` picks one frame every duration/frameCount s.
  const inputFps = duration && duration > 0 ? frameCount / duration : 1
  const outputFps = 10
  const budget = BUDGET_BYTES * 8 * 0.9
  const seconds = frameCount / outputFps
  const bitrate = clamp(Math.floor(budget / seconds), 100_000, MAX_VIDEO_BITRATE)
  return run(ffmpegBinary!, [
    "-y",
    "-i",
    input,
    "-vf",
    `fps=${inputFps.toFixed(6)},scale=${TIMELAPSE_WIDTH}:-2,setpts=N/${outputFps}/TB`,
    "-r",
    String(outputFps),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    String(bitrate),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-fs",
    String(BUDGET_BYTES),
    output,
  ])
}

const readAndRemove = (file: string): Buffer | undefined => {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file) : undefined
  } finally {
    try {
      fs.rmSync(file, { force: true })
    } catch {}
  }
}

/**
 * Bring an oversized video/audio file into parts the provider accepts.
 *
 * Returns an ordered list of parts; a media part that already fits is returned
 * unchanged as a single-element list. Audio is re-encoded and split as needed so
 * the whole recording reaches the model. Video becomes a re-encoded clip, a
 * timelapse, or a contact sheet so any duration is processable. When ffmpeg is
 * unavailable the original bytes are returned so the caller's oversize guard
 * still applies.
 */
export const normalizeMedia = Effect.fnUntraced(function* (
  input: string,
  mime: string,
  source: Buffer,
) {
  const unchanged = (): NormalizedMedia[] => [{ data: source, mime, action: "unchanged" }]
  if (!isVideoAttachment(mime) && !isAudioAttachment(mime)) return unchanged()
  if (source.byteLength <= MAX_INLINE_MEDIA_DECODED_BYTES) return unchanged()

  // Resolve ffmpeg (downloading a static build on first use if needed) only once
  // a file actually needs conversion, so nothing is fetched for normal traffic.
  if (!ffmpegBinary) ffmpegBinary = yield* ensureFfmpeg()
  const ffmpeg = ffmpegBinary
  if (!ffmpeg) return unchanged()
  resolveProbe(ffmpeg)

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "zyraxon-media-"))
  const unique = () => `${workDir}/${Date.now()}-${Math.random().toString(36).slice(2)}`
  const duration = yield* probeDuration(input)

  if (isAudioAttachment(mime)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const outcome = yield* transcodeAudioParts(input, workDir, duration, attempt).pipe(
        Effect.catch(() => Effect.succeed(undefined)),
      )
      if (!outcome) continue
      const parts = readAudioParts(workDir, outcome.prefix, outcome.pattern)
      if (parts.length === 0) continue
      // Guard against runaway splitting: cap the number of parts.
      const capped = parts.slice(0, MAX_AUDIO_PARTS)
      return capped.map(
        (data, index): NormalizedMedia => ({
          data,
          mime: "audio/mp3",
          action: "audio-clip",
          sourceSeconds: duration,
          chunkIndex: index + 1,
          chunkCount: capped.length,
        }),
      )
    }
    return unchanged()
  }

  // Video: keep a real moving segment when the whole clip fits the budget.
  if (duration !== undefined && duration <= MAX_CLIP_SECONDS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const output = `${unique()}.mp4`
      const result = yield* transcodeClip(input, output, duration, attempt).pipe(
        Effect.catch(() => Effect.succeed(undefined)),
      )
      const bytes = readAndRemove(output)
      if (result?.code === 0 && bytes && bytes.byteLength > 0 && bytes.byteLength <= MAX_INLINE_MEDIA_DECODED_BYTES) {
        const clip: NormalizedMedia[] = [
          { data: bytes, mime: "video/mp4", action: "video-clip", sourceSeconds: duration },
        ]
        return clip
      }
    }
  }

  // Very long (or unprobeable) video: a timelapse video that still spans the
  // whole timeline, so the model watches every part of the clip in order.
  {
    const output = `${unique()}.mp4`
    const result = yield* transcodeTimelapse(input, output, duration).pipe(
      Effect.catch(() => Effect.succeed(undefined)),
    )
    const bytes = readAndRemove(output)
    if (result?.code === 0 && bytes && bytes.byteLength > 0 && bytes.byteLength <= MAX_INLINE_MEDIA_DECODED_BYTES) {
      const timelapse: NormalizedMedia[] = [
        {
          data: bytes,
          mime: "video/mp4",
          action: "timelapse",
          sourceSeconds: duration,
          sampledFrames: TIMELAPSE_FRAMES,
        },
      ]
      return timelapse
    }
  }

  // Last resort for an unprobeable or failed video: one image spanning the clip.
  const frames = duration === undefined ? 12 : clamp(Math.round(duration / 30), 6, 36)
  const sheetPath = `${unique()}.jpg`
  const sheet = yield* transcodeContactSheet(input, sheetPath, duration, frames).pipe(
    Effect.catch(() => Effect.succeed(undefined)),
  )
  const bytes = readAndRemove(sheetPath)
  if (sheet?.code === 0 && bytes && bytes.byteLength > 0 && bytes.byteLength <= MAX_INLINE_MEDIA_DECODED_BYTES) {
    const sheetResult: NormalizedMedia[] = [
      { data: bytes, mime: "image/jpeg", action: "timelapse", sourceSeconds: duration, sampledFrames: frames },
    ]
    return sheetResult
  }

  return unchanged()
})
