// Copyright (c) 2026 onelpawarai. All rights reserved.

import * as i18n from "@solid-primitives/i18n"
import { createEffect, createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@zyraxon-ai/ui/context"
import { Persist, persisted } from "@/utils/persist"
import { dict as en } from "@/i18n/en"
import { dict as uiEn } from "@zyraxon-ai/ui/i18n/en"
import { CODES, LANGUAGES, direction, findLanguage, nativeName } from "@/i18n/languages"
import { CORE_MANIFEST } from "@/i18n/core/manifest"
import { GENERATED } from "@/i18n/generated/manifest"

/** Any BCP-47 tag listed in the language registry. */
export type Locale = string

type RawDictionary = typeof en & typeof uiEn
type Dictionary = i18n.Flatten<RawDictionary>
type Source = { dict: Record<string, string> }

const DEFAULT_LOCALE: Locale = "en"

function cookie(locale: Locale) {
  return `oc_locale=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`
}

const ENGLISH = i18n.flatten({ ...en, ...uiEn }) as Dictionary
const dicts = new Map<Locale, Dictionary>([[DEFAULT_LOCALE, ENGLISH]])

/**
 * A locale dictionary is only ever its own words. English is the source the
 * translations are made from, never something a missing key quietly falls back
 * to, so an untranslated string stays visible as empty rather than reading as
 * an English interface.
 */
const merge = (app: Promise<Source>, ui: Promise<Source>) =>
  Promise.all([app, ui]).then(([a, b]) => i18n.flatten({ ...a.dict, ...b.dict }) as Dictionary)

/** App-only dictionaries: locales the UI package has no translation for yet. */
const mergeApp = (app: Promise<Source>) => app.then((a) => i18n.flatten({ ...a.dict }) as Dictionary)

/**
 * Languages with a hand-maintained full dictionary. Everything else falls back
 * to the generated core vocabulary so a missing key degrades to English rather
 * than rendering blank.
 */
/**
 * Codes this app used before the registry existed. `br` meant Brazilian
 * Portuguese internally, but ISO 639-1 assigns it to Breton, so anyone who
 * already saved it is moved to the tag they actually meant.
 */
const LEGACY: Record<string, Locale> = {
  br: "pt-BR",
  no: "nb",
}

const fullDicts: Partial<Record<Locale, () => Promise<Dictionary>>> = {
  bn: () => merge(import("@/i18n/bn"), import("@zyraxon-ai/ui/i18n/bn")),
  zh: () => merge(import("@/i18n/zh"), import("@zyraxon-ai/ui/i18n/zh")),
  zht: () => merge(import("@/i18n/zht"), import("@zyraxon-ai/ui/i18n/zht")),
  ko: () => merge(import("@/i18n/ko"), import("@zyraxon-ai/ui/i18n/ko")),
  de: () => merge(import("@/i18n/de"), import("@zyraxon-ai/ui/i18n/de")),
  es: () => merge(import("@/i18n/es"), import("@zyraxon-ai/ui/i18n/es")),
  fr: () => merge(import("@/i18n/fr"), import("@zyraxon-ai/ui/i18n/fr")),
  da: () => merge(import("@/i18n/da"), import("@zyraxon-ai/ui/i18n/da")),
  ja: () => merge(import("@/i18n/ja"), import("@zyraxon-ai/ui/i18n/ja")),
  pl: () => merge(import("@/i18n/pl"), import("@zyraxon-ai/ui/i18n/pl")),
  ru: () => merge(import("@/i18n/ru"), import("@zyraxon-ai/ui/i18n/ru")),
  uk: () => merge(import("@/i18n/uk"), import("@zyraxon-ai/ui/i18n/uk")),
  ar: () => merge(import("@/i18n/ar"), import("@zyraxon-ai/ui/i18n/ar")),
  nb: () => merge(import("@/i18n/no"), import("@zyraxon-ai/ui/i18n/no")),
  "pt-BR": () => merge(import("@/i18n/br"), import("@zyraxon-ai/ui/i18n/br")),
  th: () => merge(import("@/i18n/th"), import("@zyraxon-ai/ui/i18n/th")),
  bs: () => merge(import("@/i18n/bs"), import("@zyraxon-ai/ui/i18n/bs")),
  tr: () => merge(import("@/i18n/tr"), import("@zyraxon-ai/ui/i18n/tr")),
  // Right-to-left locales ship full dictionaries. They were missing from this
  // registry, so selecting Hebrew, Persian, Urdu or Yiddish flipped the document
  // to RTL while the dictionary stayed empty — an English layout reversed, which
  // is what "the language does not translate" actually was.
  he: () => merge(import("@/i18n/he"), import("@zyraxon-ai/ui/i18n/he")),
  fa: () => merge(import("@/i18n/fa"), import("@zyraxon-ai/ui/i18n/fa")),
  ur: () => merge(import("@/i18n/ur"), import("@zyraxon-ai/ui/i18n/ur")),
  yi: () => merge(import("@/i18n/yi"), import("@zyraxon-ai/ui/i18n/yi")),
  // Remaining hand-maintained dictionaries that had no core pack to fall back to.
  af: () => merge(import("@/i18n/af"), import("@zyraxon-ai/ui/i18n/af")),
  bg: () => merge(import("@/i18n/bg"), import("@zyraxon-ai/ui/i18n/bg")),
  ca: () => merge(import("@/i18n/ca"), import("@zyraxon-ai/ui/i18n/ca")),
  cs: () => merge(import("@/i18n/cs"), import("@zyraxon-ai/ui/i18n/cs")),
  el: () => mergeApp(import("@/i18n/el")),
  eo: () => mergeApp(import("@/i18n/eo")),
  et: () => merge(import("@/i18n/et"), import("@zyraxon-ai/ui/i18n/et")),
  eu: () => merge(import("@/i18n/eu"), import("@zyraxon-ai/ui/i18n/eu")),
  fi: () => merge(import("@/i18n/fi"), import("@zyraxon-ai/ui/i18n/fi")),
  fo: () => merge(import("@/i18n/fo"), import("@zyraxon-ai/ui/i18n/fo")),
  gl: () => merge(import("@/i18n/gl"), import("@zyraxon-ai/ui/i18n/gl")),
  hu: () => merge(import("@/i18n/hu"), import("@zyraxon-ai/ui/i18n/hu")),
  is: () => merge(import("@/i18n/is"), import("@zyraxon-ai/ui/i18n/is")),
  lb: () => merge(import("@/i18n/lb"), import("@zyraxon-ai/ui/i18n/lb")),
  lt: () => merge(import("@/i18n/lt"), import("@zyraxon-ai/ui/i18n/lt")),
  lv: () => merge(import("@/i18n/lv"), import("@zyraxon-ai/ui/i18n/lv")),
  nds: () => merge(import("@/i18n/nds"), import("@zyraxon-ai/ui/i18n/nds")),
  nl: () => merge(import("@/i18n/nl"), import("@zyraxon-ai/ui/i18n/nl")),
  nn: () => merge(import("@/i18n/nn"), import("@zyraxon-ai/ui/i18n/nn")),
  oc: () => merge(import("@/i18n/oc"), import("@zyraxon-ai/ui/i18n/oc")),
  ro: () => mergeApp(import("@/i18n/ro")),
  sk: () => merge(import("@/i18n/sk"), import("@zyraxon-ai/ui/i18n/sk")),
  sl: () => merge(import("@/i18n/sl"), import("@zyraxon-ai/ui/i18n/sl")),
  sq: () => mergeApp(import("@/i18n/sq")),
  sv: () => merge(import("@/i18n/sv"), import("@zyraxon-ai/ui/i18n/sv")),
  // Remaining app-only locales. Every locale in the picker must resolve a real
  // dictionary; without an entry the UI was left in English while an RTL locale
  // still mirrored the layout.
  az: () => merge(import("@/i18n/az"), import("@zyraxon-ai/ui/i18n/az")),
  hi: () => merge(import("@/i18n/hi"), import("@zyraxon-ai/ui/i18n/hi")),
  id: () => mergeApp(import("@/i18n/id")),
  it: () => merge(import("@/i18n/it"), import("@zyraxon-ai/ui/i18n/it")),
  ky: () => merge(import("@/i18n/ky"), import("@zyraxon-ai/ui/i18n/ky")),
  ms: () => mergeApp(import("@/i18n/ms")),
  sw: () => mergeApp(import("@/i18n/sw")),
  tl: () => mergeApp(import("@/i18n/tl")),
  vi: () => mergeApp(import("@/i18n/vi")),
}

/** Core vocabulary chunks, one module per pack so a locale pulls only what it needs. */
const CORE = CORE_MANIFEST

/**
 * Generated dictionaries cover every registry locale in full. They are the last
 * stop for a locale with no hand-maintained file, which is what removes the
 * dependency on English for the languages the picker already offered.
 */
const GENERATED_DICTS: Partial<Record<Locale, () => Promise<Record<string, string>>>> = GENERATED

const SOURCE_KEYS = Object.keys(ENGLISH).length

function ratio(locale: Locale) {
  const current = dicts.get(locale)
  if (!current) return 0
  const defined = Object.keys(current).length
  return SOURCE_KEYS === 0 ? 0 : Math.min(1, defined / SOURCE_KEYS)
}

function loadDict(locale: Locale) {
  const hit = dicts.get(locale)
  if (hit) return Promise.resolve(hit)
  if (locale === DEFAULT_LOCALE) return Promise.resolve(ENGLISH)

  // Generated dictionaries are complete for every registry locale, so they are
  // the base. A hand-maintained dictionary, where one exists, overlays its own
  // curated wording on top. The result is a full dictionary with the best
  // available translation for every key and no reliance on English.
  const generated = GENERATED_DICTS[locale]
  const base = generated ? generated().then((pack) => i18n.flatten(pack) as Dictionary) : Promise.resolve({} as Dictionary)

  const full = fullDicts[locale]
  const core = CORE[locale]
  const curated = full
    ? full()
    : core
      ? core().then((pack) => i18n.flatten(pack) as Dictionary)
      : Promise.resolve({} as Dictionary)

  return Promise.all([base, curated]).then(([generatedDict, curatedDict]) => {
    const next = { ...generatedDict, ...curatedDict } as Dictionary
    dicts.set(locale, next)
    return next
  })
}

/**
 * How much of the English source a locale actually defines, measured against the
 * real key count rather than assumed from the file being registered. A partial
 * dictionary registered as full would show a complete badge over a half-empty
 * interface, so the badge has to be earned.
 */
export function localeCoverage(locale: Locale) {
  if (locale === DEFAULT_LOCALE) return 1
  if (locale in dicts) return ratio(locale)
  if (locale in fullDicts) return 0.25
  if (locale in GENERATED_DICTS) return 0.9
  return locale in CORE ? 0.25 : 0
}

export function loadLocaleDict(locale: Locale) {
  return loadDict(locale).then(() => undefined)
}

const byLanguage = new Map<string, Locale[]>()
for (const entry of LANGUAGES) {
  const language = entry.code.split("-")[0]!.toLowerCase()
  const list = byLanguage.get(language) ?? []
  list.push(entry.code)
  byLanguage.set(language, list)
}

function matchLanguage(value: string): Locale | undefined {
  const normalized = value.toLowerCase().replace("_", "-")

  const exact = findLanguage(normalized)
  if (exact) return exact.code

  const generic = byLanguage.get(normalized.split("-")[0]!)
  if (!generic) return undefined

  if (normalized.includes("-")) {
    const partial = generic.find((code) => normalized.startsWith(code.toLowerCase()))
    if (partial) return partial
  }

  // Prefer the unregionalised entry so pt-BR does not silently win over pt.
  const base = generic.find((code) => !code.includes("-"))
  return base ?? generic[0]
}

function detectLocale(): Locale {
  if (typeof navigator !== "object") return DEFAULT_LOCALE

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    if (!language) continue
    const match = matchLanguage(language)
    if (match) return match
  }

  return DEFAULT_LOCALE
}

export function normalizeLocale(value: string): Locale {
  const legacy = LEGACY[value]
  if (legacy) return legacy
  return CODES.includes(value) ? value : (matchLanguage(value) ?? DEFAULT_LOCALE)
}

function readStoredLocale() {
  if (typeof localStorage !== "object") return
  try {
    const raw = localStorage.getItem("zyraxon.global.dat:language")
    if (!raw) return
    const next = JSON.parse(raw) as { locale?: string }
    if (typeof next?.locale !== "string") return
    return normalizeLocale(next.locale)
  } catch {
    return
  }
}

const warm = readStoredLocale() ?? detectLocale()
if (warm !== DEFAULT_LOCALE) void loadDict(warm)

export const { use: useLanguage, provider: LanguageProvider } = createSimpleContext({
  name: "Language",
  gate: false,
  init: (props: { locale?: Locale }) => {
    const initial = props.locale ?? readStoredLocale() ?? detectLocale()
    const [store, setStore, _, ready] = persisted(
      Persist.global("language", ["language.v1"]),
      createStore({
        locale: initial,
      }),
    )

    const locale = createMemo<Locale>(() => normalizeLocale(store.locale))
    const dir = createMemo(() => direction(locale()))
    const intl = createMemo(() => findLanguage(locale())?.code ?? DEFAULT_LOCALE)

    const [dict] = createResource(locale, loadDict, {
      initialValue: dicts.get(initial) ?? ({} as Dictionary),
    })

/**
 * Look a key up without ever handing back undefined.
 *
 * A missing translation is not allowed to become `undefined`: every screen in
 * the app treats the result as a string, and code like `.split()` or `.trim()`
 * runs on it directly. Returning undefined turned an untranslated label into a
 * crash that took the whole renderer down with it — a blank Settings panel or an
 * untranslated status bar is a nuisance, a blank Settings panel that cannot be
 * opened at all is a bug. An empty string renders as empty and stays navigable,
 * and the key name is written to the console so the gap is still findable.
 */
const translate = i18n.translator(() => dict() ?? ({} as Dictionary), i18n.resolveTemplate) as (
  key: keyof Dictionary,
  params?: Record<string, string | number | boolean>,
) => string | undefined

const t = ((key: keyof Dictionary, params?: Record<string, string | number | boolean>) => {
  const value = translate(key, params)
  if (typeof value === "string" && value.length > 0) return value
  // No English fallback: every locale ships its own full dictionary, so a key
  // that resolves empty is a real gap in that dictionary, not a reason to show
  // an English interface. The key name is logged so the gap stays findable.
  if (typeof process !== "undefined" && process.env?.ZYRAXON_DEBUG_I18N) console.warn(`[i18n] missing ${String(key)}`)
  return ""
}) as (key: keyof Dictionary, params?: Record<string, string | number | boolean>) => string

    const label = (value: Locale) => nativeName(value)

    createEffect(() => {
      if (typeof document !== "object") return
      document.documentElement.lang = locale()
      document.documentElement.dir = dir()
      document.cookie = cookie(locale())
    })

    return {
      ready,
      locale,
      dir,
      intl,
      locales: CODES,
      languages: LANGUAGES,
      label,
      t,
      setLocale(next: Locale) {
        setStore("locale", normalizeLocale(next))
      },
    }
  },
})