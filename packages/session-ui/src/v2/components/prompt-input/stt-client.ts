// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Real-time speech-to-text for the composer mic.
 *
 * The microphone is captured in this window and the audio is streamed to the
 * ZYRAXON public STT endpoint, which answers with text as the person speaks.
 * Nothing opens a second window and nothing runs on a local port — the old
 * Chrome voice-bridge page is gone.
 *
 * The endpoint offers three ways in, and the choice here is deliberate:
 *
 *   live    one long stream of PCM. It is the obvious fit, but the host buffers
 *           the request body, so `ready` only arrives once the speaker stops —
 *           measured at ~9s of dead air before the first word. Unusable.
 *   batch   one whole recording per call. Accurate, but nothing appears until
 *           the speaker is finished.
 *   rolling one small, complete window per tick. Each tick is a request the host
 *           passes straight through, so a tick measured ~0.5–1s. This is the
 *           only mode that is actually real-time here.
 *
 * So the mic keeps the last few seconds of PCM in a ring, re-sends that window
 * every tick with the text already committed, and paints the growing transcript.
 * Re-sending the overlap (rather than only the new part) is what lets the
 * recogniser resolve a word a shorter slice would clip.
 *
 * The endpoint does not detect language and will not guess. "Auto" is therefore
 * resolved here: the first window is offered to a few likely languages and the
 * one that answers most confidently is locked in for the rest of the session.
 */

export const STT_ENDPOINT = "https://zyraxonai.lovable.app/api/public/stt"

const SAMPLE_RATE = 16000
const WINDOW_SECONDS = 4
const TICK_MS = 1400
const MIN_TICK_SAMPLES = SAMPLE_RATE * 0.4
const MAX_TICK_SAMPLES = SAMPLE_RATE * 30

export type SttState = "idle" | "recording" | "processing"

export type SttHandlers = {
  /** The transcript so far, repainted on every tick as it grows. */
  onLive?: (text: string) => void
  /** The settled transcript when the mic stops. */
  onFinal?: (text: string) => void
  onError?: (message: string) => void
  onState?: (state: SttState) => void
  /** Input level, 0..1, for a meter. */
  onLevel?: (level: number) => void
}

type SttResponse = {
  success?: boolean
  text?: string
  added?: string
  committed?: string
  confidence?: number
  error?: string
}

function clamp16(value: number) {
  const v = Math.round(value * 32767)
  return v > 32767 ? 32767 : v < -32768 ? -32768 : v
}

/** Float samples from the graph, resampled to the rate the endpoint wants. */
function toInt16(input: Float32Array, fromRate: number, toRate = SAMPLE_RATE): Int16Array {
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
function encodeWav(pcm: Int16Array, rate = SAMPLE_RATE): ArrayBuffer {
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

/**
 * A window of recent audio. The mic produces frames faster than a tick consumes
 * them, so the buffer is bounded and the oldest audio is dropped rather than
 * growing without limit during a long dictation.
 */
class PcmRing {
  private data = new Int16Array(SAMPLE_RATE * 40)
  private length = 0

  push(chunk: Int16Array) {
    if (chunk.length >= this.data.length) {
      this.data.set(chunk.subarray(chunk.length - this.data.length))
      this.length = this.data.length
      return
    }
    if (this.length + chunk.length > this.data.length) {
      const drop = this.length + chunk.length - this.data.length
      this.data.copyWithin(0, drop, this.length)
      this.length -= drop
    }
    this.data.set(chunk, this.length)
    this.length += chunk.length
  }

  last(count: number): Int16Array {
    const take = Math.min(count, this.length)
    return this.data.slice(this.length - take, this.length)
  }

  get size() {
    return this.length
  }

  clear() {
    this.length = 0
  }
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
  private ring = new PcmRing()
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private ticking = false
  private committed = ""
  private transcript = ""
  private language = "auto"
  private locked: string | null = null
  private state: SttState = "idle"

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

  /** The assistant's own voice is playing back; transcribing it would be echo. */
  private assistantSpeaking() {
    try {
      return !!(window as any).__zyraxonTTSActiveRender
    } catch {
      return false
    }
  }

  private async postRolling(pcm: Int16Array, language: string): Promise<SttResponse> {
    const url =
      `${STT_ENDPOINT}?mode=rolling` +
      `&language=${encodeURIComponent(language)}` +
      `&committed=${encodeURIComponent(this.committed)}` +
      `&window=${WINDOW_SECONDS}`
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": `audio/l16; rate=${SAMPLE_RATE}` },
      body: pcm.buffer as ArrayBuffer,
    })
    if (!response.ok) throw new Error(`STT ${response.status}`)
    return (await response.json()) as SttResponse
  }

  private async postBatch(pcm: Int16Array, language: string): Promise<SttResponse> {
    const form = new FormData()
    form.append("file", new Blob([encodeWav(pcm)], { type: "audio/wav" }), "audio.wav")
    form.append("language", language)
    const response = await fetch(STT_ENDPOINT, { method: "POST", body: form })
    if (!response.ok) throw new Error(`STT ${response.status}`)
    return (await response.json()) as SttResponse
  }

  /** Offer one window to the likely languages and keep the most confident. */
  private async detectLanguage(pcm: Int16Array): Promise<string> {
    const candidates = autoCandidates()
    if (candidates.length === 1) return candidates[0]
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
    let best = candidates[0]
    let bestScore = -1
    for (const attempt of attempts) {
      if (!attempt.text) continue
      if (attempt.confidence > bestScore) {
        bestScore = attempt.confidence
        best = attempt.code
      }
    }
    return best
  }

  private apply(result: SttResponse) {
    const text = (result.text || "").trim()
    this.committed = result.committed ?? this.committed
    if (!text || text === this.transcript) return
    this.transcript = text
    this.handlers.onLive?.(text)
  }

  private async tick() {
    if (!this.running || this.ticking) return
    if (this.ring.size < MIN_TICK_SAMPLES) return
    if (this.assistantSpeaking()) return
    this.ticking = true
    try {
      const window = this.ring.last(SAMPLE_RATE * WINDOW_SECONDS)
      if (!this.locked) this.locked = await this.detectLanguage(window)
      const result = await this.postRolling(window, this.locked)
      this.apply(result)
    } catch {
      // A dropped tick is not fatal — the next one re-sends the whole window.
    } finally {
      this.ticking = false
    }
  }

  private teardown() {
    if (this.processor) {
      this.processor.onaudioprocess = null
      try { this.processor.disconnect() } catch {}
      this.processor = null
    }
    if (this.source) { try { this.source.disconnect() } catch {}; this.source = null }
    if (this.sink) { try { this.sink.disconnect() } catch {}; this.sink = null }
    if (this.stream) {
      for (const track of this.stream.getTracks()) { try { track.stop() } catch {} }
      this.stream = null
    }
    if (this.ctx) { try { void this.ctx.close() } catch {}; this.ctx = null }
    this.ring.clear()
  }

  async start(language: string): Promise<boolean> {
    if (this.running) return true
    this.language = language || "auto"
    this.locked = this.language === "auto" ? null : this.language
    this.committed = ""
    this.transcript = ""
    this.ring.clear()

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
      for (const track of stream.getTracks()) { try { track.stop() } catch {} }
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
    try { await ctx.resume() } catch {}

    const source = ctx.createMediaStreamSource(stream)
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    const sink = ctx.createGain()
    // The processor must reach the destination to be pumped, but feeding the mic
    // back to the speakers would echo. A silent gain node keeps the graph alive.
    sink.gain.value = 0

    processor.onaudioprocess = (event) => {
      const channel = event.inputBuffer.getChannelData(0)
      this.ring.push(toInt16(channel, ctx.sampleRate))
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
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    return true
  }

  async stop(): Promise<void> {
    if (!this.running) return
    this.running = false
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.setState("processing")

    // A tick in flight is about to paint text; let it land before the final pass.
    while (this.ticking) await new Promise((resolve) => setTimeout(resolve, 50))

    let finalText = this.transcript
    try {
      if (this.ring.size >= MIN_TICK_SAMPLES) {
        const window = this.ring.last(Math.min(this.ring.size, MAX_TICK_SAMPLES))
        if (!this.locked) this.locked = await this.detectLanguage(this.ring.last(SAMPLE_RATE * WINDOW_SECONDS))
        // The whole recording in one call is more accurate than the last window,
        // so it is what the composer is finally given.
        const result = await this.postBatch(window, this.locked)
        const text = (result.text || "").trim()
        if (text) finalText = text
      }
    } catch {
      // Fall back to whatever the ticks already produced.
    }

    this.teardown()
    this.transcript = finalText
    this.setState("idle")
    if (finalText) this.handlers.onFinal?.(finalText)
  }

  /**
   * Switching language mid-sentence has to take effect on the utterance being
   * recorded now, not the next one. Re-locking is enough: the next tick re-sends
   * the whole window, so the new recogniser re-reads it immediately.
   */
  setLanguage(language: string) {
    this.language = language || "auto"
    if (this.language !== "auto") {
      this.locked = this.language
      return
    }
    if (this.running) this.locked = null
  }

  dispose() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.running = false
    this.teardown()
  }
}

export function createRealtimeStt(handlers: SttHandlers): RealtimeStt {
  return new RealtimeStt(handlers)
}
