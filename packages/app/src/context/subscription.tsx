// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSignal, onMount, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@zyraxon-ai/ui/context"
import {
  type SubscriptionTier,
  type SubscriptionState,
  SUBSCRIPTION_PLANS,
  TIER_ORDER,
  hasAccess,
  verifyLicenseWithServer,
  getToolRequiredTier,
  parseSubscriptionState,
  FREE_STATE,
} from "./subscription-types"

const STORAGE_KEY = "zyraxon-subscription"
const HEARTBEAT_INTERVAL_MS = 40 * 1000

function pushToBackend(state: SubscriptionState) {
  const send = window.api?.setSubscriptionState
  if (!send) {
    console.error("[Subscription] Desktop bridge unavailable, backend tier cannot be updated.")
    return
  }
  void send(JSON.stringify(state)).catch((error: unknown) => {
    console.error("[Subscription] Failed to publish tier to the backend:", error)
  })
}

function saveState(state: SubscriptionState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error("[Subscription] Failed to persist state:", error)
  }
  pushToBackend(state)
}

function readStoredState(): { state: SubscriptionState; problem: string | null } {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch (error) {
    return { state: { ...FREE_STATE }, problem: `localStorage is unreadable: ${String(error)}` }
  }
  if (!raw) return { state: { ...FREE_STATE }, problem: null }

  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch (error) {
    return { state: { ...FREE_STATE }, problem: `stored value is not valid JSON: ${String(error)}` }
  }

  const parsed = parseSubscriptionState(decoded)
  if (!parsed.ok) return { state: { ...FREE_STATE }, problem: parsed.reason }
  if (parsed.state.expiresAt && Date.now() > parsed.state.expiresAt) {
    saveState({ ...FREE_STATE })
    return { state: { ...FREE_STATE }, problem: null }
  }
  pushToBackend(parsed.state)
  return { state: parsed.state, problem: null }
}

function computeExpiresAt(durationDays: number | null): number | null {
  if (!durationDays) return null
  return Date.now() + durationDays * 24 * 60 * 60 * 1000
}

export const { use: useSubscription, provider: SubscriptionProvider } = createSimpleContext({
  name: "Subscription",
  gate: false,
  init: () => {
    const restored = readStoredState()
    if (restored.problem) {
      console.error(
        `[Subscription] Could not restore "${STORAGE_KEY}" (${restored.problem}). Re-activating restores access.`,
      )
    }
    const [state, setState] = createStore<SubscriptionState>(restored.state)
    const [restoreProblem, setRestoreProblem] = createSignal<string | null>(restored.problem)
    const [showUpgrade, setShowUpgrade] = createSignal(false)
    const [pendingTool, setPendingTool] = createSignal<string | null>(null)

    const tier = (): SubscriptionTier => state.tier
    const plan = () => SUBSCRIPTION_PLANS[state.tier]
    const activatedAt = (): number | null => state.activatedAt
    const expiresAt = (): number | null => state.expiresAt
    const secretCode = (): string | null => state.secretCode
    const stripeSessionId = (): string | null => state.stripeSessionId
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
    const isPermanentUnlock = (): boolean => state.tier !== "free" && !state.expiresAt

    // 1-2 Second Live Handshake with Server
    async function activateWithCode(code: string): Promise<{ success: boolean; message: string }> {
      const clean = code.trim().toUpperCase()
      if (!clean) return { success: false, message: "দয়া করে অ্যাক্টিভেশন কোডটি লিখুন।" }

      const res = await verifyLicenseWithServer(clean)
      if (!res.valid || !res.tier) {
        if (res.reason === "expired") {
          return { success: false, message: "এই লাইসেন্স কোডের মেয়াদ শেষ হয়ে গেছে।" }
        }
        if (res.reason === "revoked") {
          return { success: false, message: "এই কোডটি বাতিল করা হয়েছে।" }
        }
        return { success: false, message: "অবৈধ অ্যাক্টিভেশন কোড! সঠিক কোড দিন অথবা ওয়েবসাইট থেকে কোড সংগ্রহ করুন।" }
      }

      const now = Date.now()
      const expiry = res.expiresAt ? new Date(res.expiresAt).getTime() : now + (res.remainingMs ?? 30 * 86400000)

      setState({
        tier: res.tier,
        activatedAt: now,
        expiresAt: expiry,
        secretCode: clean,
        stripeSessionId: null,
      })
      setRestoreProblem(null)
      saveState(state)
      return { success: true, message: `${SUBSCRIPTION_PLANS[res.tier].name} প্ল্যান সফলভাবে আনলক হয়েছে!` }
    }

    function activateTier(tier: SubscriptionTier, durationDays?: number | null): void {
      const now = Date.now()
      const days = durationDays ?? SUBSCRIPTION_PLANS[tier].durationDays
      const expiresAt = days ? computeExpiresAt(days) : null

      setState({
        tier,
        activatedAt: now,
        expiresAt,
        secretCode: null,
        stripeSessionId: null,
      })
      setRestoreProblem(null)
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
      setRestoreProblem(null)
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

    // 40-second Heartbeat: Verifies with server and auto-locks on expiry
    async function heartbeatCheck() {
      if (!state.secretCode || state.tier === "free") {
        if (state.expiresAt && Date.now() > state.expiresAt && state.tier !== "free") {
          resetToFree()
        }
        return
      }

      const res = await verifyLicenseWithServer(state.secretCode)
      if (!res.valid) {
        console.warn("[Subscription] License expired or revoked by server. Reverting to Free tier.")
        resetToFree()
      } else if (res.expiresAt) {
        const expMs = new Date(res.expiresAt).getTime()
        if (expMs !== state.expiresAt || (res.tier && res.tier !== state.tier)) {
          setState({
            ...state,
            tier: res.tier || state.tier,
            expiresAt: expMs,
          })
          saveState(state)
        }
      }
    }

    onMount(() => {
      void heartbeatCheck()
      const interval = setInterval(() => {
        void heartbeatCheck()
      }, HEARTBEAT_INTERVAL_MS)
      return () => clearInterval(interval)
    })

    return {
      tier,
      plan,
      activatedAt,
      expiresAt,
      secretCode,
      stripeSessionId,
      isActive,
      isPermanentUnlock,
      daysRemaining,
      progress,
      restoreProblem,
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
