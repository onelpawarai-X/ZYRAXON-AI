// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { realTranslations } from "@/i18n/overlay"

describe("locale overlay (renderer)", () => {
  test("an English placeholder does not hide the generated translation", () => {
    const source = { "command.category.settings": "Settings" }
    const curated = { "command.category.settings": "Settings" }
    expect(realTranslations(curated, source)).toEqual({})
  })

  test("a curated string that differs from English is kept", () => {
    const source = { "command.category.settings": "Settings" }
    const curated = { "command.category.settings": "Nastavení" }
    expect(realTranslations(curated, source)).toEqual({ "command.category.settings": "Nastavení" })
  })

  test("keys with no English counterpart are kept", () => {
    const source = { "a.b": "A" }
    const curated = { "c.d": "Ce" }
    expect(realTranslations(curated, source)).toEqual({ "c.d": "Ce" })
  })

  test("a mixed dictionary keeps only the real translations", () => {
    const source = { "a": "A", "b": "B", "c": "C" }
    const curated = { a: "A", b: "Bb", c: "C" }
    expect(realTranslations(curated, source)).toEqual({ b: "Bb" })
  })
})
