// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * A hand-maintained dictionary may be an English placeholder rather than real
 * wording. Letting it win would hide the generated translation behind the source
 * language, so only curated entries that actually differ from the English source
 * are kept as an overlay.
 */
export function realTranslations(curated: Record<string, string>, source: Record<string, string>) {
  return Object.fromEntries(Object.entries(curated).filter(([key, value]) => value !== source[key]))
}
