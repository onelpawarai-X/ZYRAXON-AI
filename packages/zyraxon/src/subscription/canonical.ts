import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
export { TOOL_TIER_MAP } from "./tier-map"
import { TOOL_TIER_MAP } from "./tier-map"

export const TIER_ORDER = ["free", "pro", "max", "ultra"] as const
export type Tier = typeof TIER_ORDER[number]

export interface SubscriptionState {
  tier: Tier
  activatedAt: number | null
  expiresAt: number | null
  secretCode: string | null
  stripeSessionId: string | null
  status?: string
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  stripeSubscriptionId?: string | null
  stripeCustomerId?: string | null
  cancelAtPeriodEnd?: boolean
}

const FREE_STATE: SubscriptionState = {
  tier: "free",
  activatedAt: null,
  expiresAt: null,
  secretCode: null,
  stripeSessionId: null,
}

const SUBSCRIPTION_PATH = join(homedir(), ".zyraxon", "subscription.json")

let _cachedTier: Tier = "free"
let _lastRead = 0
const CACHE_TTL_MS = 2000

function tierRank(tier: Tier): number {
  return TIER_ORDER.indexOf(tier)
}

export function hasAccess(currentTier: Tier, requiredTier: Tier): boolean {
  return tierRank(currentTier) >= tierRank(requiredTier)
}

export function getToolRequiredTier(toolId: string): Tier {
  return TOOL_TIER_MAP[toolId] ?? "max"
}

function toMsNumber(value: unknown): number | null {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const asNumber = Number(value)
    if (!Number.isNaN(asNumber)) return asNumber
    const asDate = new Date(value)
    if (!Number.isNaN(asDate.getTime())) return asDate.getTime()
  }
  return null
}

function parseSubState(raw: unknown): SubscriptionState {
  if (!raw || typeof raw !== "object") return FREE_STATE
  const obj = raw as Record<string, unknown>
  if (typeof obj.tier !== "string") return FREE_STATE
  if (!TIER_ORDER.includes(obj.tier as Tier)) return FREE_STATE

  // Stripe writes currentPeriodEnd (ISO string) instead of expiresAt (ms).
  // Bridge formats so runtime tier gating uses the same file Stripe writes.
  const stripePeriodEnd = toMsNumber(obj.currentPeriodEnd)
  const expiresAt = stripePeriodEnd ?? toMsNumber(obj.expiresAt)
  const activatedAt = toMsNumber(obj.activatedAt) ?? toMsNumber(obj.currentPeriodStart)

  const status = typeof obj.status === "string" ? obj.status : null
  if (status === "canceled" || status === "past_due" || status === "unpaid" || status === "incomplete") {
    return {
      tier: "free",
      activatedAt,
      expiresAt,
      secretCode: typeof obj.secretCode === "string" ? obj.secretCode : null,
      stripeSessionId: typeof obj.stripeSessionId === "string" ? obj.stripeSessionId : null,
      status,
      currentPeriodStart: typeof obj.currentPeriodStart === "string" ? obj.currentPeriodStart : null,
      currentPeriodEnd: typeof obj.currentPeriodEnd === "string" ? obj.currentPeriodEnd : null,
      stripeSubscriptionId: typeof obj.stripeSubscriptionId === "string" ? obj.stripeSubscriptionId : null,
      stripeCustomerId: typeof obj.stripeCustomerId === "string" ? obj.stripeCustomerId : null,
      cancelAtPeriodEnd: typeof obj.cancelAtPeriodEnd === "boolean" ? obj.cancelAtPeriodEnd : false,
    }
  }

  return {
    tier: obj.tier as Tier,
    activatedAt,
    expiresAt,
    secretCode: typeof obj.secretCode === "string" ? obj.secretCode : null,
    stripeSessionId: typeof obj.stripeSessionId === "string" ? obj.stripeSessionId : null,
    status: status ?? undefined,
    currentPeriodStart: typeof obj.currentPeriodStart === "string" ? obj.currentPeriodStart : null,
    currentPeriodEnd: typeof obj.currentPeriodEnd === "string" ? obj.currentPeriodEnd : null,
    stripeSubscriptionId: typeof obj.stripeSubscriptionId === "string" ? obj.stripeSubscriptionId : null,
    stripeCustomerId: typeof obj.stripeCustomerId === "string" ? obj.stripeCustomerId : null,
    cancelAtPeriodEnd: typeof obj.cancelAtPeriodEnd === "boolean" ? obj.cancelAtPeriodEnd : false,
  }
}

export function validateSubscription(state: SubscriptionState): SubscriptionState {
  if (!TIER_ORDER.includes(state.tier)) return FREE_STATE
  if (state.expiresAt !== null && Date.now() > state.expiresAt) return FREE_STATE
  return state
}

export function getCurrentTier(): Tier {
  const now = Date.now()
  if (now - _lastRead < CACHE_TTL_MS) return _cachedTier
  _lastRead = now
  try {
    if (!existsSync(SUBSCRIPTION_PATH)) {
      _cachedTier = "free"
      return _cachedTier
    }
    const data = JSON.parse(readFileSync(SUBSCRIPTION_PATH, "utf-8"))
    const validated = validateSubscription(parseSubState(data))
    _cachedTier = validated.tier
  } catch {
    _cachedTier = "free"
  }
  return _cachedTier
}

export function readSubState(): SubscriptionState {
  try {
    if (!existsSync(SUBSCRIPTION_PATH)) return FREE_STATE
    const data = JSON.parse(readFileSync(SUBSCRIPTION_PATH, "utf-8"))
    return validateSubscription(parseSubState(data))
  } catch {
    return FREE_STATE
  }
}

