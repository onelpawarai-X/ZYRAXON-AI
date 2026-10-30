// Copyright (c) 2026 onelpawarai. All rights reserved.

// AI Generate must offer what the main chat offers. The regression this guards
// against: the editor listed only the opencode/zyraxon free models, so a model
// from a provider the user had connected never appeared in the selector and
// could not be used, even though the main composer offered it.

import { describe, expect, test } from "bun:test"
import { isFreeModel, offeredModels, optionLabel, optionValue, type CatalogModel } from "./ai-generate-models"

const opencodeFree: CatalogModel = {
  id: "claude-3.5-haiku",
  name: "Claude 3.5 Haiku",
  provider: { id: "opencode" },
  cost: { input: 0 },
}

const opencodePaid: CatalogModel = {
  id: "claude-4-opus",
  name: "Claude 4 Opus",
  provider: { id: "opencode" },
  cost: { input: 15 },
}

const connectedAnthropic: CatalogModel = {
  id: "claude-sonnet-4-5",
  name: "Claude Sonnet 4.5",
  provider: { id: "anthropic" },
  cost: { input: 3 },
}

const connectedOpenAI: CatalogModel = {
  id: "gpt-5",
  name: "GPT-5",
  provider: { id: "openai" },
  cost: { input: 5 },
}

const allVisible = () => true

describe("AI Generate model list", () => {
  test("a connected provider's models are offered, not just the free gateways", () => {
    const offered = offeredModels([opencodeFree, connectedAnthropic, connectedOpenAI], allVisible)
    const providers = offered.map((m) => m.provider.id)
    expect(providers).toContain("anthropic")
    expect(providers).toContain("openai")
  })

  test("the offered list is exactly what the catalog exposes, with nothing dropped", () => {
    const catalog = [opencodeFree, opencodePaid, connectedAnthropic, connectedOpenAI]
    expect(offeredModels(catalog, allVisible)).toEqual(catalog)
  })

  test("a hidden model is not offered, matching the composer's visible()", () => {
    const hidden = connectedOpenAI
    const offered = offeredModels([opencodeFree, connectedAnthropic, hidden], (key) => key.modelID !== hidden.id)
    expect(offered).not.toContain(hidden)
    expect(offered).toContain(connectedAnthropic)
  })

  test("option values are the providerID/modelID the bridge routes on", () => {
    expect(optionValue(connectedAnthropic)).toBe("anthropic/claude-sonnet-4-5")
  })

  test("a connected provider's paid model keeps its plain name", () => {
    expect(optionLabel(connectedAnthropic)).toBe("Claude Sonnet 4.5")
  })

  test("only the zero-cost gateways are tagged free", () => {
    expect(isFreeModel("opencode", { input: 0 })).toBe(true)
    expect(isFreeModel("zyraxon", undefined)).toBe(true)
    expect(isFreeModel("opencode", { input: 15 })).toBe(false)
    expect(isFreeModel("anthropic", { input: 0 })).toBe(false)
  })

  test("a free gateway model is labelled free in the list", () => {
    expect(optionLabel(opencodeFree)).toBe("Claude 3.5 Haiku (free)")
  })
})
