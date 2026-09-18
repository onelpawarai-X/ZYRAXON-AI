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
const ADMIN_AUTH_KEY = "zyraxon-admin-auth"

function syncToFile(state: SubscriptionState): void {
  try {
    const detail = JSON.stringify(state)
    if (typeof window !== "undefined" && (window as any).electronAPI?.setSubscriptionState) {
      ;(window as any).electronAPI.setSubscriptionState(detail)
    }
  } catch {}
}

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
    syncToFile(state)
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
  return { success: true, message: `${SUBSCRIPTION_PLANS[result.tier].name} activated permanently!`, state: newState }
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

export function activateTierWithDuration(tier: SubscriptionTier, durationDays: number): SubscriptionState {
  const now = Date.now()
  const newState: SubscriptionState = {
    tier,
    activatedAt: now,
    expiresAt: now + durationDays * 24 * 60 * 60 * 1000,
    secretCode: null,
    stripeSessionId: `stripe_${now}`,
  }
  saveSubState(newState)
  return newState
}

export function resetToFree(): SubscriptionState {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(ADMIN_AUTH_KEY)
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

export function isPermanentUnlock(): boolean {
  const state = loadSubState()
  return state.tier !== "free" && state.expiresAt === null
}

export function getCurrentTier(): SubscriptionTier {
  return loadSubState().tier
}

export function openStripeCheckout(tier: SubscriptionTier): void {
  const plan = SUBSCRIPTION_PLANS[tier]
  // Stripe Payment Links — configure these in your Stripe Dashboard
  // Go to https://dashboard.stripe.com/payment-links to create links
  const paymentLinks: Record<SubscriptionTier, string> = {
    free: "",
    pro: import.meta.env.VITE_STRIPE_PRO_LINK || `https://buy.stripe.com/your-pro-link`,
    max: import.meta.env.VITE_STRIPE_MAX_LINK || `https://buy.stripe.com/your-max-link`,
    ultra: import.meta.env.VITE_STRIPE_ULTRA_LINK || `https://buy.stripe.com/your-ultra-link`,
  }
  const link = paymentLinks[tier]
  if (link && !link.includes("your-")) {
    window.open(link, "_blank")
  } else {
    // Fallback: show instructions to configure Stripe
    alert(
      `Stripe Payment Link not configured for ${plan.name} tier.\n\n` +
      `To set up Stripe payments:\n` +
      `1. Go to https://dashboard.stripe.com/payment-links\n` +
      `2. Create a payment link for $${plan.price} (${plan.durationDays || "permanent"})\n` +
      `3. Add the link to your .env file:\n` +
      `   VITE_STRIPE_${tier.toUpperCase()}_LINK=your-link-here\n` +
      `4. Restart the app`
    )
  }
}

export function isStripeReady(): boolean {
  // Check if ANY Stripe payment link is configured
  const proLink = import.meta.env.VITE_STRIPE_PRO_LINK
  const maxLink = import.meta.env.VITE_STRIPE_MAX_LINK
  const ultraLink = import.meta.env.VITE_STRIPE_ULTRA_LINK
  const hasLinks = (proLink && !proLink.includes("your-")) ||
    (maxLink && !maxLink.includes("your-")) ||
    (ultraLink && !ultraLink.includes("your-"))
  return hasLinks
}

export function lockSubscription(): SubscriptionState {
  const current = loadSubState()
  const lockedState: SubscriptionState = {
    tier: "free",
    activatedAt: current.activatedAt,
    expiresAt: null,
    secretCode: current.secretCode,
    stripeSessionId: null,
  }
  saveSubState(lockedState)
  return lockedState
}

export function isAdminUnlocked(): boolean {
  try {
    return localStorage.getItem(ADMIN_AUTH_KEY) === "true"
  } catch {
    return false
  }
}

export function setAdminUnlocked(val: boolean): void {
  if (val) {
    localStorage.setItem(ADMIN_AUTH_KEY, "true")
  } else {
    localStorage.removeItem(ADMIN_AUTH_KEY)
  }
}

export { TIER_ORDER, SUBSCRIPTION_PLANS, hasAccess }
export type { SubscriptionTier, SubscriptionState }
