import { createServer, IncomingMessage, ServerResponse } from "http"
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts"
import { join } from "path"
import { existsSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { createHash } from "crypto"
import { Readable } from "stream"

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

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on("data", (chunk: Buffer) => chunks.push(chunk))
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", reject)
  })
}

// Per-voice queue — serialize to avoid contention
const voiceQueues = new Map<string, Promise<Buffer>>()

// Global lock — only ONE TTS generation at a time across all voices.
// Prevents overlapping EdgeTTS streams that cause double-speak.
let globalTtsLock: Promise<Buffer> = Promise.resolve(Buffer.alloc(0))

// Generate TTS using official Edge voice — plain text, no SSML, no custom profiles
async function tryGenerateVoice(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
  const cleanText = text.replace(/[\n\r\t]+/g, " ").replace(/\s+/g, " ").trim()
  const result = tts.toStream(cleanText)
  const audioData = await streamToBuffer(result.audioStream)
  if (audioData.length < 100) throw new Error("Audio too small")
  return audioData
}

async function generateTTS(text: string, voice: string, lang: string): Promise<Buffer> {
  ensureCacheDir()
  const key = cacheKey(text, voice)
  if (audioCache.has(key)) return audioCache.get(key)!

  const voices = VOICES[lang] || VOICES.en
  const fallbackVoice = lang === "en" ? "en-US-GuyNeural" : VOICES.en.f

  const voiceCandidates = [voice]
  if (fallbackVoice !== voice) voiceCandidates.push(fallbackVoice)

  // Chain onto the global lock so only one generation runs at a time
  const prev = globalTtsLock
  const result = prev.then(async () => {
    for (const v of voiceCandidates) {
      try {
        const audioData = await tryGenerateVoice(text, v)
        if (audioCache.size >= MAX_CACHE) {
          const firstKey = audioCache.keys().next().value
          if (firstKey) audioCache.delete(firstKey)
        }
        audioCache.set(key, audioData)
        return audioData
      } catch (e: any) {
        console.log(`[TTS] Voice ${v} failed: ${e.message?.slice(0, 60)}, trying next...`)
      }
    }
    console.error("[TTS] All voice candidates failed for lang:", lang)
    return Buffer.alloc(0)
  })

  // Update the global lock (catch so a failure doesn't stall the lock forever)
  globalTtsLock = result.catch(() => Buffer.alloc(0))
  return result
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

  console.log(`[TTS] lang=${lang} gender=${gender} voice=${voice} len=${text.length}`)

  generateTTS(text, voice, lang)
    .then((data) => {
      console.log(`[TTS] Generated ${data.length} bytes`)
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": data.length,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      })
      res.end(data)
    })
    .catch((err) => {
      console.error("[TTS] Generate error:", err)
      res.writeHead(500, { "Access-Control-Allow-Origin": "*" })
      res.end(JSON.stringify({ error: String(err) }))
    })
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
      resolve()
    })
  })
}

export function stopNodeTTS() {
  if (ttsServer) {
    ttsServer.close()
    ttsServer = null
  }
}
