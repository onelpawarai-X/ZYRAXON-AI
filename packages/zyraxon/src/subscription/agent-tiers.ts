import type { Tier } from "./canonical"

// Agent modes are gated by tier at runtime by x_mode_switch. Kept beside tier-map.ts
// so tool tiers and mode tiers cannot drift apart, and so the gate is reachable from
// tests without pulling the tool definition graph.
export const AGENT_MODE_TIERS: Record<string, Tier> = {
  general: "free",
  build: "free",
  plan: "free",
  explore: "free",
  vision: "free",
  pro: "pro",
  "pro-builder": "pro",
  beast: "max",
  auto: "ultra",
  apex: "ultra",
  "dark-emperor": "ultra",
}

export function getAgentModeRequiredTier(mode: string): Tier | undefined {
  return AGENT_MODE_TIERS[mode.trim().toLowerCase()]
}

export function listAgentModes(): string[] {
  return Object.keys(AGENT_MODE_TIERS)
}
