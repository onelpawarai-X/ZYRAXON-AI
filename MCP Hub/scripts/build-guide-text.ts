// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Build catalog/guide-text.ts: the setup guide, translated.
 *
 *   bun run "MCP Hub/scripts/build-guide-text.ts"
 *
 * The English text is the source of truth and lives in catalog/guide.ts, plus
 * the hand-written steps and notes in catalog/seed.ts. This reads both, asks
 * Google's public translation endpoint for every other language in LANGUAGES,
 * and writes the result into guide-text.ts.
 *
 * It is a build step rather than a runtime call on purpose: the guide must read
 * the same with the network off, a language switch must be instant, and no
 * vendor's rate limit may decide whether a user can understand their own card.
 *
 * Two requests per language: one for the guide sentences, one for the catalog's
 * own prose. Batches are sent as newline-joined text because the endpoint keeps
 * line boundaries, and a batch whose line count does not come back matching is
 * retried and then split into one request per line rather than guessed at.
 */

import { LANGUAGES, templates } from "../catalog/guide"
import { allSeedApps } from "../catalog/seed"

const ENDPOINT = "https://translate.googleapis.com/translate_a/single"
const TARGET = import.meta.env.TARGET_LANGS?.split(",") ?? LANGUAGES.map((lang) => lang.code).filter((c) => c !== "en")
const MAX_BATCH_CHARS = 6000
const DELAY_MS = 250
const RETRIES = 4

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Hold the parts of a sentence that must come back byte-identical.
 *
 * A translator will happily turn {redirect} into {রিডাইরেক্ট}, after which the
 * composer has nothing to fill in and the reader sees a brace where the URL
 * should be. The same goes for the words the user will read off the screen —
 * the buttons really do say Connect and Allow. So they are lifted out, replaced
 * by index markers the engine has no reason to touch, and put back afterwards.
 */
interface Slot {
  key?: string
  literal?: string
}

function mask(text: string): { masked: string; slots: Slot[] } {
  const slots: Slot[] = []
  const push = (slot: Slot) => {
    slots.push(slot)
    return `[[${slots.length - 1}]]`
  }
  const masked = text
    .replace(/\{(\w+)\}/g, (_, key: string) => push({ key }))
    .replace(/\bZYRAXON\b/g, () => push({ literal: "ZYRAXON" }))
    .replace(/\bDisconnect\b/g, () => push({ literal: "Disconnect" }))
    .replace(/\bConnect\b/g, () => push({ literal: "Connect" }))
    .replace(/\bAllow\b/g, () => push({ literal: "Allow" }))
  return { masked, slots }
}

function unmask(text: string, slots: Slot[]): string {
  return text.replace(/\[\[\s*(\d+)\s*\]\]/g, (marker, index: string) => {
    const slot = slots[Number(index)]
    if (!slot) return marker
    return slot.key ? `{${slot.key}}` : (slot.literal ?? marker)
  })
}

/** A translation that lost a placeholder would render as a stray brace. */
function intact(original: string, translated: string): boolean {
  const keys = [...original.matchAll(/\{(\w+)\}/g)].map((match) => match[1])
  return keys.every((key) => translated.includes(`{${key}}`))
}

/** The hand-written prose in the catalog: every step and every note. */
function catalogProse(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const app of allSeedApps()) {
    for (const text of [...(app.steps ?? []), ...(app.note ? [app.note] : [])]) {
      if (seen.has(text)) continue
      seen.add(text)
      out.push(text)
    }
  }
  return out
}

function batches(lines: string[]): string[][] {
  const out: string[][] = []
  let current: string[] = []
  let size = 0
  for (const text of lines) {
    if (current.length > 0 && size + text.length > MAX_BATCH_CHARS) {
      out.push(current)
      current = []
      size = 0
    }
    current.push(text)
    size += text.length + 1
  }
  if (current.length > 0) out.push(current)
  return out
}

async function request(text: string, lang: string): Promise<string> {
  const body = new URLSearchParams({ q: text, sl: "en", tl: lang, dt: "t", client: "dict-chrome-ex" })
  let last = ""
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: body.toString(),
      })
      const raw = await res.text()
      if (res.ok && raw.startsWith("[")) {
        const data = JSON.parse(raw)
        const joined: string = data[0]?.map((part: unknown[]) => part[0]).join("") ?? ""
        if (joined) return joined
      }
      last = `status ${res.status}`
    } catch (error) {
      last = String(error)
    }
    await sleep(1500 * (attempt + 1))
  }
  throw new Error(`${lang}: ${last}`)
}

/** Translate a batch, falling back to one request per line if the split lies. */
async function translateBatch(lines: string[], lang: string): Promise<string[]> {
  const held = lines.map(mask)
  const joined = await request(held.map((slot) => slot.masked).join("\n"), lang)
  const parts = joined.split("\n")
  if (parts.length === held.length) return repair(lines, held, parts, lang)
  const out: string[] = []
  for (const heldLine of held) {
    out.push(unmask(await request(heldLine.masked, lang), heldLine.slots))
    await sleep(DELAY_MS)
  }
  return out
}

/** Put the held pieces back, and re-ask for any line the engine dropped one. */
async function repair(lines: string[], held: { masked: string; slots: Slot[] }[], parts: string[], lang: string): Promise<string[]> {
  const out = parts.map((part, i) => unmask(part, held[i].slots))
  for (let i = 0; i < out.length; i++) {
    if (intact(lines[i], out[i])) continue
    await sleep(DELAY_MS)
    const retry = unmask(await request(held[i].masked, lang), held[i].slots)
    out[i] = intact(lines[i], retry) ? retry : lines[i]
  }
  return out
}

async function translateAll(lines: string[], lang: string): Promise<string[]> {
  const out: string[] = []
  for (const batch of batches(lines)) {
    out.push(...(await translateBatch(batch, lang)))
    await sleep(DELAY_MS)
  }
  return out
}

async function main() {
  const templateKeys = Object.keys(templates) as (keyof typeof templates)[]
  const templateLines = templateKeys.map((key) => templates[key])
  const prose = catalogProse()

  // A partial run (TARGET_LANGS set) keeps everything already translated and
  // only asks for what is missing, so one rate-limited language does not cost
  // the other fifty-nine. A full run starts clean.
  const partial = TARGET.length < LANGUAGES.length - 1
  const existing = partial
    ? await import("../catalog/guide-text").catch(() => ({ TRANSLATIONS: {}, APP_TEXT: {} }))
    : { TRANSLATIONS: {}, APP_TEXT: {} }
  const translations: Record<string, Record<string, string>> = { ...existing.TRANSLATIONS }
  const appText: Record<string, Record<string, string>> = { ...existing.APP_TEXT }

  console.log(`guide translation: ${TARGET.length} languages${partial ? " (merging into what is already there)" : ""}`)
  console.log(`  guide sentences: ${templateLines.length}`)
  console.log(`  catalog prose:   ${prose.length}`)

  const failed: string[] = []
  const started = Date.now()

  for (const [index, lang] of TARGET.entries()) {
    try {
      const [guideLines, proseLines] = [await translateAll(templateLines, lang), await translateAll(prose, lang)]
      const guide: Record<string, string> = {}
      templateKeys.forEach((key, i) => {
        if (guideLines[i] && guideLines[i] !== templateLines[i]) guide[key] = guideLines[i].trim()
      })
      const proseMap: Record<string, string> = {}
      prose.forEach((text, i) => {
        if (proseLines[i] && proseLines[i] !== text) proseMap[text] = proseLines[i].trim()
      })
      translations[lang] = guide
      appText[lang] = proseMap
      const missing = templateKeys.length - Object.keys(guide).length
      process.stdout.write(`  ${lang} ok (${Object.keys(proseMap).length}/${prose.length} prose${missing ? `, ${missing} guide lines identical to English` : ""})\n`)
    } catch (error) {
      failed.push(lang)
      console.error(`  ${lang} FAILED: ${String(error)}`)
    }
  }

  const header = `// Copyright (c) 2026 onelpawarai. All rights reserved.

// Generated by scripts/build-guide-text.ts — do not edit by hand.
//
// The setup guide in every language the panel offers. Keys are the English
// source text in catalog/guide.ts (guide sentences) and in catalog/seed.ts
// (a vendor's own steps and notes). A language missing here simply falls back
// to English, so a gap is a readable guide rather than a blank one.

export const TRANSLATIONS: Record<string, Record<string, string>> = ${JSON.stringify(translations, null, 2)}

export const APP_TEXT: Record<string, Record<string, string>> = ${JSON.stringify(appText, null, 2)}
`

  await Bun.write(new URL("../catalog/guide-text.ts", import.meta.url), header)

  const bytes = new TextEncoder().encode(header).length
  console.log(`  wrote guide-text.ts (${(bytes / 1024).toFixed(0)} KB, ${Object.keys(translations).length} languages, ${((Date.now() - started) / 1000).toFixed(0)}s)`)
  if (failed.length > 0) {
    console.error(`  FAILED: ${failed.join(", ")}`)
    process.exitCode = 1
  }
}

await main()
