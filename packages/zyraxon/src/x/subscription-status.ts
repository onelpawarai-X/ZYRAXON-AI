import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { getCurrentTier, hasAccess, TIER_ORDER, type Tier, TOOL_TIER_MAP } from "../subscription/canonical"
import { xToolRegistry } from "./x-tool-registry"

interface SubState {
  tier: Tier
  activatedAt: number | null
  expiresAt: number | null
  secretCode: string | null
  stripeSessionId: string | null
}

interface SubStatusResult {
  ok: boolean
  data?: {
    tier: Tier
    toolAccess: string
    daysRemaining: number | null
    isPermanent: boolean
    activatedAt: string | null
    expiresAt: string | null
    maxAgents: string
    memoryAllocation: string
    features: string
  }
  error?: string
}

function readSubState(): SubState {
  const freeState: SubState = { tier: "free", activatedAt: null, expiresAt: null, secretCode: null, stripeSessionId: null }
  try {
    const filePath = join(homedir(), ".zyraxon", "subscription.json")
    if (!existsSync(filePath)) return freeState
    const data = JSON.parse(readFileSync(filePath, "utf-8"))
    if (data.expiresAt && Date.now() > data.expiresAt) return freeState
    if (TIER_ORDER.includes(data.tier)) return data as SubState
    return freeState
  } catch {
    return freeState
  }
}

function getToolCountForTier(tier: Tier): number {
  let count = 0
  for (const tool of xToolRegistry) {
    const toolTier = TOOL_TIER_MAP[tool.id] ?? "max"
    if (hasAccess(tier, toolTier)) count++
  }
  return count
}

const AGENT_INFO: Record<Tier, { agents: string; memory: string }> = {
  free: { agents: "1", memory: "Basic (100 entries)" },
  pro: { agents: "3", memory: "Pro (500 entries)" },
  max: { agents: "8", memory: "Max (2000 entries)" },
  ultra: { agents: "Unlimited", memory: "Ultra (10000 entries)" },
}

const FEATURE_INFO: Record<Tier, string> = {
  free: "File R/W, Shell, Web Search, Glob/Grep, Todo, Math, Science, Finance, Data Science, Security basics, Daily life, Memory, Documents, Skills, Tasks",
  pro: "Everything in Free + Code Analysis, API Testing, Screen Vision, Self-Evolution, Aviation, Ground Vehicles, Drones, Helicopters, ML/Safety, Common Sense AI, Creativity, Multi-Agent",
  max: "Everything in Pro + Space Systems, Medical, Industrial, Infrastructure, Security, Survey, Agriculture, Marine, Construction, IoT, Digital Twin, Dashboard, Remote Control, Decision Support",
  ultra: "Everything in Max + Ultra Code Generator, Ultra Security, Ultra Performance, Ultra Refactoring, Ultra Test Gen, Ultra Auto-Deploy, Ultra Code Review, Ultra Quantum, Singularity AI, Guardian System, Custom Models, Priority Support, Early Access",
}

export function execute(_args: any): SubStatusResult {
  const state = readSubState()
  const tier = state.tier
  const toolCount = getToolCountForTier(tier)
  const agentInfo = AGENT_INFO[tier]

  let daysRemaining: number | null = null
  if (state.expiresAt) {
    const diff = state.expiresAt - Date.now()
    daysRemaining = Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
  }

  const isPermanent = tier !== "free" && state.expiresAt === null

  return {
    ok: true,
    data: {
      tier,
      toolAccess: `${toolCount} tools`,
      daysRemaining,
      isPermanent,
      activatedAt: state.activatedAt ? new Date(state.activatedAt).toISOString() : null,
      expiresAt: state.expiresAt ? new Date(state.expiresAt).toISOString() : null,
      maxAgents: agentInfo.agents,
      memoryAllocation: agentInfo.memory,
      features: FEATURE_INFO[tier],
    },
  }
}
