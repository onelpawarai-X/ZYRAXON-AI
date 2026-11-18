// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { defaultModelIDs } from "../src/provider/provider"

// The /provider endpoint crashed with
// "undefined is not an object (evaluating 'sort(...)[0].id')" whenever any
// provider reported no models, which the app surfaced as an empty provider
// list. These cases pin the empty and partial shapes that triggered it.
describe("defaultModelIDs", () => {
  test("returns the best model for a provider that has models", () => {
    const result = defaultModelIDs({
      openai: { models: { a: { id: "gpt-4o" }, b: { id: "gpt-5" } } },
    })
    expect(result).toEqual({ openai: "gpt-5" })
  })

  test("skips a provider with no models instead of throwing", () => {
    const result = defaultModelIDs({
      empty: { models: {} },
      openai: { models: { a: { id: "gpt-5" } } },
    })
    expect(result).toEqual({ openai: "gpt-5" })
    expect("empty" in result).toBe(false)
  })

  test("returns an empty map when every provider is empty", () => {
    expect(defaultModelIDs({ a: { models: {} }, b: { models: {} } })).toEqual({})
  })

  test("returns an empty map for no providers", () => {
    expect(defaultModelIDs({})).toEqual({})
  })
})
