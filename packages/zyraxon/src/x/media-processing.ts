import * as fs from "node:fs/promises"
import * as path from "node:path"
import { decodePngToRgb, encodePng } from "./desktop-control"
import { currentPlatform, describeMissing, haveCommand, run, runBinary, runCommand, tempPath } from "./process-utils"

const FFMPEG_INSTALL = {
  windows: "Install with: winget install Gyan.FFmpeg",
  macos: "Install with: brew install ffmpeg",
  linux: "Install with: sudo apt install ffmpeg",
}

const TESSERACT_INSTALL = {
  windows: "Install with: winget install UB-Mannheim.TesseractOCR",
  macos: "Install with: brew install tesseract",
  linux: "Install with: sudo apt install tesseract-ocr",
}

export type MediaResult = { ok: boolean; data?: unknown; error?: string }

// ── Image ──────────────────────────────────────────────────────────────────────

type Rgb = { data: Buffer; width: number; height: number }

async function requireFfmpeg(): Promise<void> {
  if (!(await haveCommand("ffmpeg"))) throw new Error(describeMissing("ffmpeg", FFMPEG_INSTALL))
}

async function probeSize(file: string): Promise<{ width: number; height: number }> {
  if (!(await haveCommand("ffprobe"))) await requireFfmpeg()
  const raw = await run(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", file],
    { timeout: 30000 },
  )
  const parsed = JSON.parse(raw) as { streams?: { width?: number; height?: number }[] }
  const stream = parsed.streams?.[0]
  if (!stream?.width || !stream?.height) throw new Error(`Could not read image dimensions from ${file}`)
  return { width: stream.width, height: stream.height }
}

// PNG goes through the in-repo decoder; anything else is normalised to raw RGB by
// ffmpeg, so jpg/webp/bmp/gif all work without adding an image dependency.
export async function readImageRgb(file: string): Promise<Rgb> {
  const bytes = await Bun.file(file).arrayBuffer()
  const buffer = Buffer.from(bytes)
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const decoded = decodePngToRgb(buffer)
    return { data: decoded.rgb, width: decoded.info.width, height: decoded.info.height }
  }
  await requireFfmpeg()
  const { width, height } = await probeSize(file)
  const result = await runBinary(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { timeout: 120000 },
  )
  if (result.ok === false) throw new Error(result.error)
  const expected = width * height * 3
  if (result.stdout.length < expected)
    throw new Error(`Decoded ${result.stdout.length} bytes but ${file} should be ${expected}`)
  return { data: result.stdout.subarray(0, expected), width, height }
}

function resizeNearest(src: Rgb, width: number, height: number): Rgb {
  const out = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / height))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / width))
      const from = (sy * src.width + sx) * 3
      const to = (y * width + x) * 3
      out[to] = src.data[from] ?? 0
      out[to + 1] = src.data[from + 1] ?? 0
      out[to + 2] = src.data[from + 2] ?? 0
    }
  }
  return { data: out, width, height }
}

function cropRgb(src: Rgb, x: number, y: number, width: number, height: number): Rgb {
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > src.width || y + height > src.height)
    throw new Error(
      `crop ${width}x${height}+${x}+${y} does not fit inside the ${src.width}x${src.height} image`,
    )
  const out = Buffer.alloc(width * height * 3)
  for (let row = 0; row < height; row++) {
    const start = ((y + row) * src.width + x) * 3
    src.data.copy(out, row * width * 3, start, start + width * 3)
  }
  return { data: out, width, height }
}

function rotateRgb(src: Rgb, degrees: number): Rgb {
  const normalised = ((degrees % 360) + 360) % 360
  if (normalised === 0) return src
  if (normalised !== 90 && normalised !== 180 && normalised !== 270)
    throw new Error("rotation must be 90, 180 or 270 degrees")
  if (normalised === 180) {
    const out = Buffer.alloc(src.data.length)
    for (let i = 0; i < src.data.length; i += 3) {
      const j = src.data.length - 3 - i
      out[i] = src.data[j] ?? 0
      out[i + 1] = src.data[j + 1] ?? 0
      out[i + 2] = src.data[j + 2] ?? 0
    }
    return { data: out, width: src.width, height: src.height }
  }
  const swap = normalised === 90
  const width = swap ? src.height : src.width
  const height = swap ? src.width : src.height
  const out = Buffer.alloc(width * height * 3)
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const tx = swap ? src.height - 1 - y : y
      const ty = swap ? x : src.width - 1 - x
      const to = (ty * width + tx) * 3
      const from = (y * src.width + x) * 3
      out[to] = src.data[from] ?? 0
      out[to + 1] = src.data[from + 1] ?? 0
      out[to + 2] = src.data[from + 2] ?? 0
    }
  }
  return { data: out, width, height }
}

function mapPixels(src: Rgb, fn: (r: number, g: number, b: number) => [number, number, number]): Rgb {
  const out = Buffer.alloc(src.data.length)
  for (let i = 0; i < src.data.length; i += 3) {
    const [r, g, b] = fn(src.data[i] ?? 0, src.data[i + 1] ?? 0, src.data[i + 2] ?? 0)
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
  }
  return { data: out, width: src.width, height: src.height }
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

function applyFilter(src: Rgb, filter: string): Rgb {
  const name = filter.toLowerCase()
  if (name === "grayscale" || name === "greyscale")
    return mapPixels(src, (r, g, b) => {
      const l = clamp(0.299 * r + 0.587 * g + 0.114 * b)
      return [l, l, l]
    })
  if (name === "invert") return mapPixels(src, (r, g, b) => [255 - r, 255 - g, 255 - b])
  if (name === "sepia")
    return mapPixels(src, (r, g, b) => [clamp(0.393 * r + 0.769 * g + 0.189 * b), clamp(0.349 * r + 0.686 * g + 0.168 * b), clamp(0.272 * r + 0.534 * g + 0.131 * b)])
  if (name === "blur") return boxBlur(src)
  throw new Error(`unknown filter: ${filter}. Use grayscale, invert, sepia or blur`)
}

function boxBlur(src: Rgb): Rgb {
  const blurred = Buffer.alloc(src.data.length)
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy
          const nx = x + dx
          if (ny < 0 || nx < 0 || ny >= src.height || nx >= src.width) continue
          const i = (ny * src.width + nx) * 3
          r += src.data[i] ?? 0
          g += src.data[i + 1] ?? 0
          b += src.data[i + 2] ?? 0
          n++
        }
      }
      const to = (y * src.width + x) * 3
      blurred[to] = Math.round(r / n)
      blurred[to + 1] = Math.round(g / n)
      blurred[to + 2] = Math.round(b / n)
    }
  }
  return { data: blurred, width: src.width, height: src.height }
}

function adjustBrightness(src: Rgb, amount: number): Rgb {
  return mapPixels(src, (r, g, b) => [clamp(r + amount), clamp(g + amount), clamp(b + amount)])
}

function adjustContrast(src: Rgb, amount: number): Rgb {
  const factor = (259 * (amount * 2.55 + 255)) / (255 * (259 - amount * 2.55))
  return mapPixels(src, (r, g, b) => [
    clamp(factor * (r - 128) + 128),
    clamp(factor * (g - 128) + 128),
    clamp(factor * (b - 128) + 128),
  ])
}

async function findFont(): Promise<string | null> {
  const candidates =
    currentPlatform() === "windows"
      ? ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/calibri.ttf"]
      : currentPlatform() === "macos"
        ? ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc"]
        : ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans.ttf"]
  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) return candidate
  }
  return null
}

export async function editImage(
  inputPath: string,
  operation: string,
  params: Record<string, unknown> = {},
): Promise<MediaResult> {
  try {
    if (!(await Bun.file(inputPath).exists())) throw new Error(`input file not found: ${inputPath}`)
    const op = operation.toLowerCase()
    let image = await readImageRgb(inputPath)
    const before = { width: image.width, height: image.height }

    if (op === "resize") {
      const width = Number(params.width)
      const height = Number(params.height)
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        throw new Error("resize needs positive numeric width and height")
      image = resizeNearest(image, Math.round(width), Math.round(height))
    } else if (op === "crop") {
      const { x = 0, y = 0, width, height } = params
      if (!Number.isFinite(Number(width)) || !Number.isFinite(Number(height)))
        throw new Error("crop needs numeric width and height")
      image = cropRgb(image, Number(x), Number(y), Math.round(Number(width)), Math.round(Number(height)))
    } else if (op === "rotate") {
      image = rotateRgb(image, Number(params.degrees ?? params.angle ?? 90))
    } else if (op === "brightness") {
      image = adjustBrightness(image, Number(params.amount ?? params.value ?? 20))
    } else if (op === "contrast") {
      image = adjustContrast(image, Number(params.amount ?? params.value ?? 20))
    } else if (op === "filter") {
      image = applyFilter(image, String(params.filter ?? params.name ?? ""))
    } else if (op === "text_overlay") {
      return await overlayText(inputPath, image, params, before)
    } else {
      throw new Error(
        `unknown operation: ${operation}. Use resize, crop, rotate, brightness, contrast, filter or text_overlay`,
      )
    }

    const outputPath = (params.outputPath as string) || defaultOutput(inputPath, op)
    await Bun.write(outputPath, encodePng(image.data, image.width, image.height))
    return {
      ok: true,
      data: {
        operation: op,
        input: inputPath,
        output: outputPath,
        before,
        after: { width: image.width, height: image.height },
        bytes: (await Bun.file(outputPath).arrayBuffer()).byteLength,
      },
    }
  } catch (error) {
    return { ok: false, error: `Image edit failed: ${(error as Error).message}` }
  }
}

// Text rendering is delegated to ffmpeg drawtext because there is no built-in font rasteriser.
async function overlayText(
  inputPath: string,
  image: Rgb,
  params: Record<string, unknown>,
  before: { width: number; height: number },
): Promise<MediaResult> {
  await requireFfmpeg()
  const font = (params.font as string) || (await findFont())
  if (!font) throw new Error("no usable font file was found for text_overlay")
  const outputPath = (params.outputPath as string) || defaultOutput(inputPath, "text_overlay")
  const text = String(params.text ?? "")
  if (!text) throw new Error("text_overlay needs a text value")
  const size = Number(params.size ?? Math.max(16, Math.round(image.height / 12)))
  const x = String(params.x ?? 20)
  const y = String(params.y ?? 40)
  const colour = String(params.color ?? "white")
  const staged = tempPath("zyraxon_overlay", ".png")
  await Bun.write(staged, encodePng(image.data, image.width, image.height))
  const escapedFont = font.replace(/\\/g, "/").replace(/:/g, "\\:")
  const escapedText = text.replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:")
  await run(
    "ffmpeg",
    [
      "-v", "error", "-y", "-i", staged,
      "-vf", `drawtext=fontfile='${escapedFont}':text='${escapedText}':fontsize=${size}:fontcolor=${colour}:x=${x}:y=${y}`,
      outputPath,
    ],
    { timeout: 60000 },
  )
  await fs.unlink(staged).catch(() => {})
  return {
    ok: true,
    data: {
      operation: "text_overlay",
      input: inputPath,
      output: outputPath,
      before,
      after: { width: image.width, height: image.height },
      text,
      fontSize: size,
    },
  }
}

function defaultOutput(inputPath: string, tag: string): string {
  const dir = path.dirname(inputPath)
  const ext = path.extname(inputPath) || ".png"
  return path.join(dir, `${path.basename(inputPath, ext)}_${tag}${ext}`)
}

// ── Video and audio ────────────────────────────────────────────────────────────

export async function processVideo(
  inputPath: string,
  operation: string,
  params: Record<string, unknown> = {},
): Promise<MediaResult> {
  try {
    if (!(await Bun.file(inputPath).exists())) throw new Error(`input file not found: ${inputPath}`)
    await requireFfmpeg()
    const op = operation.toLowerCase()
    const outputPath = (params.outputPath as string) || defaultOutput(inputPath, op)

    if (op === "extract_frames") {
      const fps = Number(params.fps ?? 1)
      if (!Number.isFinite(fps) || fps <= 0) throw new Error("fps must be a positive number")
      const outDir = (params.outputDir as string) || defaultOutput(inputPath, "frames").replace(/\.[^.]+$/, "")
      await fs.mkdir(outDir, { recursive: true })
      await run("ffmpeg", ["-v", "error", "-y", "-i", inputPath, "-vf", `fps=${fps}`, path.join(outDir, "frame_%04d.png")], { timeout: 600000 })
      const files = (await fs.readdir(outDir)).filter((f) => f.endsWith(".png")).sort()
      return { ok: true, data: { operation: op, input: inputPath, outputDir: outDir, frameCount: files.length, fps, frames: files.map((f) => path.join(outDir, f)) } }
    }

    if (op === "trim") {
      const start = String(params.start ?? "0")
      const duration = params.duration !== undefined ? String(params.duration) : null
      const args = ["-v", "error", "-y", "-ss", start, "-i", inputPath]
      if (duration) args.push("-t", duration)
      args.push("-c", "copy", outputPath)
      await run("ffmpeg", args, { timeout: 600000 })
      return { ok: true, data: { operation: op, input: inputPath, output: outputPath, start, duration } }
    }

    if (op === "compress") {
      const crf = Number(params.crf ?? 28)
      if (!Number.isFinite(crf) || crf < 0 || crf > 51) throw new Error("crf must be between 0 and 51")
      const preset = String(params.preset ?? "medium")
      await run("ffmpeg", ["-v", "error", "-y", "-i", inputPath, "-c:v", "libx264", "-crf", String(crf), "-preset", preset, "-c:a", "aac", outputPath], { timeout: 1800000 })
      return { ok: true, data: { operation: op, input: inputPath, output: outputPath, crf, preset, originalBytes: (await Bun.file(inputPath).arrayBuffer()).byteLength, outputBytes: (await Bun.file(outputPath).arrayBuffer()).byteLength } }
    }

    if (op === "convert") {
      const videoCodec = String(params.videoCodec ?? "libx264")
      const audioCodec = String(params.audioCodec ?? "aac")
      await run("ffmpeg", ["-v", "error", "-y", "-i", inputPath, "-c:v", videoCodec, "-c:a", audioCodec, outputPath], { timeout: 1800000 })
      return { ok: true, data: { operation: op, input: inputPath, output: outputPath, videoCodec, audioCodec } }
    }

    if (op === "extract_audio") {
      const format = String(params.format ?? "mp3")
      const bitrate = String(params.bitrate ?? "192k")
      await run("ffmpeg", ["-v", "error", "-y", "-i", inputPath, "-vn", "-acodec", format === "wav" ? "pcm_s16le" : "libmp3lame", "-b:a", bitrate, outputPath.replace(/\.[^.]+$/, `.${format}`) as string], { timeout: 600000 })
      const audioOut = outputPath.replace(/\.[^.]+$/, `.${format}`)
      return { ok: true, data: { operation: op, input: inputPath, output: audioOut, format, bitrate } }
    }

    if (op === "subtitle") {
      const subtitleFile = String(params.subtitlePath ?? params.file ?? "")
      if (!subtitleFile) throw new Error("subtitle needs subtitlePath pointing at a .srt or .ass file")
      if (!(await Bun.file(subtitleFile).exists())) throw new Error(`subtitle file not found: ${subtitleFile}`)
      const escaped = subtitleFile.replace(/\\/g, "/").replace(/:/g, "\\:")
      if (params.mode === "extract") {
        const srt = outputPath.replace(/\.[^.]+$/, ".srt")
        await run("ffmpeg", ["-v", "error", "-y", "-i", inputPath, "-map", "0:s:0", srt], { timeout: 300000 })
        return { ok: true, data: { operation: op, input: inputPath, output: srt, mode: "extract" } }
      }
      await run("ffmpeg", ["-v", "error", "-y", "-i", inputPath, "-vf", `subtitles='${escaped}'`, "-c:a", "copy", outputPath], { timeout: 600000 })
      return { ok: true, data: { operation: op, input: inputPath, output: outputPath, mode: "burn_in", subtitleFile } }
    }

    throw new Error(`unknown operation: ${operation}. Use extract_frames, trim, compress, convert, extract_audio or subtitle`)
  } catch (error) {
    return { ok: false, error: `Video processing failed: ${(error as Error).message}` }
  }
}

export async function probeMedia(filePath: string): Promise<Record<string, unknown>> {
  if (!(await haveCommand("ffprobe"))) await requireFfmpeg()
  const raw = await run(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", filePath],
    { timeout: 60000 },
  )
  return JSON.parse(raw) as Record<string, unknown>
}

// ── OCR ────────────────────────────────────────────────────────────────────────

// tesseract is frequently installed without being on PATH, so the usual install
// locations are probed before declaring the feature unavailable.
async function findTesseract(): Promise<string | null> {
  if (await haveCommand("tesseract")) return "tesseract"
  const candidates =
    currentPlatform() === "windows"
      ? ["C:/Program Files/Tesseract-OCR/tesseract.exe", "C:/Program Files (x86)/Tesseract-OCR/tesseract.exe", `${process.env.LOCALAPPDATA ?? ""}/Programs/Tesseract-OCR/tesseract.exe`]
      : currentPlatform() === "macos"
        ? ["/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract"]
        : ["/usr/bin/tesseract", "/usr/local/bin/tesseract"]
  for (const candidate of candidates) {
    if (candidate && (await Bun.file(candidate).exists())) return candidate
  }
  return null
}

export async function runOcr(imagePath: string, language = "eng"): Promise<MediaResult> {
  try {
    if (!(await Bun.file(imagePath).exists())) throw new Error(`image not found: ${imagePath}`)
    const binary = await findTesseract()
    if (!binary) return { ok: false, error: `OCR needs tesseract, which is not installed. ${TESSERACT_INSTALL[currentPlatform()]}` }
    const code = language.split("+")[0] ?? "eng"
    const outBase = tempPath("zyraxon_ocr", "")
    const result = await execText(binary, [imagePath, outBase, "-l", code, "--psm", "3"], 180000)
    if (result.ok === false) {
      // A missing language pack is the most common failure and deserves its own message.
      if (result.error.includes("Failed loading language")) {
        const available = await execText(binary, ["--list-langs"], 30000)
        const installed =
          available.ok === true
            ? available.stdout
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => /^[a-z]{3}(_[a-z]+)*$/.test(l))
                .join(", ")
            : "unknown"
        return {
          ok: false,
          error: `tesseract has no '${code}' language data. Installed: ${installed || "none"}`,
        }
      }
      return { ok: false, error: result.error }
    }
    const produced = `${outBase}.txt`
    if (!(await Bun.file(produced).exists())) return { ok: false, error: "tesseract produced no text output" }
    const text = await Bun.file(produced).text()
    await fs.unlink(produced).catch(() => {})
    const meta = await tesseractMetadata(binary, imagePath)
    return {
      ok: true,
      data: {
        engine: "tesseract",
        binary,
        image: imagePath,
        language: code,
        text,
        characters: text.length,
        words: text.split(/\s+/).filter(Boolean).length,
        lines: text.split(/\s*\r?\n/).filter((l) => l.trim().length > 0).length,
        meanConfidence: meta,
      },
    }
  } catch (error) {
    return { ok: false, error: `OCR failed: ${(error as Error).message}` }
  }
}

async function tesseractMetadata(binary: string, imagePath: string): Promise<number | null> {
  const result = await execText(binary, [imagePath, "stdout", "-l", "eng", "tsv"], 120000)
  if (result.ok === false) return null
  const confidences = result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t")[10])
    .filter((v) => v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0)
    .map(Number)
  if (confidences.length === 0) return null
  return Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
}

function execText(
  command: string,
  args: string[],
  timeout: number,
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  return runCommand(command, args, { timeout }).then((result) =>
    result.ok === true ? { ok: true, stdout: result.stdout } : { ok: false, error: result.error },
  )
}

// ── Structured data ────────────────────────────────────────────────────────────

// Reads text out of a PDF without any external binary: content streams are
// inflated and the text-showing operators are decoded. Scanned pages still need OCR.
export function extractPdfText(bytes: Buffer): { text: string; pages: number; needsOcr: boolean } {
  const zlib = require("node:zlib") as typeof import("node:zlib")
  const pages: string[] = []
  let cursor = 0
  let streams = 0

  while (cursor < bytes.length) {
    const at = bytes.indexOf(Buffer.from("stream"), cursor)
    if (at === -1) break
    let start = at + 6
    if (bytes[start] === 0x0d) start++
    if (bytes[start] === 0x0a) start++
    const end = bytes.indexOf(Buffer.from("endstream"), start)
    if (end === -1) break
    const raw = bytes.subarray(start, end)
    cursor = end + 9

    let content: Buffer | null = null
    for (const inflate of [zlib.inflateSync, zlib.inflateRawSync]) {
      try {
        content = inflate(raw)
        break
      } catch {
        continue
      }
    }
    if (!content) continue

    const source = content.toString("latin1")
    if (!/(Tj|TJ|'|")/.test(source)) continue
    const page = decodeContentStream(source)
    if (page.trim().length > 0) {
      streams++
      pages.push(page)
    }
  }

  return { text: pages.join("\n\n"), pages: streams, needsOcr: streams === 0 }
}

// Decodes the text-showing operators of a decoded content stream. Only the shown
// strings are emitted, so operator keywords never leak into the extracted text.
function decodeContentStream(source: string): string {
  let out = ""
  let i = 0
  while (i < source.length) {
    const ch = source[i] as string

    if (ch === "(") {
      const { value, next } = readLiteralString(source, i)
      out += value
      i = next
      continue
    }

    if (ch === "<" && source[i + 1] !== "<") {
      const close = source.indexOf(">", i)
      if (close === -1) break
      out += decodeHexString(source.slice(i + 1, close))
      i = close + 1
      continue
    }

    // A large negative kerning adjustment inside TJ means a real word gap.
    if (ch === "[" || ch === "]") {
      i++
      continue
    }

    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const match = source.slice(i).match(/^-?\d+(\.\d+)?/)
      if (match) {
        if (Number(match[0]) <= -120) out += " "
        i += match[0].length
        continue
      }
    }

    if (ch === "T" && (source[i + 1] === "d" || source[i + 1] === "D" || source[i + 1] === "*")) {
      out += "\n"
      i += 2
      continue
    }

    if (ch === "'" || ch === '"') {
      out += "\n"
      i++
      continue
    }

    i++
  }
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function readLiteralString(source: string, start: number): { value: string; next: number } {
  let depth = 1
  let i = start + 1
  let raw = ""
  while (i < source.length) {
    const ch = source[i] as string
    if (ch === "\\") {
      const escaped = source[i + 1]
      if (escaped === "n") raw += "\n"
      else if (escaped === "r") raw += "\r"
      else if (escaped === "t") raw += "\t"
      else if (escaped === "b" || escaped === "f") raw += " "
      else if (escaped !== undefined && escaped >= "0" && escaped <= "7") {
        const octal = source.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] ?? "0"
        raw += String.fromCharCode(parseInt(octal, 8))
        i += octal.length
        i++
        continue
      } else raw += escaped ?? ""
      i += 2
      continue
    }
    if (ch === "(") depth++
    if (ch === ")") {
      depth--
      if (depth === 0) return { value: raw, next: i + 1 }
    }
    raw += ch
    i++
  }
  return { value: raw, next: i }
}

function decodeHexString(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "")
  const padded = clean.length % 2 === 0 ? clean : clean + "0"
  let out = ""
  for (let i = 0; i < padded.length; i += 2) out += String.fromCharCode(parseInt(padded.slice(i, i + 2), 16))
  return out
}

export async function extractData(filePath: string, format = "auto", pages?: string): Promise<MediaResult> {
  try {
    if (!(await Bun.file(filePath).exists())) throw new Error(`file not found: ${filePath}`)
    const ext = path.extname(filePath).toLowerCase()
    const bytes = Buffer.from(await Bun.file(filePath).arrayBuffer())

    if (ext === ".json" || format === "json") {
      const parsed = JSON.parse(bytes.toString("utf8"))
      return { ok: true, data: { file: filePath, format: "json", value: parsed } }
    }

    if (ext === ".csv" || ext === ".tsv" || format === "csv") {
      const delimiter = ext === ".tsv" ? "\t" : ","
      const text = bytes.toString("utf8")
      const rows = parseDelimited(text, delimiter)
      return { ok: true, data: { file: filePath, format: ext.slice(1), rowCount: rows.length, headers: rows[0] ?? [], rows } }
    }

    if (ext === ".pdf") {
      const native = extractPdfText(bytes)
      if (native.text.trim().length > 0)
        return { ok: true, data: { file: filePath, format: "pdf", engine: "builtin", pages: native.pages, text: native.text, pagesFilter: pages ?? null } }
      const fallback = await execText("pdftotext", ["-layout", filePath, "-"], 120000)
      if (fallback.ok === true)
        return { ok: true, data: { file: filePath, format: "pdf", engine: "pdftotext", text: fallback.stdout, pagesFilter: pages ?? null } }
      return {
        ok: false,
        error: `This PDF has no embedded text layer, so it needs OCR. Convert a page to an image first and run x_media_ocr, or install poppler (pdftotext) for other documents.`,
      }
    }

    if ([".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tif", ".tiff"].includes(ext))
      return await runOcr(filePath)

    if ([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".mp4", ".mov", ".mkv", ".webm"].includes(ext)) {
      if (!(await haveCommand("ffprobe"))) await requireFfmpeg()
      const probe = (await probeMedia(filePath)) as { streams?: { codec_type: string; codec_name: string; duration?: string }[]; format?: { duration?: string; size?: string } }
      return {
        ok: true,
        data: {
          file: filePath,
          format: ext.slice(1),
          transcript: null,
          note: "Metadata extracted. Speech-to-text additionally needs a local whisper model; use x_media_audio_transcribe once one is present.",
          streams: probe.streams?.map((s) => ({ type: s.codec_type, codec: s.codec_name, duration: s.duration })),
          duration: probe.format?.duration,
          size: probe.format?.size,
        },
      }
    }

    return { ok: true, data: { file: filePath, format: ext.slice(1) || "text", text: bytes.toString("utf8") } }
  } catch (error) {
    return { ok: false, error: `Data extraction failed: ${(error as Error).message}` }
  }
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') {
      quoted = true
      continue
    }
    if (ch === delimiter) {
      row.push(cell)
      cell = ""
      continue
    }
    if (ch === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      continue
    }
    if (ch !== "\r") cell += ch
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
