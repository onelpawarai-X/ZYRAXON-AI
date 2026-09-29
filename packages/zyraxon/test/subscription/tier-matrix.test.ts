import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  getCurrentTier,
  hasAccess,
  invalidateTierCache,
  readSubState,
  subscriptionFilePath,
  TIER_ORDER,
  type Tier,
} from "../../src/subscription/canonical"
import { TOOL_TIER_MAP } from "../../src/subscription/tier-map"
import { AGENT_MODE_TIERS, getAgentModeRequiredTier, listAgentModes } from "../../src/subscription/agent-tiers"

const TIERS = TIER_ORDER as readonly Tier[]

function expectedAccess(current: Tier, required: Tier) {
  return TIER_ORDER.indexOf(current) >= TIER_ORDER.indexOf(required)
}

describe("subscription tier matrix (backend canonical gate)", () => {
  test("the tier model is free < pro < max < ultra", () => {
    expect([...TIER_ORDER]).toEqual(["free", "pro", "max", "ultra"])
  })

  test("4x4 access matrix matches rank ordering", () => {
    const matrix = TIERS.map((current) =>
      TIERS.map((required) => ({ current, required, allowed: hasAccess(current, required) })),
    )
    expect(matrix.flat().map((cell) => cell.allowed)).toEqual(
      matrix.flat().map((cell) => expectedAccess(cell.current, cell.required)),
    )
  })

  test("ultra unlocks every required tier", () => {
    expect(TIERS.filter((required) => hasAccess("ultra", required))).toEqual([...TIERS])
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
})

describe("agent mode tier matrix (backend)", () => {
  const REQUIRED: Record<string, Tier> = {
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
    explore: "free",
  }

  test("every documented mode is mapped to its required tier", () => {
    for (const [mode, tier] of Object.entries(REQUIRED)) {
      expect(getAgentModeRequiredTier(mode)).toBe(tier)
    }
  })

  test("no extra modes are gated", () => {
    expect([...listAgentModes()].sort()).toEqual(Object.keys(REQUIRED).sort())
  })

  test("mode lookup is case and whitespace insensitive", () => {
    expect(getAgentModeRequiredTier("  Dark-Emperor ")).toBe("ultra")
    expect(getAgentModeRequiredTier("BEAST")).toBe("max")
    expect(getAgentModeRequiredTier("nope")).toBeUndefined()
  })

  test("ultra unlocks every agent mode, free unlocks only the free ones", () => {
    const modes = Object.entries(REQUIRED)
    expect(modes.filter(([mode]) => hasAccess("ultra", getAgentModeRequiredTier(mode)!)).map(([m]) => m)).toHaveLength(
      modes.length,
    )
    expect(
      modes
        .filter(([mode]) => hasAccess("free", getAgentModeRequiredTier(mode)!))
        .map(([mode]) => mode)
        .sort(),
    ).toEqual(["build", "explore", "general", "plan", "vision"])
  })
})

describe("tool tier matrix (backend)", () => {
  test("every mapped tool declares a real tier", () => {
    const bad = Object.entries(TOOL_TIER_MAP).filter(([, tier]) => !TIER_ORDER.includes(tier))
    expect(bad).toEqual([])
  })

  test("every tier has tools mapped to it", () => {
    const counts = TIERS.map((tier) => ({
      tier,
      count: Object.values(TOOL_TIER_MAP).filter((value) => value === tier).length,
    }))
    expect(counts.filter((entry) => entry.count === 0)).toEqual([])
  })

  test("unlocked tool count is monotonically non-decreasing across tiers", () => {
    const unlocked = TIERS.map((tier) => Object.values(TOOL_TIER_MAP).filter((req) => hasAccess(tier, req)).length)
    expect(unlocked).toEqual([...unlocked].sort((a, b) => a - b))
    expect(unlocked[unlocked.length - 1]).toBe(Object.keys(TOOL_TIER_MAP).length)
  })

  test("ultra unlocks every tool and free only the free tools", () => {
    const freeOnly = Object.entries(TOOL_TIER_MAP).filter(([, req]) => hasAccess("free", req))
    expect(freeOnly.every(([, req]) => req === "free")).toBe(true)
    const denied = Object.entries(TOOL_TIER_MAP).filter(([, req]) => !hasAccess("free", req))
    expect(denied.length).toBeGreaterThan(0)
    for (const [id, required] of Object.entries(TOOL_TIER_MAP)) expect(hasAccess("ultra", required)).toBe(true)
  })

  test("beast is gated at max and stays reachable for max and above", () => {
    expect(getAgentModeRequiredTier("beast")).toBe("max")
    expect(hasAccess("max", "max")).toBe(true)
    expect(hasAccess("pro", "max")).toBe(false)
    expect(hasAccess("ultra", "max")).toBe(true)
  })
})

describe("canonical tier is read from the state file that enforcement uses", () => {
  let dir = ""
  let statePath = ""
  const previous = process.env.ZYRAXON_SUBSCRIPTION_FILE

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "zyraxon-sub-"))
    statePath = join(dir, "subscription.json")
    process.env.ZYRAXON_SUBSCRIPTION_FILE = statePath
  })

  afterAll(() => {
    if (previous === undefined) delete process.env.ZYRAXON_SUBSCRIPTION_FILE
    else process.env.ZYRAXON_SUBSCRIPTION_FILE = previous
    invalidateTierCache()
    rmSync(dir, { recursive: true, force: true })
  })

  beforeEach(() => {
    rmSync(statePath, { force: true })
    invalidateTierCache()
  })

  const write = (state: unknown) => {
    writeFileSync(statePath, typeof state === "string" ? state : JSON.stringify(state), "utf-8")
    invalidateTierCache()
  }

  test("a persisted ultra activation is the tier enforcement sees", () => {
    write({ tier: "ultra", activatedAt: Date.now(), expiresAt: null, secretCode: "X", stripeSessionId: null })
    expect(getCurrentTier()).toBe("ultra")
    expect(readSubState().tier).toBe("ultra")
  })

  test("each tier round-trips through the file", () => {
    for (const tier of TIERS) {
      write({ tier, activatedAt: Date.now(), expiresAt: null })
      expect(getCurrentTier()).toBe(tier)
    }
  })

  test("an expired activation enforces free", () => {
    write({ tier: "ultra", activatedAt: Date.now() - 1000, expiresAt: Date.now() - 1 })
    expect(getCurrentTier()).toBe("free")
  })

  test("a canceled stripe subscription enforces free", () => {
    write({ tier: "ultra", status: "canceled", currentPeriodEnd: new Date(Date.now() + 86400000).toISOString() })
    expect(getCurrentTier()).toBe("free")
  })

  test("a stripe period end is honoured as the expiry", () => {
    write({ tier: "pro", status: "active", currentPeriodEnd: new Date(Date.now() + 86400000).toISOString() })
    expect(getCurrentTier()).toBe("pro")
  })

  test("a corrupt state file enforces free instead of throwing", () => {
    write("{ not json")
    expect(getCurrentTier()).toBe("free")
  })

  test("a stale unknown tier is rejected rather than trusted", () => {
    write({ tier: "platinum" })
    expect(getCurrentTier()).toBe("free")
  })

  test("the gate reports which file it enforces", () => {
    write({ tier: "max", activatedAt: Date.now(), expiresAt: null })
    expect(subscriptionFilePath()).toBe(statePath)
    expect(readSubState().tier).toBe("max")
  })
})
