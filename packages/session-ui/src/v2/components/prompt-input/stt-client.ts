// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Speech-to-text for the composer mic.
 *
 * The mic records while it is on and transcribes the whole recording once, when
 * it is switched off. One click starts the recording, the second click sends it
 * and the box shows "processing" until the finished text arrives in one piece.
 *
 * The endpoint also offers a "rolling" mode that re-sends the last few seconds
 * every tick and returns an `added` slice to append. It was tried and removed:
 * the recogniser re-reads the window from scratch each tick, so its answers
 * rewrite themselves mid-sentence, and every attempt to stitch them together —
 * appending `added`, or folding the raw text on its shared words — either
 * printed a sentence twice or dropped one. A single pass over the finished
 * recording has none of that: the recogniser sees the whole utterance once, so
 * what lands in the box is exactly what was said, in every language.
 *
 * The endpoint does not detect language on its own. "Auto" is resolved here by
 * offering the finished recording to a few likely languages at once and keeping
 * the answer that came back most confidently. A language chosen from the picker
 * is used directly and never guessed.
 */

export const STT_ENDPOINT = "https://zyraxonai.lovable.app/api/public/stt"

const SAMPLE_RATE = 16000
// A forgotten recording must not grow without bound; two minutes is far more
// than any single dictation and caps the buffer at roughly 23 MB.
const MAX_RECORD_SECONDS = 120

export type SttState = "idle" | "recording" | "processing"

export type SttHandlers = {
  /** The finished transcript, delivered once when the recording is sent. */
  onFinal?: (text: string) => void
  onError?: (message: string) => void
  onState?: (state: SttState) => void
  /** Input level, 0..1, for a meter. */
  onLevel?: (level: number) => void
}

type SttResponse = {
  success?: boolean
  text?: string
  confidence?: number
  error?: string
}

function clamp16(value: number) {
  const v = Math.round(value * 32767)
  return v > 32767 ? 32767 : v < -32768 ? -32768 : v
}

/** Float samples from the graph, resampled to the rate the endpoint wants. */
export function toInt16(input: Float32Array, fromRate: number, toRate = SAMPLE_RATE): Int16Array {
  if (fromRate === toRate) {
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) out[i] = clamp16(input[i])
    return out
  }
  const ratio = fromRate / toRate
  const outLength = Math.max(1, Math.floor(input.length / ratio))
  const out = new Int16Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const f = pos - i0
    out[i] = clamp16(input[i0] * (1 - f) + input[i1] * f)
  }
  return out
}

/**
 * The exact bytes of a 16-bit mono WAV. Built as one buffer rather than a Blob
 * of parts because the DOM types require an ArrayBuffer-backed view, and an
 * Int16Array alone is not accepted as a BlobPart.
 */
export function encodeWav(pcm: Int16Array, rate = SAMPLE_RATE): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + pcm.length * 2)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, "RIFF")
  view.setUint32(4, 36 + pcm.length * 2, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, pcm.length * 2, true)
  new Int16Array(buffer, 44).set(pcm)
  return buffer
}

/** Concatenate the recorded frames into the one buffer that gets sent. */
export function concatFrames(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

/**
 * Languages worth offering when the picker is on Auto. The person's own locale
 * leads, then the two the product is most used in. Deduped by primary subtag so
 * "en-GB" does not compete with "en-US".
 */
function autoCandidates(): string[] {
  const locale = (typeof navigator !== "undefined" && navigator.language) || "en-US"
  const seen = new Set<string>()
  const out: string[] = []
  for (const code of [locale, "bn-BD", "en-US"]) {
    const primary = code.split("-")[0]
    if (seen.has(primary)) continue
    seen.add(primary)
    out.push(code)
  }
  return out.slice(0, 3)
}

export class RealtimeStt {
  private handlers: SttHandlers
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private sink: GainNode | null = null
  private chunks: Float32Array[] = []
  private frames = 0
  private nativeRate = SAMPLE_RATE
  private running = false
  private state: SttState = "idle"
  private language = "auto"
  private transcript = ""

  constructor(handlers: SttHandlers) {
    this.handlers = handlers
  }

  get text() {
    return this.transcript
  }

  get currentState() {
    return this.state
  }

  private setState(state: SttState) {
    if (this.state === state) return
    this.state = state
    this.handlers.onState?.(state)
  }

  private async postBatch(pcm: Int16Array, language: string): Promise<SttResponse> {
    const form = new FormData()
    form.append("file", new Blob([encodeWav(pcm)], { type: "audio/wav" }), "audio.wav")
    form.append("language", language)
    const response = await fetch(STT_ENDPOINT, { method: "POST", body: form })
    if (!response.ok) throw new Error(`STT ${response.status}`)
    return (await response.json()) as SttResponse
  }

  /** One pass over the finished recording, in the chosen language or detected. */
  private async transcribe(pcm: Int16Array): Promise<string> {
    if (this.language !== "auto") {
      const result = await this.postBatch(pcm, this.language)
      return (result.text || "").trim()
    }
    const candidates = autoCandidates()
    if (candidates.length === 1) {
      const result = await this.postBatch(pcm, candidates[0])
      return (result.text || "").trim()
    }
    const attempts = await Promise.all(
      candidates.map(async (code) => {
        try {
          const result = await this.postBatch(pcm, code)
          return { code, confidence: result.confidence ?? 0, text: (result.text || "").trim() }
        } catch {
          return { code, confidence: -1, text: "" }
        }
      }),
    )
    let best = ""
    let bestScore = -1
    for (const attempt of attempts) {
      if (!attempt.text) continue
      if (attempt.confidence > bestScore) {
        bestScore = attempt.confidence
        best = attempt.text
      }
    }
    return best
  }

  private teardown() {
    if (this.processor) {
      this.processor.onaudioprocess = null
      try {
        this.processor.disconnect()
      } catch {}
      this.processor = null
    }
    if (this.source) {
      try {
        this.source.disconnect()
      } catch {}
      this.source = null
    }
    if (this.sink) {
      try {
        this.sink.disconnect()
      } catch {}
      this.sink = null
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop()
        } catch {}
      }
      this.stream = null
    }
    if (this.ctx) {
      try {
        void this.ctx.close()
      } catch {}
      this.ctx = null
    }
  }

  async start(language: string): Promise<boolean> {
    if (this.running) return true
    this.language = language || "auto"
    this.transcript = ""
    this.chunks = []
    this.frames = 0

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.handlers.onError?.("Microphone access is not available here.")
      return false
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
      })
    } catch {
      this.handlers.onError?.("Microphone permission was denied.")
      return false
    }

    this.setState("recording")

    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctor) {
      for (const track of stream.getTracks()) {
        try {
          track.stop()
        } catch {}
      }
      this.handlers.onError?.("Audio capture is not available here.")
      this.setState("idle")
      return false
    }

    // Asking for the target rate up front means the common case needs no
    // resampling at all; the graph is still measured and corrected when refused.
    let ctx: AudioContext
    try {
      ctx = new Ctor({ sampleRate: SAMPLE_RATE })
    } catch {
      ctx = new Ctor()
    }
    this.ctx = ctx
    this.stream = stream
    this.nativeRate = ctx.sampleRate
    try {
      await ctx.resume()
    } catch {}

    const source = ctx.createMediaStreamSource(stream)
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    const sink = ctx.createGain()
    // The processor must reach the destination to be pumped, but feeding the mic
    // back to the speakers would echo. A silent gain node keeps the graph alive.
    sink.gain.value = 0

    processor.onaudioprocess = (event) => {
      if (this.frames >= this.nativeRate * MAX_RECORD_SECONDS) return
      const channel = event.inputBuffer.getChannelData(0)
      // The graph reuses its buffer between callbacks, so the frame is copied.
      this.chunks.push(new Float32Array(channel))
      this.frames += channel.length
      let sum = 0
      for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i]
      this.handlers.onLevel?.(Math.min(1, Math.sqrt(sum / channel.length) * 4))
    }

    source.connect(processor)
    processor.connect(sink)
    sink.connect(ctx.destination)

    this.source = source
    this.processor = processor
    this.sink = sink
    this.running = true
    return true
  }

  /**
   * Send the finished recording and wait for the transcript. The state becomes
   * "processing" for the whole round trip so the button can say so, and only
   * then does the finished text arrive.
   */
  async stop(): Promise<void> {
    if (!this.running) return
    this.running = false
    const chunks = this.chunks
    const rate = this.nativeRate
    this.teardown()

    if (!chunks.length) {
      this.setState("idle")
      return
    }

    this.setState("processing")
    try {
      const pcm = toInt16(concatFrames(chunks), rate)
      const text = await this.transcribe(pcm)
      this.transcript = text
      if (text) this.handlers.onFinal?.(text)
    } catch {
      this.handlers.onError?.("Could not transcribe the recording.")
    } finally {
      this.chunks = []
      this.frames = 0
      this.setState("idle")
    }
  }

  /**
   * The language is only read when the recording is sent, so a change made while
   * recording simply applies to that utterance — no re-locking or re-read needed.
   */
  setLanguage(language: string) {
    this.language = language || "auto"
  }

  dispose() {
    this.running = false
    this.chunks = []
    this.frames = 0
    this.teardown()
  }
}

export function createRealtimeStt(handlers: SttHandlers): RealtimeStt {
  return new RealtimeStt(handlers)
}
