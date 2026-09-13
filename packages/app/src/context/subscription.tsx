import { createSignal, onMount, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@zyraxon-ai/ui/context"
import {
  type SubscriptionTier,
  type SubscriptionState,
  SUBSCRIPTION_PLANS,
  TIER_ORDER,
  hasAccess,
  validateSecretCode,
  getToolRequiredTier,
} from "./subscription-types"

const STORAGE_KEY = "zyraxon-subscription"
const CHECK_INTERVAL_MS = 60 * 1000

function loadState(): SubscriptionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { tier: "free", activatedAt: null, expiresAt: null, secretCode: null, stripeSessionId: null }
    const parsed = JSON.parse(raw) as SubscriptionState
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      return { tier: "free", activatedAt: null, expiresAt: null, secretCode: null, stripeSessionId: null }
    }
    return parsed
  } catch {
    return { tier: "free", activatedAt: null, expiresAt: null, secretCode: null, stripeSessionId: null }
  }
}

function saveState(state: SubscriptionState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

function computeExpiresAt(tier: SubscriptionTier, durationDays: number | null): number | null {
  if (!durationDays) return null
  return Date.now() + durationDays * 24 * 60 * 60 * 1000
}

export const { use: useSubscription, provider: SubscriptionProvider } = createSimpleContext({
  name: "Subscription",
  gate: false,
  init: () => {
    const [state, setState] = createStore<SubscriptionState>(loadState())
    const [showUpgrade, setShowUpgrade] = createSignal(false)
    const [pendingTool, setPendingTool] = createSignal<string | null>(null)

    const tier = (): SubscriptionTier => state.tier
    const plan = () => SUBSCRIPTION_PLANS[state.tier]
    const isActive = (): boolean => {
      if (state.tier === "free") return true
      if (!state.expiresAt) return true
      return Date.now() < state.expiresAt
    }
    const daysRemaining = (): number | null => {
      if (!state.expiresAt) return null
      const diff = state.expiresAt - Date.now()
      return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
    }
    const progress = (): number => {
      if (!state.activatedAt || !state.expiresAt) return 100
      const total = state.expiresAt - state.activatedAt
      const elapsed = Date.now() - state.activatedAt
      return Math.min(100, Math.max(0, Math.round((1 - elapsed / total) * 100)))
    }

    function activateWithCode(code: string): { success: boolean; message: string } {
      const result = validateSecretCode(code)
      if (!result) return { success: false, message: "Invalid activation code" }

      const now = Date.now()
      const expiresAt = result.durationDays ? computeExpiresAt(result.tier, result.durationDays) : null

      setState({
        tier: result.tier,
        activatedAt: now,
        expiresAt,
        secretCode: code.trim().toUpperCase(),
        stripeSessionId: null,
      })
      saveState(state)
      return { success: true, message: `${SUBSCRIPTION_PLANS[result.tier].name} plan activated!` }
    }

    function activateTier(tier: SubscriptionTier, durationDays?: number | null): void {
      const now = Date.now()
      const days = durationDays ?? SUBSCRIPTION_PLANS[tier].durationDays
      const expiresAt = days ? computeExpiresAt(tier, days) : null

      setState({
        tier,
        activatedAt: now,
        expiresAt,
        secretCode: null,
        stripeSessionId: null,
      })
      saveState(state)
    }

    function resetToFree(): void {
      setState({
        tier: "free",
        activatedAt: null,
        expiresAt: null,
        secretCode: null,
        stripeSessionId: null,
      })
      saveState(state)
    }

    function canUseTool(toolId: string): boolean {
      const required = getToolRequiredTier(toolId)
      return hasAccess(state.tier, required)
    }

    function getToolStatus(toolId: string): { allowed: boolean; requiredTier: SubscriptionTier } {
      const required = getToolRequiredTier(toolId)
      return { allowed: hasAccess(state.tier, required), requiredTier: required }
    }

    function requestToolAccess(toolId: string): boolean {
      if (canUseTool(toolId)) return true
      setPendingTool(toolId)
      setShowUpgrade(true)
      return false
    }

    onMount(() => {
      const check = () => {
        if (state.expiresAt && Date.now() > state.expiresAt && state.tier !== "free") {
          resetToFree()
        }
      }
      check()
      const interval = setInterval(check, CHECK_INTERVAL_MS)
      return () => clearInterval(interval)
    })

    return {
      tier,
      plan,
      isActive,
      daysRemaining,
      progress,
      showUpgrade,
      setShowUpgrade,
      pendingTool,
      setPendingTool,
      activateWithCode,
      activateTier,
      resetToFree,
      canUseTool,
      getToolStatus,
      requestToolAccess,
      allPlans: SUBSCRIPTION_PLANS,
      tierOrder: TIER_ORDER,
      hasAccess,
    }
  },
})
