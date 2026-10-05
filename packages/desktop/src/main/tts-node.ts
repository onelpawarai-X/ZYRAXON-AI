// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createServer, IncomingMessage, ServerResponse } from "http"
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts"
import { join } from "path"
import { existsSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { createHash } from "crypto"
import { PassThrough, Readable } from "stream"
import { pipeline } from "stream/promises"

const TTS_PORT = 19810
let ttsServer: ReturnType<typeof createServer> | null = null

// Official Edge (Microsoft) Neural voices — one male + one female per language
// NO custom profiles, NO prosody, NO emphasis — just the raw Edge voices
const VOICES: Record<string, { f: string; m: string }> = {
  bn: { f: "bn-IN-TanishaaNeural", m: "bn-IN-BashkarNeural" },
  hi: { f: "hi-IN-SwaraNeural", m: "hi-IN-MadhurNeural" },
  en: { f: "en-US-JennyNeural", m: "en-US-GuyNeural" },
  ar: { f: "ar-AE-FatimaNeural", m: "ar-AE-HamdanNeural" },
  es: { f: "es-ES-ElviraNeural", m: "es-ES-AlvaroNeural" },
  fr: { f: "fr-FR-EloiseNeural", m: "fr-FR-HenriNeural" },
  de: { f: "de-DE-KatjaNeural", m: "de-DE-ConradNeural" },
  pt: { f: "pt-BR-FranciscaNeural", m: "pt-BR-AntonioNeural" },
  ru: { f: "ru-RU-SvetlanaNeural", m: "ru-RU-DmitryNeural" },
  ja: { f: "ja-JP-NanamiNeural", m: "ja-JP-KeitaNeural" },
  ko: { f: "ko-KR-SunHiNeural", m: "ko-KR-InJoonNeural" },
  zh: { f: "zh-CN-XiaoxiaoNeural", m: "zh-CN-YunxiNeural" },
  vi: { f: "vi-VN-HoaiMyNeural", m: "vi-VN-NamMinhNeural" },
  it: { f: "it-IT-IsabellaNeural", m: "it-IT-DiegoNeural" },
  th: { f: "th-TH-PremwadeeNeural", m: "th-TH-NiwatNeural" },
  tr: { f: "tr-TR-EmelNeural", m: "tr-TR-AhmetNeural" },
  pl: { f: "pl-PL-ZofiaNeural", m: "pl-PL-MarekNeural" },
  nl: { f: "nl-NL-ColetteNeural", m: "nl-NL-MaartenNeural" },
  uk: { f: "uk-UA-PolinaNeural", m: "uk-UA-OstapNeural" },
  sv: { f: "sv-SE-SofieNeural", m: "sv-SE-MattiasNeural" },
  da: { f: "da-DK-ChristelNeural", m: "da-DK-JeppeNeural" },
  fi: { f: "fi-FI-NooraNeural", m: "fi-FI-HarriNeural" },
  nb: { f: "nb-NO-PernilleNeural", m: "nb-NO-FinnNeural" },
  cs: { f: "cs-CZ-VlastaNeural", m: "cs-CZ-AntoninNeural" },
  ro: { f: "ro-RO-AlinaNeural", m: "ro-RO-EmilNeural" },
  el: { f: "el-GR-AthinaNeural", m: "el-GR-NestorasNeural" },
  he: { f: "he-IL-HilaNeural", m: "he-IL-AvriNeural" },
  hu: { f: "hu-HU-NoemiNeural", m: "hu-HU-TamasNeural" },
  id: { f: "id-ID-GadisNeural", m: "id-ID-ArdiNeural" },
  ms: { f: "ms-MY-YasminNeural", m: "ms-MY-OsmanNeural" },
  ta: { f: "ta-IN-PallaviNeural", m: "ta-IN-ValluvarNeural" },
  te: { f: "te-IN-ShrutiNeural", m: "te-IN-MohanNeural" },
  mr: { f: "mr-IN-AarohiNeural", m: "mr-IN-ManoharNeural" },
  gu: { f: "gu-IN-DhwaniNeural", m: "gu-IN-NiranjanNeural" },
  kn: { f: "kn-IN-SapnaNeural", m: "kn-IN-GaganNeural" },
  ml: { f: "ml-IN-SobhanaNeural", m: "ml-IN-MidhunNeural" },
  ur: { f: "ur-PK-UzmaNeural", m: "ur-PK-AsadNeural" },
  fa: { f: "fa-IR-DilaraNeural", m: "fa-IR-FaridNeural" },
  af: { f: "af-ZA-AdriNeural", m: "af-ZA-WillemNeural" },
  sw: { f: "sw-KE-ZuriNeural", m: "sw-KE-RafikiNeural" },
}

// Language auto-detect from text — maps script ranges to language codes
function detectLanguage(text: string): string {
  const sample = text.slice(0, 200)
  if (/[\u0980-\u09FF]/.test(sample)) return "bn"
  if (/[\u0900-\u097F]/.test(sample)) return "hi"
  if (/[\u0600-\u06FF]/.test(sample)) return "ar"
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return "ja"
  if (/[\uAC00-\uD7AF]/.test(sample)) return "ko"
  if (/[\u4E00-\u9FFF]/.test(sample)) return "zh"
  if (/[\u0E00-\u0E7F]/.test(sample)) return "th"
  if (/[àáâãäåèéêëìíîïòóôõöùúûüýÿ]/.test(sample.toLowerCase())) return "vi"
  if (/[\u0400-\u04FF]/.test(sample)) return "ru"
  if (/[\u0370-\u03FF]/.test(sample)) return "el"
  if (/[\u0590-\u05FF]/.test(sample)) return "he"
  if (/[\u0B80-\u0BFF]/.test(sample)) return "ta"
  if (/[\u0C00-\u0C7F]/.test(sample)) return "te"
  if (/[\u0A80-\u0AFF]/.test(sample)) return "gu"
  if (/[\u0C80-\u0CFF]/.test(sample)) return "kn"
  if (/[\u0D00-\u0D7F]/.test(sample)) return "ml"
  return "en"
}

let CACHE_DIR = ""
function ensureCacheDir() {
  if (!CACHE_DIR) {
    CACHE_DIR = join(tmpdir(), "zyraxon_tts_cache")
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
  }
}

const audioCache = new Map<string, Buffer>()
const MAX_CACHE = 200

function cacheKey(text: string, voice: string): string {
  return createHash("md5").update(text + voice).digest("hex")
}

// The single utterance-sized buffer that used to live here is gone on purpose.
// msedge-tts pushes MP3 frames into its Readable the moment they arrive off the
// WebSocket (MsEdgeTTS.js `_pushAudioData`), so the audio exists incrementally.
// Collecting that Readable into one Buffer before answering was the only reason
// playback could not begin until the ENTIRE utterance had been synthesised —
// the bytes are now piped straight to the client instead.

// Global lock — only ONE TTS generation at a time across all voices.
// Prevents overlapping EdgeTTS streams that cause double-speak. It is released
// when the response has finished STREAMING, not when the stream is created, so
// the next utterance can never interleave frames with this one on the socket.
let globalTtsLock: Promise<void> = Promise.resolve()

// Hands back the release function for the global lock once every earlier holder
// has let go. Callers must invoke it exactly once the response is finished,
// otherwise every later request blocks forever.
function acquireTTSLock(): Promise<() => void> {
  const previous = globalTtsLock
  let release!: () => void
  globalTtsLock = new Promise<void>((resolve) => {
    release = resolve
  })
  return previous.then(() => {
    let released = false
    return () => {
      if (released) return
      released = true
      release()
    }
  })
}

// One live MsEdgeTTS client per voice, kept for the life of the server.
//
// setMetadata() only skips its WebSocket handshake when the client it is called on
// is ALREADY configured for that same voice with that same output format and its
// socket is still open. Building a fresh client per request therefore made every
// single utterance pay a full TLS + WSS round trip to speech.platform.bing.com
// before it could even ask for audio — which is a large, constant, avoidable tax
// on the delay before the first sample is played.
//
// The clients are safe to share because the global lock above is held for the whole
// streaming response, so only one synthesis is ever in flight per process.
const ttsClients = new Map<string, MsEdgeTTS>()

// The empty metadata options argument is not optional in practice. setMetadata
// dereferences `metadataOptions.voiceLocale` once voiceLocale is already set, so
// omitting the argument makes the SECOND call on a cached client throw. That threw
// the client away and forced a fresh TLS + WSS handshake — plus, for `gender=f`,
// silently answered the first request with the fallback voice. Passing `{}` is
// behaviourally identical to omitting it and never throws.
async function ttsForVoice(voice: string) {
  const existing = ttsClients.get(voice)
  if (existing) {
    // Returns almost immediately when the socket is healthy, and transparently
    // reconnects when the server dropped it since the last use.
    await existing.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {})
    return existing
  }
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {})
  ttsClients.set(voice, tts)
  return tts
}

// Opens the socket for the default voice ahead of the first request so the very
// first utterance does not pay the handshake. Fire-and-forget on purpose: a failed
// or slow warm-up must never delay or block server startup, and ttsForVoice()
// rebuilds the client on demand anyway.
function prewarmVoice(voice: string) {
  void ttsForVoice(voice)
    .then(() => console.log(`[TTS] Pre-warmed voice ${voice}`))
    .catch((e) => console.log(`[TTS] Pre-warm skipped for ${voice}: ${e?.message?.slice(0, 60)}`))
}

// Cache the frames on their way past so a repeat of the same text is served
// from memory while still being emitted the instant they arrive. The
// accumulator is dropped rather than flushed if an utterance is implausibly
// large, so a runaway stream can never grow memory without bound.
const CACHE_MAX_BYTES = 8 * 1024 * 1024

// Interposes a PassThrough between the synthesis stream and the HTTP response so
// the cache can observe every frame without the response having to buffer them
// first. pipe() honours backpressure, so a long message cannot pile up in memory
// while nobody is draining the response.
function teeForCache(stream: Readable, key: string): PassThrough {
  const parts: Buffer[] = []
  let size = 0
  let cacheable = true
  stream.on("data", (chunk: Buffer) => {
    if (!cacheable) return
    size += chunk.length
    if (size > CACHE_MAX_BYTES) {
      cacheable = false
      parts.length = 0
      return
    }
    parts.push(chunk)
  })
  stream.on("end", () => {
    if (!cacheable || size < 100) return
    if (audioCache.size >= MAX_CACHE) {
      const firstKey = audioCache.keys().next().value
      if (firstKey) audioCache.delete(firstKey)
    }
    audioCache.set(key, Buffer.concat(parts))
  })
  const through = new PassThrough()
  // pipe() does not forward source errors, and a synthesis stream that dies
  // mid-utterance would otherwise leave the response hanging forever.
  stream.on("error", (err) => through.destroy(err))
  stream.on("close", () => through.destroy())
  stream.pipe(through)
  return through
}

// Resolve once the stream has produced its first frame, or resolve false if it
// ended or failed without one. 'readable' rather than 'data' on purpose: it does
// not consume, so the first frame stays in the internal buffer for the pipeline
// and the first syllable of the reply is never clipped off.
function waitForFirstChunk(stream: Readable): Promise<boolean> {
  return new Promise((resolve) => {
    const settle = (ok: boolean) => {
      stream.off("readable", onReadable)
      stream.off("end", onEnd)
      stream.off("error", onError)
      resolve(ok)
    }
    const onReadable = () => settle(true)
    const onEnd = () => settle(false)
    const onError = () => settle(false)
    if (stream.readableEnded || stream.readableLength > 0) {
      resolve(stream.readableLength > 0 && !stream.readableEnded)
      return
    }
    stream.on("readable", onReadable)
    stream.once("end", onEnd)
    stream.once("error", onError)
  })
}

// Opens a live Readable of MP3 frames for plain text — no SSML, no custom
// profiles, just the raw Edge voice. Returns null when every candidate failed.
async function openTTSStream(
  text: string,
  voiceCandidates: string[],
  key: string
): Promise<{ stream: PassThrough; source: Readable; voice: string } | null> {
  for (const v of voiceCandidates) {
    let source: Readable | null = null
    let stream: PassThrough | null = null
    try {
      const tts = await ttsForVoice(v)
      const cleanText = text.replace(/[\n\r\t]+/g, " ").replace(/\s+/g, " ").trim()
      source = tts.toStream(cleanText).audioStream
      stream = teeForCache(source, key)
      // A dead socket surfaces as an error on the stream (MsEdgeTTS.js destroys
      // it when the socket closes before turn.end). Waiting for the first frame
      // here is what lets a stale connection still fall through to the next
      // candidate — and it costs nothing, because there is no audio to send until
      // the first frame exists anyway.
      if (await waitForFirstChunk(stream)) return { stream, source, voice: v }
      console.log(`[TTS] Voice ${v} produced no audio, trying next...`)
    } catch (e: any) {
      // A failed synthesis usually means this voice's socket is dead. Drop it so
      // the next request builds a fresh client instead of reusing the broken one.
      console.log(`[TTS] Voice ${v} failed: ${e?.message?.slice(0, 60)}, trying next...`)
    }
    // Only reached when this candidate is being abandoned. The caller owns both
    // handles on success, so the synthesis is torn down here rather than left
    // running for an utterance nobody will ever hear.
    ttsClients.delete(v)
    stream?.destroy()
    source?.destroy()
  }
  return null
}

function handleSpeak(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://127.0.0.1:${TTS_PORT}`)
  const text = url.searchParams.get("text") || ""
  const langParam = url.searchParams.get("lang") || ""
  const gender = url.searchParams.get("gender") || "f"

  if (!text) {
    res.writeHead(400)
    res.end()
    return
  }

  let lang = langParam
  if (!lang || !VOICES[lang]) {
    lang = detectLanguage(text)
  }

  const voice = VOICES[lang]?.[gender as "f" | "m"] || VOICES.en[gender as "f" | "m"] || VOICES.en.f
  const fallbackVoice = lang === "en" ? "en-US-GuyNeural" : VOICES.en.f
  const voiceCandidates = [voice]
  if (fallbackVoice !== voice) voiceCandidates.push(fallbackVoice)

  console.log(`[TTS] lang=${lang} gender=${gender} voice=${voice} len=${text.length}`)

  ensureCacheDir()
  const key = cacheKey(text, voice)
  const cached = audioCache.get(key)

  void (async () => {
    const release = await acquireTTSLock()
    // Cancelling the request must tear the synthesis stream down too, otherwise a
    // stopped utterance keeps being synthesised — and, worse, could later be served
    // from the cache as if it had actually been spoken.
    let live: { stream: PassThrough; source: Readable; voice: string } | null = null
    const onClientGone = () => {
      live?.stream.destroy()
      live?.source.destroy()
      if (live) ttsClients.delete(live.voice)
      live = null
    }
    req.once("aborted", onClientGone)
    res.once("close", onClientGone)

    try {
      // No Content-Length anywhere: the body is chunked transfer encoding, so the
      // first frame is flushed to the client the moment it exists and playback can
      // start while Edge is still synthesising the rest of the sentence.
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      })

      if (cached) {
        console.log(`[TTS] Cached ${cached.length} bytes`)
        res.end(cached)
        return
      }

      live = await openTTSStream(text, voiceCandidates, key)
      if (!live) {
        console.error("[TTS] All voice candidates failed for lang:", lang)
        res.end()
        return
      }

      const { stream, source, voice } = live
      // A synthesis that dies after the first byte is already on the wire cannot be
      // retried without speaking the same words twice, so the response is simply
      // ended and the partial audio is kept. This is the only behaviour that does
      // not risk a duplicated phrase, and the socket must be dropped either way
      // because that is what a mid-turn failure always means.
      await new Promise<void>((resolve) => {
        stream.once("error", (err: Error) => {
          ttsClients.delete(voice)
          console.error("[TTS] Stream error:", err.message?.slice(0, 80))
          if (!res.writableEnded) res.end()
          resolve()
        })
        void pipeline(stream, res).catch(() => {}).then(resolve)
      })
      source.destroy()
    } catch (err) {
      console.error("[TTS] Speak error:", err)
      if (!res.headersSent) res.writeHead(500, { "Access-Control-Allow-Origin": "*" })
      if (!res.writableEnded) res.end(JSON.stringify({ error: String(err) }))
    } finally {
      live = null
      req.off("aborted", onClientGone)
      res.off("close", onClientGone)
      release()
    }
  })()
}

function handleHealth(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  })
  res.end(
    JSON.stringify({
      ok: true,
      langs: Object.keys(VOICES),
      cache_size: audioCache.size,
      engine: "msedge-tts (Official Edge Neural Voices)",
    })
  )
}

export function startNodeTTS(): Promise<void> {
  return new Promise((resolve) => {
    if (ttsServer) {
      resolve()
      return
    }

    ttsServer = createServer((req, res) => {
      if (req.method === "OPTIONS") {
        res.writeHead(200, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        })
        res.end()
        return
      }

      const url = new URL(req.url || "/", `http://127.0.0.1:${TTS_PORT}`)
      if (url.pathname === "/speak") {
        handleSpeak(req, res)
      } else if (url.pathname === "/health") {
        handleHealth(req, res)
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    ttsServer.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.log(`[TTS] Port ${TTS_PORT} in use, retrying...`)
        setTimeout(() => {
          ttsServer = null
          startNodeTTS().then(resolve)
        }, 1000)
      } else {
        console.error("[TTS] Server error:", err)
        resolve()
      }
    })

    ttsServer.listen(TTS_PORT, "127.0.0.1", () => {
      console.log(`[TTS] Official Edge Neural TTS on http://127.0.0.1:${TTS_PORT}`)
      console.log(`[TTS] Auto language detect: enabled`)
      // Background only — never awaited, so startup is not gated on the cloud.
      prewarmVoice(VOICES.en.f)
      resolve()
    })
  })
}

export function stopNodeTTS() {
  if (ttsServer) {
    ttsServer.close()
    ttsServer = null
  }
  for (const tts of ttsClients.values()) {
    try { tts.close() } catch {}
  }
  ttsClients.clear()
}
