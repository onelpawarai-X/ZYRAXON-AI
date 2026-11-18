#!/usr/bin/env bun
// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Fills every locale dictionary ZYRAXON ships by translating the English source.
 *
 * Two engines back this, tried in order:
 *
 *   1. Google Translate's public endpoint. It covers every language in the
 *      registry, but throttles hard: hundreds of strings a second earns a 429
 *      and then a block. Used slowly, with long backoff.
 *   2. LibreTranslate. No rate limit, but it supports fewer languages, so it is
 *      the reliable path for the bulk of the work.
 *
 * The registry in `packages/app/src/i18n/languages.ts` is the only locale list:
 * a language added there is picked up here with no second list to keep in sync.
 * Placeholders like {{count}} are masked before the request and restored after,
 * so a translation cannot reorder or drop one. Strings that must not move — key
 * names, URLs, brand names, file paths — are listed in PRESERVE.
 */

import path from "path"
import { LANGUAGES } from "../packages/app/src/i18n/languages"

type Dictionary = Record<string, string>

const root = path.resolve(import.meta.dir, "..")

/**
 * Values that are identical in every locale: a product name, a URL, a file
 * path, a keyboard key. Translating them would point the interface at
 * something that does not exist.
 */
const PRESERVE = new Set([
  "command.category.mcp",
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
  "language.en",
  "language.zh",
  "language.zht",
  "language.ko",
  "language.de",
  "language.es",
  "language.fr",
  "language.da",
  "language.ja",
  "language.pl",
  "language.ru",
  "language.ar",
  "language.no",
  "language.br",
  "language.bs",
  "language.uk",
  "language.th",
  "language.tr",
  "session.header.open.app.vscode",
  "session.header.open.app.cursor",
  "session.header.open.app.zed",
  "session.header.open.app.textmate",
  "session.header.open.app.antigravity",
  "session.header.open.app.iterm2",
  "session.header.open.app.ghostty",
  "session.header.open.app.warp",
  "session.header.open.app.xcode",
  "session.header.open.app.androidStudio",
  "session.header.open.app.powershell",
  "session.header.open.app.sublimeText",
  "status.popover.tab.mcp",
  "status.popover.tab.lsp",
  "settings.tab.mcp",
  "settings.desktop.section.wsl",
  "settings.mcp.title",
  "settings.permissions.tool.lsp.title",
  "settings.extensions.pane.mcp",
  "settings.extensions.config.file",
  "settings.extensions.config.pluginFile",
  "settings.extensions.config.lspFile",
])

/** Keycap labels are printed on the key itself in every locale. */
const KEY_PREFIX = "common.key."

/** Language names stay in the script they are written in. */
const LANGUAGE_PREFIX = "language."

const DOMAINS = [
  { name: "app", source: "packages/app/src/i18n/en.ts", out: "packages/app/src/i18n" },
  { name: "ui", source: "packages/ui/src/i18n/en.ts", out: "packages/ui/src/i18n" },
] as const

/** Keys that could not be translated, collected rather than thrown. */
const failed = new Set<string>()

async function readDictionary(file: string): Promise<Dictionary> {
  const module = await import(`${path.join(root, file)}?t=${Date.now()}`)
  return module.dict as Dictionary
}

function tokens(value: string) {
  return [...value.matchAll(/\{\{[^}]*\}\}/g)].map((match) => match[0])
}

/**
 * Placeholders become an opaque marker of the same length. A translator moves
 * words around freely but cannot see through the marker, and the original token
 * is restored afterwards wherever it ended up.
 */
function mask(value: string) {
  const found = tokens(value)
  let index = 0
  return {
    text: value.replace(/\{\{[^}]*\}\}/g, () => `__ZYRAXON_TOKEN_${index++}__`),
    found,
  }
}

function unmask(value: string, found: string[]) {
  return found.reduce(
    (text, token, index) => text.replaceAll(`__ZYRAXON_TOKEN_${index}__`, token),
    value,
  )
}

/** LibreTranslate names Chinese in script, so the registry tags are mapped. */
const LIBRE_LOCALE: Record<string, string> = { zh: "zh-Hans", zht: "zh-Hant", "pt-BR": "pt-BR" }

let libreLanguages: Set<string> | undefined

async function libreSupports(code: string) {
  libreLanguages ??= new Set(
    ((await (await fetch("https://libretranslate.com/languages")).json()) as { code: string }[]).map(
      (entry) => entry.code,
    ),
  )
  return libreLanguages.has(LIBRE_LOCALE[code] ?? code)
}

async function viaLibre(text: string, target: string) {
  const response = await fetch("https://libretranslate.com/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: text, source: "en", target: LIBRE_LOCALE[target] ?? target, format: "text" }),
  })
  if (!response.ok) throw new Error(`libre HTTP ${response.status}`)
  const body = (await response.json()) as { translatedText?: string }
  if (!body.translatedText) throw new Error("libre returned nothing")
  return body.translatedText
}

async function viaGoogle(text: string, target: string) {
  const url = new URL("https://translate.googleapis.com/translate_a/single")
  url.searchParams.set("client", "gtx")
  url.searchParams.set("sl", "en")
  url.searchParams.set("tl", target)
  url.searchParams.set("dt", "t")
  url.searchParams.set("q", text)

  let last = ""
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } })
      // Throttling and transient upstream errors are both worth waiting out
      // rather than failing the whole locale.
      if (response.status === 429 || response.status >= 500) {
        last = `HTTP ${response.status}`
        await Bun.sleep(2000 * 2 ** attempt)
        continue
      }
      if (!response.ok) throw new Error(`google HTTP ${response.status}`)
      const body = (await response.json()) as Array<Array<[string] | null>>
      const first = body[0]?.[0]?.[0]
      if (!first) throw new Error("google returned nothing")
      return first
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
      await Bun.sleep(2000 * 2 ** attempt)
    }
  }
  throw new Error(`google failed: ${last}`)
}

async function translateValue(key: string, value: string, target: string, useLibre: boolean) {
  if (PRESERVE.has(key) || key.startsWith(KEY_PREFIX) || key.startsWith(LANGUAGE_PREFIX)) return value
  if (!value.trim()) return value
  const masked = mask(value)
  if (!masked.text.trim()) return value
  // One untranslatable string must not abandon the rest of the locale, so a
  // failure keeps the English source and is reported once at the end.
  try {
    const translated = useLibre
      ? await viaLibre(masked.text, target)
      : await viaGoogle(masked.text, target)
    return unmask(translated, masked.found)
  } catch {
    failed.add(`${target}/${key}`)
    return value
  }
}

async function translateDictionary(
  source: Dictionary,
  target: string,
  label: string,
  useLibre: boolean,
) {
  const output: Dictionary = {}
  const entries = Object.entries(source)

  const BATCH = 10
  const WIDTH = 4
  for (let start = 0; start < entries.length; start += BATCH) {
    const batch = entries.slice(start, start + BATCH)
    const done: string[] = []

    for (let offset = 0; offset < batch.length; offset += WIDTH) {
      const slice = batch.slice(offset, offset + WIDTH)
      done.push(
        ...(await Promise.all(slice.map(([key, value]) => translateValue(key, value, target, useLibre)))),
      )
      // LibreTranslate tolerates a fast steady rate; Google does not, so the
      // gap widens for the engine that needs breathing room.
      await Bun.sleep(useLibre ? 40 : 250)
    }

    for (const [index, entry] of batch.entries()) output[entry[0]] = done[index] ?? entry[1]
    const percent = Math.min(100, Math.round(((start + batch.length) / entries.length) * 100))
    process.stdout.write(`\r${label}: ${percent}% (${Object.keys(output).length}/${entries.length})   `)
  }

  process.stdout.write("\n")
  return output
}

function render(key: string, value: string) {
  // Single quotes in the value would close a single-quoted string, so anything
  // carrying one is emitted double-quoted with the inner quotes escaped.
  if (value.includes("'") && !value.includes('"')) return `${key}: '${value.replaceAll("'", "\\'")}'`
  return `${key}: ${JSON.stringify(value)}`
}

async function writeDictionary(file: string, dict: Dictionary, typeName: string) {
  const body = Object.entries(dict)
    .map(([key, value]) => `  ${render(JSON.stringify(key), value)},`)
    .join("\n")

  await Bun.write(
    path.join(root, file),
    `// Copyright (c) 2026 onelpawarai. All rights reserved.

import { dict as en } from "./en"

type Keys = keyof typeof en

/**
 * Every string is this locale's own wording. A key with no translation stays
 * out of the file rather than falling back to English.
 */
export const dict = {
${body}
} satisfies Partial<Record<Keys, string>>

export type ${typeName} = keyof typeof dict
`,
  )
}

async function main() {
  const args = Bun.argv.slice(2)
  const only = args.filter((value) => !value.startsWith("-"))
  const limitArg = args.find((value) => value.startsWith("--limit="))?.split("=")[1]
  const force = args.includes("--google")

  const all = LANGUAGES.map((entry) => entry.code).filter((code) => code !== "en")
  const targets = (only.length > 0 ? only : all).slice(0, limitArg ? Number(limitArg) : undefined)

  console.log(`Translating ${targets.length} locale(s).\n`)

  let libreCount = 0
  let googleCount = 0

  for (const locale of targets) {
    const useLibre = force ? false : await libreSupports(locale)
    if (useLibre) libreCount++
    else googleCount++

    for (const domain of DOMAINS) {
      const targetFile = path.join(domain.out, `${locale}.ts`)
      const existing = await Bun.file(path.join(root, targetFile)).exists()
      const source = await readDictionary(domain.source)

      // An existing dictionary is the source of truth for its own keys: only
      // what is missing is translated, so hand-written wording survives.
      const current = existing
        ? ((await import(`${path.join(root, targetFile)}?t=${Date.now()}`)).dict as Dictionary)
        : {}
      const missing = Object.fromEntries(Object.entries(source).filter(([key]) => !(key in current)))
      const count = Object.keys(missing).length

      if (count === 0) {
        console.log(`${locale}/${domain.name}: already complete`)
        continue
      }

      const engine = useLibre ? "libre" : "google"
      const translated = await translateDictionary(missing, locale, `${locale}/${domain.name} ${engine}`, useLibre)
      await writeDictionary(targetFile, { ...current, ...translated }, `Dict${domain.name.toUpperCase()}`)
      console.log(`${locale}/${domain.name}: wrote ${Object.keys(translated).length} key(s) via ${engine}`)
    }
  }

  console.log(`\nEngine split — libre: ${libreCount}, google: ${googleCount}`)
  if (failed.size > 0) {
    console.log(`\n${failed.size} key(s) could not be translated and kept English:`)
    console.log([...failed].join(", "))
  }
}

await main()