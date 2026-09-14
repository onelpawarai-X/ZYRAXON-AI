import {
  type SubscriptionTier,
  type SubscriptionState,
  SUBSCRIPTION_PLANS,
  TIER_ORDER,
  hasAccess,
  validateSecretCode,
  getToolRequiredTier,
} from "@/context/subscription-types"

const STORAGE_KEY = "zyraxon-subscription"

const FREE_STATE: SubscriptionState = {
  tier: "free",
  activatedAt: null,
  expiresAt: null,
  secretCode: null,
  stripeSessionId: null,
}

export function loadSubState(): SubscriptionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...FREE_STATE }
    const parsed = JSON.parse(raw) as SubscriptionState
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(STORAGE_KEY)
      return { ...FREE_STATE }
    }
    return parsed
  } catch {
    return { ...FREE_STATE }
  }
}

function saveSubState(state: SubscriptionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

export function activateWithCode(code: string): { success: boolean; message: string; state: SubscriptionState } {
  const result = validateSecretCode(code)
  if (!result) return { success: false, message: "Invalid activation code", state: loadSubState() }

  const now = Date.now()
  const expiresAt = result.durationDays ? now + result.durationDays * 24 * 60 * 60 * 1000 : null

  const newState: SubscriptionState = {
    tier: result.tier,
    activatedAt: now,
    expiresAt,
    secretCode: code.trim().toUpperCase(),
    stripeSessionId: null,
  }
  saveSubState(newState)
  return { success: true, message: `${SUBSCRIPTION_PLANS[result.tier].name} plan activated permanently!`, state: newState }
}

export function activateTier(tier: SubscriptionTier): SubscriptionState {
  const newState: SubscriptionState = {
    tier,
    activatedAt: Date.now(),
    expiresAt: null,
    secretCode: null,
    stripeSessionId: null,
  }
  saveSubState(newState)
  return newState
}

export function resetToFree(): SubscriptionState {
  saveSubState({ ...FREE_STATE })
  return { ...FREE_STATE }
}

export function canUseTool(toolId: string, currentTier: SubscriptionTier): boolean {
  const required = getToolRequiredTier(toolId)
  return hasAccess(currentTier, required)
}

export function getToolRequiredTierExported(toolId: string): SubscriptionTier {
  return getToolRequiredTier(toolId)
}

export function getDaysRemaining(state: SubscriptionState): number | null {
  if (!state.expiresAt) return null
  const diff = state.expiresAt - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

export function getPlan(state: SubscriptionState) {
  return SUBSCRIPTION_PLANS[state.tier]
}

export function isActive(state: SubscriptionState): boolean {
  if (state.tier === "free") return true
  if (!state.expiresAt) return true
  return Date.now() < state.expiresAt
}

export function openStripeCheckout(tier: SubscriptionTier): void {
  const priceId = SUBSCRIPTION_PLANS[tier].price
  const planName = SUBSCRIPTION_PLANS[tier].name
  const stripeUrl = `https://checkout.stripe.com/pay/ZYRAXON-${planName.toUpperCase()}-${priceId}`
  window.open(stripeUrl, "_blank")
}

export { TIER_ORDER, SUBSCRIPTION_PLANS, hasAccess }
export type { SubscriptionTier, SubscriptionState }
