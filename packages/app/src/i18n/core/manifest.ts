// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Core vocabulary is what a user actually sees on every screen: navigation,
 * buttons, settings tabs, status words and the common dialog chrome. A locale
 * with a core pack renders entirely in its own language; anything the pack does
 * not cover falls back to English rather than showing a raw key.
 *
 * Packs are grouped by region so a locale loads one chunk instead of the whole
 * set. Only locales present in the referenced pack appear here, which is what
 * `localeCoverage` reports on.
 */
export type CorePack = Record<string, Record<string, string>>

const loader = (path: () => Promise<{ pack: CorePack }>, codes: string[]) =>
  Object.fromEntries(codes.map((code) => [code, () => path().then((module) => module.pack[code] ?? {})]))

export const CORE_MANIFEST: Record<string, () => Promise<Record<string, string>>> = {
  ...loader(() => import("./packs/south-asia"), ["bn", "bn-IN", "hi"]),
  ...loader(() => import("./packs/east-asia"), ["zh", "ja", "ko"]),
  ...loader(() => import("./packs/southeast-asia"), ["vi", "id", "ms", "tl", "th"]),
  ...loader(() => import("./packs/europe"), ["de", "fr", "es", "it", "ru"]),
  ...loader(() => import("./packs/turkic-caucasian"), ["az", "kk", "uz", "ky", "tr"]),
  ...loader(() => import("./packs/middle-east"), ["ar"]),
  ...loader(() => import("./packs/africa"), ["sw", "ha", "yo"]),
  ...loader(() => import("./packs/americas-pacific"), ["pt-BR", "pt", "mri", "ht"]),
}