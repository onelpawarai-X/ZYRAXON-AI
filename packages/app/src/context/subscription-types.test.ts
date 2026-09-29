// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { ZYRAXON_AGENTS } from "@/context/collab"
import {
  FREE_STATE,
  TIER_ORDER,
  TOOL_TIER_MAP,
  getToolRequiredTier,
  hasAccess,
  parseSubscriptionState,
  type SubscriptionTier,
} from "@/context/subscription-types"

const TIERS = TIER_ORDER as readonly SubscriptionTier[]

describe("subscription tier matrix (renderer)", () => {
  test("the tier model is free < pro < max < ultra", () => {
    expect([...TIER_ORDER]).toEqual(["free", "pro", "max", "ultra"])
  })

  test("ultra unlocks every required tier (all 12 combinations)", () => {
    const combinations = TIERS.flatMap((current) => TIERS.map((required) => ({ current, required })))
    expect(combinations).toHaveLength(16)
    const ultraGranted = combinations.filter(({ current, required }) => current === "ultra" && hasAccess(current, required))
    expect(ultraGranted).toHaveLength(4)
    expect(ultraGranted.map((cell) => cell.required)).toEqual(["free", "pro", "max", "ultra"])
  })

  test("4x4 access matrix matches rank ordering", () => {
    for (const current of TIERS)
      for (const required of TIERS)
        expect(hasAccess(current, required)).toBe(TIER_ORDER.indexOf(current) >= TIER_ORDER.indexOf(required))
  })

  test("free only unlocks free", () => {
    expect(TIERS.filter((required) => hasAccess("free", required))).toEqual(["free"])
  })

  test("pro unlocks free and pro but not max or ultra", () => {
    expect(TIERS.filter((required) => hasAccess("pro", required))).toEqual(["free", "pro"])
  })

  test("max unlocks free, pro and max but not ultra", () => {
    expect(TIERS.filter((required) => hasAccess("max", required))).toEqual(["free", "pro", "max"])
  })

  test("a tier never unlocks a strictly higher tier", () => {
    for (const current of TIERS)
      for (const required of TIERS)
        if (TIER_ORDER.indexOf(current) < TIER_ORDER.indexOf(required)) expect(hasAccess(current, required)).toBe(false)
  })

  test("ultra unlocks every agent mode", () => {
    const locked = ZYRAXON_AGENTS.filter((agent) => !hasAccess("ultra", agent.tier))
    expect(locked).toEqual([])
  })
})

describe("agent mode tier matrix (renderer)", () => {
  const REQUIRED: Record<string, SubscriptionTier> = {
    auto: "ultra",
    apex: "ultra",
    "dark-emperor": "ultra",
    pro: "pro",
    "pro-builder": "pro",
    beast: "max",
    vision: "free",
    general: "free",
    build: "free",
    plan: "free",
  }

  test("every documented mode carries its required tier", () => {
    for (const [id, tier] of Object.entries(REQUIRED)) {
      expect(ZYRAXON_AGENTS.find((agent) => agent.id === id)?.tier).toBe(tier)
    }
  })

  test("no agent is gated outside the documented set", () => {
    expect(ZYRAXON_AGENTS.map((agent) => agent.id).sort()).toEqual(Object.keys(REQUIRED).sort())
  })

  test("mode lock badges resolve by id and by name, case insensitively", () => {
    const byName = ZYRAXON_AGENTS.find((agent) => agent.name.toLowerCase() === "beast".toLowerCase())
    expect(byName?.tier).toBe("max")
    expect(byName && hasAccess("ultra", byName.tier)).toBe(true)
    expect(byName && hasAccess("pro", byName.tier)).toBe(false)
  })

  test("free only unlocks the free modes", () => {
    const unlocked = ZYRAXON_AGENTS.filter((agent) => hasAccess("free", agent.tier)).map((agent) => agent.id)
    expect(unlocked.sort()).toEqual(["build", "general", "plan", "vision"])
  })
})

describe("tool tier matrix (renderer)", () => {
  test("every mapped tool declares a real tier", () => {
    expect(Object.entries(TOOL_TIER_MAP).filter(([, tier]) => !TIER_ORDER.includes(tier))).toEqual([])
  })

  test("ultra unlocks every tool and free only free tools", () => {
    const entries = Object.entries(TOOL_TIER_MAP)
    expect(entries.every(([, required]) => hasAccess("ultra", required))).toBe(true)
    expect(entries.filter(([, required]) => hasAccess("free", required)).every(([, required]) => required === "free")).toBe(
      true,
    )
    expect(entries.some(([, required]) => !hasAccess("free", required))).toBe(true)
  })

  test("unlocked tool count is monotonically non-decreasing across tiers", () => {
    const unlocked = TIERS.map((tier) => Object.values(TOOL_TIER_MAP).filter((req) => hasAccess(tier, req)).length)
    expect(unlocked).toEqual([...unlocked].sort((a, b) => a - b))
    expect(unlocked[unlocked.length - 1]).toBe(Object.keys(TOOL_TIER_MAP).length)
  })

  test("an unknown tool defaults to a paid tier so it is never silently free", () => {
    expect(getToolRequiredTier("some_tool_added_next_release")).toBe("max")
    expect(hasAccess("free", getToolRequiredTier("some_tool_added_next_release"))).toBe(false)
    expect(hasAccess("ultra", getToolRequiredTier("some_tool_added_next_release"))).toBe(true)
  })
})

describe("persisted state is restored, never silently downgraded", () => {
  test("a valid ultra activation restores as ultra", () => {
    const parsed = parseSubscriptionState({
      tier: "ultra",
      activatedAt: 1700000000000,
      expiresAt: null,
      secretCode: "CODE",
      stripeSessionId: null,
    })
    expect(parsed).toEqual({
      ok: true,
      state: { tier: "ultra", activatedAt: 1700000000000, expiresAt: null, secretCode: "CODE", stripeSessionId: null },
    })
  })

  test("missing optional fields normalize to null", () => {
    const parsed = parseSubscriptionState({ tier: "pro" })
    expect(parsed).toEqual({
      ok: true,
      state: { tier: "pro", activatedAt: null, expiresAt: null, secretCode: null, stripeSessionId: null },
    })
  })

  test("tier casing and padding are normalized instead of downgraded", () => {
    for (const raw of ["Ultra", "ULTRA", " ultra "]) {
      const parsed = parseSubscriptionState({ tier: raw })
      expect(parsed.ok && parsed.state.tier).toBe("ultra")
    }
  })

  test("ISO timestamps from the stripe bridge are converted to ms", () => {
    const parsed = parseSubscriptionState({ tier: "max", activatedAt: "2026-01-01T00:00:00.000Z" })
    expect(parsed.ok && parsed.state.activatedAt).toBe(Date.parse("2026-01-01T00:00:00.000Z"))
  })

  test("unknown stripe fields are ignored rather than rejected", () => {
    const parsed = parseSubscriptionState({ tier: "ultra", status: "active", stripeCustomerId: "cus_1" })
    expect(parsed.ok && parsed.state.tier).toBe("ultra")
  })

  test("an unreadable value reports a reason instead of becoming a silent free state", () => {
    const cases: [unknown, string][] = [
      [null, "not an object"],
      ["ultra", "not an object"],
      [[], "not an object"],
      [{}, "missing a string tier field"],
      [{ tier: 7 }, "missing a string tier field"],
      [{ tier: "platinum" }, 'unknown tier "platinum"'],
      [{ tier: "ultra", expiresAt: "never" }, "expiresAt is not a timestamp"],
      [{ tier: "ultra", activatedAt: {} }, "activatedAt is not a timestamp"],
    ]
    for (const [raw, fragment] of cases) {
      const parsed = parseSubscriptionState(raw)
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) expect(parsed.reason).toContain(fragment)
    }
  })

  test("the free fallback is a complete state, not a partial one", () => {
    expect(FREE_STATE).toEqual({
      tier: "free",
      activatedAt: null,
      expiresAt: null,
      secretCode: null,
      stripeSessionId: null,
    })
  })
})
