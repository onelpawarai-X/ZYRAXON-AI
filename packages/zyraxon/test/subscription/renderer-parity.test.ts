import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { TOOL_TIER_MAP } from "../../src/subscription/tier-map"
import { AGENT_MODE_TIERS } from "../../src/subscription/agent-tiers"

// The renderer gates the lock badges from its own copy of the maps. Backend enforcement is
// authoritative, so any drift between the two would show an unlocked UI over a locked tool.
// These tests read the renderer sources as text because the app cannot import the backend
// package: canonical.ts pulls in node:fs and the renderer is bundled for the browser.
const APP_SRC = join(import.meta.dir, "..", "..", "..", "app", "src")
const STORAGE_KEY = "zyraxon-subscription"

function parseToolTiers(source: string, exportName: string) {
  const start = source.indexOf(`export const ${exportName}`)
  if (start === -1) throw new Error(`${exportName} not found`)
  const body = source.slice(start, source.indexOf("}", start) + 1)
  return Object.fromEntries(
    [...body.matchAll(/([A-Za-z_][A-Za-z0-9_]*):\s*"(free|pro|max|ultra)"/g)].map((match) => [match[1], match[2]]),
  ) as Record<string, string>
}

function parseAgentTiers(source: string) {
  return Object.fromEntries(
    [...source.matchAll(/id:\s*"([a-z-]+)"[\s\S]*?tier:\s*"(free|pro|max|ultra)"/g)].map((match) => [match[1], match[2]]),
  ) as Record<string, string>
}

describe("renderer and backend tool tiers cannot drift", () => {
  const appSource = readFileSync(join(APP_SRC, "context", "subscription-types.ts"), "utf-8")

  test("the renderer copy of TOOL_TIER_MAP is identical to the backend gate", () => {
    expect(parseToolTiers(appSource, "TOOL_TIER_MAP")).toEqual(TOOL_TIER_MAP)
  })

  test("the renderer declares the same storage key as the activation writer", () => {
    const context = readFileSync(join(APP_SRC, "context", "subscription.tsx"), "utf-8")
    expect(context).toContain(`"${STORAGE_KEY}"`)
  })

  test("no second module writes the subscription storage key", () => {
    // A second store was the original defect: Settings wrote its own copy of the tier while
    // the prompt input read a different one, so the badge and the gate disagreed.
    const legacy = readFileSync(join(APP_SRC, "utils", "subscription-store.ts"), "utf-8")
    expect(legacy).not.toContain(STORAGE_KEY)
    expect(legacy).not.toContain("export function activateWithCode")
    expect(legacy).not.toContain("export function activateTier")
  })

  test("the renderer publishes every activation to the backend gate", () => {
    const context = readFileSync(join(APP_SRC, "context", "subscription.tsx"), "utf-8")
    expect(context).toContain("window.api?.setSubscriptionState")
    expect(context).toContain("pushToBackend(state)")
  })
})

describe("renderer and backend agent mode tiers cannot drift", () => {
  const collabSource = readFileSync(join(APP_SRC, "context", "collab.tsx"), "utf-8")

  test("agent lock badges use the same tiers the mode switch gate enforces", () => {
    const rendererTiers = parseAgentTiers(collabSource)
    for (const [mode, tier] of Object.entries(AGENT_MODE_TIERS)) {
      if (mode === "explore") continue
      expect(rendererTiers[mode]).toBe(tier)
    }
  })
})
