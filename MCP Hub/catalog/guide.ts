// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * The setup guide for every app, in every language the panel offers.
 *
 * The guide is the document. It is written so that somebody who never opens the
 * vendor's documentation can still connect: what kind of sign-in this app wants,
 * where the credential comes from, what to paste, what the browser will ask for,
 * and what to do when it refuses. The vendor's own link is offered alongside it
 * for the apps that publish one, but nothing in here depends on following it.
 *
 * Every language except English is machine-translated at build time by
 * scripts/build-guide-text.ts and frozen into guide-text.ts. Nothing is
 * translated at runtime, so the guide reads the same offline as online, and a
 * language switch is instant. English lives here as the source text; if a
 * translation is ever missing, the English line is shown rather than a hole.
 */

import { docsByApp, type AppEntry } from "./seed"
import { APP_TEXT, TRANSLATIONS } from "./guide-text"

/** The redirect URL every OAuth client in this catalog must be registered with. */
export const REDIRECT = "http://127.0.0.1:19876/oauth/callback"

export interface Language {
  /** BCP-47 code, also the key into the translation tables */
  code: string
  /** the language's own name for itself, which is what a speaker looks for */
  native: string
  /** English name, for somebody who cannot read the native one */
  english: string
}

/**
 * The languages on offer.
 *
 * Chosen to cover the scripts and regions people actually use rather than a
 * token handful: every official UN language, the languages of South and
 * Southeast Asia, the major European ones, and a spread across Africa.
 */
export const LANGUAGES: Language[] = [
  { code: "en", native: "English", english: "English" },
  { code: "bn", native: "বাংলা", english: "Bengali" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "ur", native: "اردو", english: "Urdu" },
  { code: "ne", native: "नेपाली", english: "Nepali" },
  { code: "si", native: "සිංහල", english: "Sinhala" },
  { code: "ar", native: "العربية", english: "Arabic" },
  { code: "fa", native: "فارسی", english: "Persian" },
  { code: "ps", native: "پښتو", english: "Pashto" },
  { code: "ku", native: "کوردی", english: "Kurdish" },
  { code: "tr", native: "Türkçe", english: "Turkish" },
  { code: "az", native: "Azərbaycanca", english: "Azerbaijani" },
  { code: "kk", native: "Қазақша", english: "Kazakh" },
  { code: "uz", native: "Oʻzbekcha", english: "Uzbek" },
  { code: "mn", native: "Монгол", english: "Mongolian" },
  { code: "ru", native: "Русский", english: "Russian" },
  { code: "uk", native: "Українська", english: "Ukrainian" },
  { code: "pl", native: "Polski", english: "Polish" },
  { code: "cs", native: "Čeština", english: "Czech" },
  { code: "sk", native: "Slovenčina", english: "Slovak" },
  { code: "hu", native: "Magyar", english: "Hungarian" },
  { code: "ro", native: "Română", english: "Romanian" },
  { code: "bg", native: "Български", english: "Bulgarian" },
  { code: "sr", native: "Српски", english: "Serbian" },
  { code: "hr", native: "Hrvatski", english: "Croatian" },
  { code: "sl", native: "Slovenščina", english: "Slovenian" },
  { code: "el", native: "Ελληνικά", english: "Greek" },
  { code: "he", native: "עברית", english: "Hebrew" },
  { code: "de", native: "Deutsch", english: "German" },
  { code: "nl", native: "Nederlands", english: "Dutch" },
  { code: "af", native: "Afrikaans", english: "Afrikaans" },
  { code: "da", native: "Dansk", english: "Danish" },
  { code: "no", native: "Norsk", english: "Norwegian" },
  { code: "sv", native: "Svenska", english: "Swedish" },
  { code: "fi", native: "Suomi", english: "Finnish" },
  { code: "et", native: "Eesti", english: "Estonian" },
  { code: "lt", native: "Lietuvių", english: "Lithuanian" },
  { code: "lv", native: "Latviešu", english: "Latvian" },
  { code: "fr", native: "Français", english: "French" },
  { code: "es", native: "Español", english: "Spanish" },
  { code: "pt", native: "Português", english: "Portuguese" },
  { code: "ca", native: "Català", english: "Catalan" },
  { code: "it", native: "Italiano", english: "Italian" },
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese" },
  { code: "th", native: "ไทย", english: "Thai" },
  { code: "lo", native: "ລາວ", english: "Lao" },
  { code: "km", native: "ភាសាខ្មែរ", english: "Khmer" },
  { code: "my", native: "မြန်မာ", english: "Burmese" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian" },
  { code: "ms", native: "Bahasa Melayu", english: "Malay" },
  { code: "tl", native: "Filipino", english: "Filipino" },
  { code: "zh-CN", native: "中文（简体）", english: "Chinese (Simplified)" },
  { code: "zh-TW", native: "中文（繁體）", english: "Chinese (Traditional)" },
  { code: "ja", native: "日本語", english: "Japanese" },
  { code: "ko", native: "한국어", english: "Korean" },
  { code: "sw", native: "Kiswahili", english: "Swahili" },
  { code: "ha", native: "Hausa", english: "Hausa" },
  { code: "yo", native: "Yorùbá", english: "Yoruba" },
  { code: "am", native: "አማርኛ", english: "Amharic" },
  { code: "so", native: "Soomaali", english: "Somali" },
  { code: "zu", native: "isiZulu", english: "Zulu" },
]

/**
 * The English source text. Every line a translation is keyed against lives here.
 *
 * The {braces} are filled in per app by the composer below, so one sentence
 * serves all 108 apps and a correction to the wording lands everywhere at once.
 */
export const templates = {
  // headings and small labels
  title: "Setup guide",
  language: "Language",
  docs: "Documentation",
  endpoint: "Endpoint",
  endpointLocal: "runs on this machine",
  howto: "How to connect",
  scopes: "Scopes requested",
  oauthClient: "OAuth client ID",
  goodToKnow: "Good to know",
  close: "Close",
  cancel: "Cancel",
  openConsole: "Open console",
  generateLink: "Generate sign-in link",
  generating: "Generating…",
  pasteClientId: "Paste client ID",
  pasteSecret: "Client secret (only if the console showed one)",
  oauthHelp:
    "This vendor only accepts clients it issued itself. Create one at {console}, using exactly {redirect} as the redirect URL, then paste it here.",

  // offered documentation, or the honest statement that there is none
  hasDocs:
    "Official documentation is linked below. The steps here work on their own — use the link only if you want the vendor's full reference.",
  noDocs:
    "This app publishes no documentation link of its own, so everything you need is written right here.",

  // a vendor's own button-by-button list sits below the guide
  seeSteps: "The exact buttons to press are in the numbered list below.",

  // kind: nothing to sign in to
  none1: "{name} needs no sign-in, no key, and no account. The server answers anyone who asks.",
  none2:
    "Press Connect. The handshake happens in the background and the app's tools become available to the agent straight away.",
  none3: "Nothing to fill in. Disconnect removes it again; Connect brings it back.",
  noneTrouble:
    "If the first connection fails, press Disconnect and then Connect once more — this endpoint answers without any credential, so nothing else is missing.",

  // kind: runs on this machine
  local1: "{name} runs on your own machine — no account, no key, no token.",
  local2: "Press Connect and ZYRAXON starts it for you. It listens only on this computer.",
  local3: "It is started with: {command}",
  localTrouble:
    "If it does not come up, something else is already using its port — close that program and press Connect again.",

  // kind: a pasted key
  token1:
    "You need one access key. That is the only thing standing between you and this server.",
  tokenUrl: "Make a key here: {tokenUrl} — sign in, create one, and copy it.",
  tokenConsole: "Make a key in the vendor's own dashboard: {consoleUrl}.",
  tokenFind:
    "Sign in to the vendor's dashboard and look for an API key — it is usually under Account → API keys.",
  token2: "Paste the key into the box on this card and press Connect.",
  token3:
    "The server is asked straight away whether the key is good, so a wrong or expired key is reported at once and you can fix it in the same place.",
  token4: "The key stays on this machine and is sent only to {name}.",
  tokenTrouble:
    "Refused anyway? Make a fresh key — keys expire, and changing a password often revokes the old one.",

  // kind: one-click browser sign-in
  oc1: "One click and you are signed in — there is nothing to type.",
  oc2:
    "Press Connect. The sign-in page opens in your browser; sign in if it asks, press Allow, and this card turns connected.",
  oc3:
    "The first time, the vendor asks whether ZYRAXON may talk to your account. Allow it and you are done — next time it remembers you.",
  ocTrouble:
    "Turned away at the sign-in page? The server and ZYRAXON must agree on the redirect address {redirect}; the vendor's MCP documentation states the one it expects.",

  // kind: one-time client ID setup
  ci1: "{name} only accepts client IDs it issued itself, so there is a one-time setup.",
  ci2: "Open {console} and create an application. Use exactly {redirect} as the redirect URL.",
  ci3: "Ask for these permissions while creating it: {scope}",
  ci4:
    "Copy the Client ID — and the client secret, if the console shows one — into the boxes on this card, then press Connect.",
  ci5:
    "The browser opens the sign-in page; press Allow and the card turns connected. From then on, reconnecting is a single click.",
  ciTrouble:
    "Refused after signing in? The saved redirect URL is the usual cause: it must be exactly {redirect}.",

  // the numbered "How to connect" list under the guide
  howNone: "Nothing to do. Press Connect and the tools are usable straight away.",
  howLocal: "It ships with ZYRAXON and starts on its own. Press Connect to wake it.",
  howToken: "Paste your access key into the box and press Connect. The server checks it immediately.",
  howOAuth:
    "Press Connect. A sign-in page opens in your browser; approve it there and this card turns connected.",

  // closing line, shown for every kind
  done: "A connected card stays green until you press Disconnect.",
} as const

export type TemplateKey = keyof typeof templates

/**
 * Pick the language the guide should open in.
 *
 * The panel's own language is English, so English is only the answer when the
 * browser offers nothing better — a Bengali browser gets Bengali, a Japanese
 * one gets Japanese, and anything unmatched falls back to English rather than
 * to a language the reader cannot read.
 */
export function detectLanguage(): string {
  const offered = new Set(LANGUAGES.map((lang) => lang.code))
  const candidates = typeof navigator === "undefined" ? [] : [navigator.language, ...(navigator.languages ?? [])]
  for (const candidate of candidates) {
    if (offered.has(candidate)) return candidate
    const base = candidate.split("-")[0]
    const match = LANGUAGES.find((lang) => lang.code.split("-")[0] === base)
    if (match) return match.code
  }
  return "en"
}

function template(lang: string, key: TemplateKey): string {
  return TRANSLATIONS[lang]?.[key] ?? templates[key]
}

function fill(text: string, fills: Record<string, string>): string {
  return Object.entries(fills).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, value), text)
}

/** One translated sentence, with the app's own details put in place. */
export function line(lang: string, key: TemplateKey, fills: Record<string, string> = {}): string {
  return fill(template(lang, key), fills)
}

/**
 * A piece of the catalog written by hand — a vendor's step, or a note about one
 * — rendered in the reader's language.
 *
 * These are keyed by their English text rather than by position, so adding an
 * app to the catalog cannot shift a translation onto the wrong app. Anything
 * that has never been translated comes back in English, which is always better
 * than a blank.
 */
export function catalogText(text: string, lang: string): string {
  return APP_TEXT[lang]?.[text] ?? text
}

/** The documentation link this server publishes, if it publishes one. */
export function docsFor(app: AppEntry): string | undefined {
  return docsByApp[app.id]
}

/**
 * The guide itself: what this app is, where its credential comes from, what to
 * do with it, and what to try when it says no.
 *
 * Written per kind because that is what actually differs — 26 apps need nothing
 * at all, 12 want a pasted key, 65 sign in through the browser of which 16 need
 * a client ID first, and 5 run on this machine. The reader gets their own
 * situation, not a paragraph that hedges between all of them.
 */
export function guideFor(app: AppEntry, lang = "en"): string[] {
  const named = (key: TemplateKey, fills: Record<string, string> = {}) => line(lang, key, { name: app.name, ...fills })
  const steps = app.steps?.length ? [named("seeSteps")] : []
  const head = [line(lang, docsFor(app) ? "hasDocs" : "noDocs")]

  if (app.kind === "none")
    return [...head, named("none1"), named("none2"), named("none3"), named("noneTrouble"), ...steps, line(lang, "done")]

  if (app.kind === "local")
    return [
      ...head,
      named("local1"),
      named("local2"),
      ...(app.command?.command ? [named("local3", { command: app.command.command })] : []),
      named("localTrouble"),
      ...steps,
      line(lang, "done"),
    ]

  if (app.kind === "token")
    return [
      ...head,
      named("token1"),
      app.tokenUrl
        ? named("tokenUrl", { tokenUrl: app.tokenUrl })
        : app.consoleUrl
          ? named("tokenConsole", { consoleUrl: app.consoleUrl })
          : named("tokenFind"),
      named("token2"),
      named("token3"),
      named("token4"),
      named("tokenTrouble"),
      ...steps,
      line(lang, "done"),
    ]

  if (app.consoleUrl)
    return [
      ...head,
      named("ci1", { console: app.consoleUrl }),
      named("ci2", { console: app.consoleUrl, redirect: REDIRECT }),
      ...(app.scope ? [named("ci3", { scope: app.scope })] : []),
      named("ci4"),
      named("ci5"),
      named("ciTrouble", { redirect: REDIRECT }),
      ...steps,
      line(lang, "done"),
    ]

  return [
    ...head,
    named("oc1"),
    named("oc2"),
    named("oc3"),
    named("ocTrouble", { redirect: REDIRECT }),
    ...steps,
    line(lang, "done"),
  ]
}
