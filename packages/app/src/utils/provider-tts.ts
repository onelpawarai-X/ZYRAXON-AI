// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * ZYRAXON provider speech — the website's streaming text-to-speech endpoint.
 *
 * `POST https://zyraxonai.lovable.app/api/public/tts` answers with an
 * `audio/mpeg` stream that begins arriving before the sentence is finished, so a
 * caller can start playing on the first frame instead of waiting for a whole
 * file. The voice is chosen from the text's own language when the caller does not
 * name one, which is what stops an English voice from reading Bengali letters
 * that it simply cannot pronounce.
 *
 * This is the provider half of the app's two speech engines. The built-in engine
 * is a local Edge server the desktop process owns; this one is remote and needs
 * no key, which is why it also works in a plain browser.
 */

export const PROVIDER_TTS_URL = "https://zyraxonai.lovable.app/api/public/tts"

/** Script ranges that identify a language exactly, most specific first. */
const SCRIPTS: Array<{ locale: string; test: RegExp }> = [
  { locale: "bn", test: /[\u0980-\u09FF]/ },
  { locale: "hi", test: /[\u0900-\u097F]/ },
  { locale: "ta", test: /[\u0B80-\u0BFF]/ },
  { locale: "te", test: /[\u0C00-\u0C7F]/ },
  { locale: "kn", test: /[\u0C80-\u0CFF]/ },
  { locale: "ml", test: /[\u0D00-\u0D7F]/ },
  { locale: "gu", test: /[\u0A80-\u0AFF]/ },
  { locale: "pa", test: /[\u0A00-\u0A7F]/ },
  { locale: "or", test: /[\u0B00-\u0B7F]/ },
  { locale: "si", test: /[\u0D80-\u0DFF]/ },
  { locale: "fa", test: /[\u06A0-\u06FF]/ },
  { locale: "ar", test: /[\u0600-\u06FF\u0750-\u077F]/ },
  { locale: "he", test: /[\u0590-\u05FF]/ },
  { locale: "ru", test: /[\u0400-\u04FF]/ },
  { locale: "el", test: /[\u0370-\u03FF]/ },
  { locale: "th", test: /[\u0E00-\u0E7F]/ },
  { locale: "ko", test: /[\uAC00-\uD7AF\u1100-\u11FF]/ },
  { locale: "ja", test: /[\u3040-\u30FF]/ },
  { locale: "zh", test: /[\u4E00-\u9FFF]/ },
]

/**
 * The language of `text`, or undefined when it is plain Latin script.
 *
 * Counts characters rather than taking the first hit, so a Bengali answer that
 * quotes an English error message is still read in Bengali.
 */
export function detectSpeechLocale(text: string): string | undefined {
  let best: { locale: string; count: number } | null = null
  for (const { locale, test } of SCRIPTS) {
    const matches = text.match(new RegExp(test.source, "g"))
    const count = matches ? matches.length : 0
    if (count > 0 && (!best || count > best.count)) best = { locale, count }
  }
  return best?.locale
}

/**
 * The locale to request for `text`, given the user's configured language.
 *
 * The script of the text always beats the setting. A voice that does not cover
 * the text's script does not fail loudly — the endpoint answers `200` with an
 * `audio/mpeg` header and a zero-byte body — so sending Bengali letters to an
 * English voice produces silence that looks exactly like success. Honouring the
 * setting here would therefore make the provider engine appear broken for every
 * non-Latin reply, which is the one case it exists to serve.
 *
 * The setting still applies to Latin-script text, where any Latin voice can read
 * it. `auto` means the caller has no preference, so the endpoint picks its own
 * default rather than being handed a locale it must match.
 */
export function resolveSpeechLocale(text: string, preferred?: string): string | undefined {
  const detected = detectSpeechLocale(text)
  if (detected) return detected
  if (!preferred || preferred === "auto") return undefined
  // The endpoint's voices are keyed by language, not by region.
  return preferred.split("-")[0] || undefined
}

/**
 * A request whose body is the spoken audio, in the same shape the built-in
 * engine's prefetch returns so both engines share one playback path.
 *
 * A zero-byte body is reported as a failure rather than passed on as a response,
 * because it is indistinguishable from a real one by status or content type and
 * would otherwise play as silent success.
 */
export function providerSpeechRequest(
  text: string,
  locale?: string,
  signal?: AbortSignal,
): { promise: Promise<Response | null>; controller: AbortController } {
  const controller = new AbortController()
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true })
  const promise = fetch(PROVIDER_TTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, locale: locale ?? detectSpeechLocale(text) }),
    signal: controller.signal,
  })
    .then((resp) => {
      if (!resp.ok) return null
      // A declared empty length is a definite miss; an undeclared one is checked
      // by the caller, which is the only place the body may be consumed once.
      const length = resp.headers.get("content-length")
      if (length === "0") return null
      return resp
    })
    .catch(() => null)
  return { promise, controller }
}

/**
 * Speak through the provider without the desktop audio sink — the plain-browser
 * path. One utterance at a time, in order, and `stop()` silences the current one
 * so a cancelled reply cannot keep talking.
 */
export function createProviderSpeaker() {
  let queue: string[] = []
  let playing = false
  let audio: HTMLAudioElement | null = null
  let stopped = false

  const pump = async () => {
    if (playing) return
    playing = true
    try {
      while (!stopped && queue.length > 0) {
        const piece = queue.shift()!
        const { promise } = providerSpeechRequest(piece, resolveSpeechLocale(piece))
        const resp = await promise
        if (!resp || stopped) continue
        const blob = await resp.blob()
        // A zero-byte body is the endpoint's silent miss; playing it would look
        // like success while nothing is heard.
        if (blob.size === 0) continue
        const url = URL.createObjectURL(blob)
        const el = new Audio(url)
        audio = el
        await new Promise<void>((resolve) => {
          el.onended = () => resolve()
          el.onerror = () => resolve()
          el.play().catch(() => resolve())
        })
        URL.revokeObjectURL(url)
      }
    } finally {
      playing = false
      audio = null
    }
  }

  return {
    speak(text: string) {
      if (!text.trim()) return
      stopped = false
      queue.push(text)
      void pump()
    },
    stop() {
      stopped = true
      queue = []
      audio?.pause()
      audio = null
    },
  }
}
