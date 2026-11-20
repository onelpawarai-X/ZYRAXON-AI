#!/usr/bin/env bun
// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Builds a real, complete dictionary for every language in the registry.
 *
 * The app used to fall back to the English source whenever a locale had no
 * dictionary of its own, so most of the 255 languages in the picker rendered an
 * English interface. This script removes that dependency by translating the full
 * English source once per language and writing a per-locale module the app can
 * import directly.
 *
 * It runs against the registry in `packages/app/src/i18n/languages.ts`, so a
 * language added there is handled here with no second list to maintain. The
 * app and UI strings are translated together into one dictionary per locale, so
 * a single import covers both.
 *
 * Translation engine: Google's public `clients5` endpoint. It accepts many `q`
 * values per request and does not throttle the way the `gtx` endpoint does, so
 * a whole dictionary moves in a handful of batched round trips. `{{tokens}}`
 * are masked before the request and restored after, so a placeholder can never
 * be reordered or dropped. A string the engine cannot translate keeps the
 * English source rather than leaving a hole.
 *
 * Re-running is safe and resumable: a key already present in the generated file
 * is left untouched, so only new strings are translated.
 *
 * Usage:
 *   bun run script/translate-all.ts                 # every locale, resumable
 *   bun run script/translate-all.ts de fr           # only these locales
 *   bun run script/translate-all.ts --limit=10      # first ten locales
 *   bun run script/translate-all.ts --refresh       # re-translate every key
 */

import path from "path"
import { LANGUAGES } from "../packages/app/src/i18n/languages"

type Dictionary = Record<string, string>

const root = path.resolve(import.meta.dir, "..")
const OUT_DIR = path.join(root, "packages/app/src/i18n/generated")

/** Google tags that differ from the registry tag. */
const GOOGLE_LOCALE: Record<string, string> = {
  zht: "zh-TW",
  "pt-BR": "pt",
  no: "nb",
}

/**
 * Registry locales Google has no model for. Each maps to the closest language it
 * does translate, so a Nynorsk speaker reads Norwegian rather than English, and a
 * low-resource language with no close relative keeps the English source. The
 * alternative — a blank interface — is worse than either.
 */
const UNSUPPORTED: Record<string, string> = {
  nn: "nb", nds: "de", rm: "it", sc: "it", ast: "es", an: "es", smj: "nb",
  arc: "ar", syr: "ar", nqo: "fr", mni: "bn", raj: "hi", syl: "bn", ctg: "bn",
  rkt: "bn", bpy: "bn", nan: "zh-TW", wuu: "zh", hak: "zh-TW", ii: "zh",
  hif: "hi", niu: "en", tvl: "en", gil: "en", tkl: "en", na: "en", nd: "sw",
  kam: "sw", loz: "sw", snk: "fr", kab: "fr", sid: "am", wal: "am", tig: "ar",
  byn: "am", bi: "en", pau: "en", nrf: "fr", kmb: "pt", bjn: "id", mga: "ga",
  sco: "en", gsw: "de", nah: "es", mvf: "mn", myv: "ru", mot: "es", kw: "en",
  srr: "fr", men: "en", tem: "en", vai: "en", mos: "fr", nv: "en", hop: "en",
  chr: "en", oj: "en", crk: "en", ho: "en", efi: "en", ie: "en", tlh: "en",
}

function effectiveTarget(target: string) {
  return UNSUPPORTED[target] ?? target
}

/** Values that must stay exactly as written: product names, URLs, key names. */
const PRESERVE_PREFIX = ["language.", "command.category.mcp"]
const PRESERVE = new Set([
  "provider.connect.zyraxonZen.visit.link",
  "provider.custom.field.providerID.placeholder",
  "provider.custom.field.baseURL.placeholder",
  "provider.custom.models.id.placeholder",
  "provider.custom.headers.key.placeholder",
  "provider.custom.headers.value.placeholder",
  "model.provider.anthropic",
  "model.provider.openai",
  "model.provider.google",
  "model.provider.xai",
  "model.provider.meta",
  "common.loading.ellipsis",
  "dialog.server.add.placeholder",
  "wsl.server.label",
  "wsl.onboarding.step.zyraxon",
])

function preserved(key: string) {
  return PRESERVE.has(key) || PRESERVE_PREFIX.some((prefix) => key.startsWith(prefix))
}

function mask(value: string) {
  const found = [...value.matchAll(/\{\{[^}]*\}\}/g)].map((match) => match[0])
  let index = 0
  return {
    text: value.replace(/\{\{[^}]*\}\}/g, () => `__ZYRAXON_TOKEN_${index++}__`),
    found,
  }
}

function unmask(value: string, found: string[]) {
  return found.reduce((text, token, index) => text.replaceAll(`__ZYRAXON_TOKEN_${index}__`, token), value)
}

/**
 * One batched request. The endpoint answers with a plain array of strings in
 * the same order as the `q` values, and repeats a value unchanged when it has
 * no translation for it.
 */
async function translateBatch(values: string[], target: string): Promise<string[]> {
  const url = new URL("https://clients5.google.com/translate_a/t")
  url.searchParams.set("client", "dict-chrome-ex")
  url.searchParams.set("sl", "en")
  url.searchParams.set("tl", GOOGLE_LOCALE[target] ?? target)
  for (const value of values) url.searchParams.append("q", value)

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } })
      // A 4xx is a permanent answer — an unsupported tag or a malformed batch —
      // so retrying it only burns time. Anything else is worth waiting out.
      if (response.status >= 400 && response.status < 500) return values
      if (!response.ok) {
        await Bun.sleep(1500 * 2 ** attempt)
        continue
      }
      const body = (await response.json()) as unknown
      const list = Array.isArray(body) ? body : [body]
      if (list.length !== values.length) {
        await Bun.sleep(1500 * 2 ** attempt)
        continue
      }
      return list.map((item) => (typeof item === "string" ? item : values[0]))
    } catch {
      await Bun.sleep(1500 * 2 ** attempt)
    }
  }
  return values
}

const BATCH = 80

async function translateDictionary(
  missing: Dictionary,
  target: string,
  label: string,
): Promise<Dictionary> {
  const engine = effectiveTarget(target)
  const entries = Object.entries(missing)
  const output: Dictionary = {}
  const started = Date.now()

  for (let start = 0; start < entries.length; start += BATCH) {
    const batch = entries.slice(start, start + BATCH)
    const masks = batch.map(([key, value]) => (preserved(key) ? null : mask(value)))
    // Preserved values never leave the machine, so they are not part of the
    // request; the translated array is stitched back by position below.
    const request = batch
      .map(([, value], index) => (masks[index] ? masks[index]!.text : null))
      .filter((value): value is string => value !== null)

    const translated = request.length > 0 ? await translateBatch(request, engine) : []
    let cursor = 0
    for (let index = 0; index < batch.length; index++) {
      const [key, value] = batch[index]
      if (masks[index] === null) {
        output[key] = value
        continue
      }
      const raw = translated[cursor++] ?? value
      output[key] = unmask(raw, masks[index]!.found)
    }

    const percent = Math.min(100, Math.round(((start + batch.length) / entries.length) * 100))
    const perSec = ((start + batch.length) / ((Date.now() - started) / 1000)).toFixed(1)
    process.stdout.write(`\r${label}: ${percent}% (${Object.keys(output).length}/${entries.length}) ${perSec}/s   `)
    await Bun.sleep(60)
  }

  process.stdout.write("\n")
  return output
}

function render(key: string, value: string) {
  // Always JSON-quote. A single-quoted string breaks the moment the value
  // contains a quote or a real newline, which a translation of a multi-line
  // source readily does, so there is no shorter form worth the risk.
  return `${key}: ${JSON.stringify(value)}`
}

async function writeLocale(code: string, dict: Dictionary) {
  const body = Object.entries(dict)
    .map(([key, value]) => `  ${render(JSON.stringify(key), value)},`)
    .join("\n")
  await Bun.write(
    path.join(OUT_DIR, `${code}.ts`),
    `// Copyright (c) 2026 onelpawarai. All rights reserved.
// Generated by script/translate-all.ts — edit the English source, then re-run.

export const dict: Record<string, string> = {
${body}
}
`,
  )
}

async function writeManifest(codes: string[]) {
  const body = codes.map((code) => `  ${JSON.stringify(code)}: () => import("./${code}").then((m) => m.dict),`).join("\n")
  await Bun.write(
    path.join(OUT_DIR, "manifest.ts"),
    `// Copyright (c) 2026 onelpawarai. All rights reserved.
// Generated by script/translate-all.ts — do not edit by hand.

export const GENERATED: Record<string, () => Promise<Record<string, string>>> = {
${body}
}
`,
  )
}

async function main() {
  const args = Bun.argv.slice(2)
  const only = args.filter((value) => !value.startsWith("--"))
  const limit = args.find((value) => value.startsWith("--limit="))?.split("=")[1]
  const refresh = args.includes("--refresh")

  const appSource = (await import(path.join(root, "packages/app/src/i18n/en.ts"))).dict as Dictionary
  const uiSource = (await import(path.join(root, "packages/ui/src/i18n/en.ts"))).dict as Dictionary
  const source: Dictionary = { ...appSource, ...uiSource }

  await Bun.$`mkdir -p ${OUT_DIR}`.quiet()

  const all = LANGUAGES.map((entry) => entry.code).filter((code) => code !== "en")
  const targets = (only.length > 0 ? only : all).slice(0, limit ? Number(limit) : undefined)

  console.log(`Source: ${Object.keys(source).length} keys · locales: ${targets.length}\n`)

  const written: string[] = []
  for (const code of targets) {
    const file = path.join(OUT_DIR, `${code}.ts`)
    let current: Dictionary = {}
    if (!refresh && (await Bun.file(file).exists())) {
      try {
        current = (await import(`${file}?t=${Date.now()}`)).dict as Dictionary
      } catch {
        current = {}
      }
    }
    const missing = Object.fromEntries(Object.entries(source).filter(([key]) => !(key in current)))
    if (Object.keys(missing).length === 0) {
      console.log(`${code}: already complete (${Object.keys(current).length} keys)`)
      written.push(code)
      continue
    }

    const translated = await translateDictionary(missing, code, `${code}`)
    await writeLocale(code, { ...current, ...translated })
    written.push(code)
    console.log(`${code}: wrote ${Object.keys(translated).length} new key(s), ${Object.keys({ ...current, ...translated }).length} total`)
  }

  // The manifest lists every locale that has a file on disk, so a partial run
  // still produces a usable map and a later run can add the rest. Parallel
  // shards skip it and let one coordinator write it after they all finish.
  if (args.includes("--no-manifest")) return
  const onDisk = (
    await Array.fromAsync(new Bun.Glob("*.ts").scan(OUT_DIR))
  )
    .filter((name) => name !== "manifest.ts")
    .map((name) => name.replace(/\.ts$/, ""))
    .sort()
  await writeManifest(onDisk)
  console.log(`\nManifest: ${onDisk.length} locale(s).`)
}

await main()
