// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import {
  ZYRAXON_MODEL_PRIORITY,
  ZYRAXON_PROVIDER_ID,
  isFailoverWorthy,
  shouldFailover,
  zyraxonFailoverChain,
  zyraxonModelRank,
} from "../src/provider/zyraxon-failover"

describe("ZYRAXON_MODEL_PRIORITY", () => {
  test("lists every ZYRAXON model exactly once", () => {
    expect(ZYRAXON_MODEL_PRIORITY).toHaveLength(10)
    expect(new Set(ZYRAXON_MODEL_PRIORITY).size).toBe(10)
    for (const id of ZYRAXON_MODEL_PRIORITY) expect(id.startsWith("zyraxon-")).toBe(true)
  })

  test("is ordered fastest first, measured against the live endpoint", () => {
    // These two are the measured extremes; a regression that reversed the list
    // would put the 14s model ahead of the 0.35s one on every request.
    expect(ZYRAXON_MODEL_PRIORITY[0]).toBe("zyraxon-apex")
    expect(ZYRAXON_MODEL_PRIORITY.at(-1)).toBe("zyraxon-visionary")
    expect(zyraxonModelRank("zyraxon-apex")).toBeLessThan(zyraxonModelRank("zyraxon-visionary"))
  })
})

describe("zyraxonFailoverChain", () => {
  test("tries the chosen model first so a healthy pick is never delayed", () => {
    const chain = zyraxonFailoverChain(ZYRAXON_PROVIDER_ID, "zyraxon-pulse")
    expect(chain[0]).toBe("zyraxon-pulse")
  })

  test("covers every other model in measured order, with no duplicates", () => {
    const chain = zyraxonFailoverChain(ZYRAXON_PROVIDER_ID, "zyraxon-pulse")
    expect(chain).toHaveLength(10)
    expect(new Set(chain).size).toBe(10)
    // Everything after the chosen model is the priority list minus that model.
    expect(chain.slice(1)).toEqual(ZYRAXON_MODEL_PRIORITY.filter((id) => id !== "zyraxon-pulse"))
  })

  test("the slowest model still falls back to the fastest", () => {
    const chain = zyraxonFailoverChain(ZYRAXON_PROVIDER_ID, "zyraxon-visionary")
    expect(chain[0]).toBe("zyraxon-visionary")
    expect(chain[1]).toBe("zyraxon-apex")
  })

  test("leaves every other provider exactly as the user chose it", () => {
    // Swapping a paid provider's model behind the user's back would misreport
    // what answered, so failover is deliberately ZYRAXON-only.
    expect(zyraxonFailoverChain("anthropic", "claude-sonnet-4")).toEqual(["claude-sonnet-4"])
    expect(zyraxonFailoverChain("opencode", "big-pickle")).toEqual(["big-pickle"])
  })

  test("still reaches an unknown ZYRAXON model the user selected", () => {
    // A future model id must be attempted first, not dropped.
    const chain = zyraxonFailoverChain(ZYRAXON_PROVIDER_ID, "zyraxon-unreleased")
    expect(chain[0]).toBe("zyraxon-unreleased")
    expect(chain).toHaveLength(11)
  })
})

describe("isFailoverWorthy", () => {
  test("retries a plain failure", () => {
    expect(isFailoverWorthy({})).toBe(true)
  })

  test("never retries after the user stopped the reply", () => {
    expect(isFailoverWorthy({ aborted: true })).toBe(false)
  })

  test("never retries context overflow, which every ZYRAXON model shares", () => {
    expect(isFailoverWorthy({ contextOverflow: true })).toBe(false)
  })
})

describe("shouldFailover", () => {
  test("retries a dead model", () => {
    expect(shouldFailover(new Error("fetch failed"), false)).toBe(true)
    expect(shouldFailover("429 rate limit exceeded", false)).toBe(true)
  })

  test("never retries a user abort, whatever the error says", () => {
    expect(shouldFailover(new Error("fetch failed"), true)).toBe(false)
  })

  test("never retries a context overflow, which the next model hits too", () => {
    expect(shouldFailover(new Error("prompt is too long: context length exceeded"), false)).toBe(false)
  })
})
