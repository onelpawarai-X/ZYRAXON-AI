// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
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
  validateSecretCode,
  getToolRequiredTier,
  parseSubscriptionState,
  FREE_STATE,
} from "./subscription-types"

const STORAGE_KEY = "zyraxon-subscription"
const CHECK_INTERVAL_MS = 60 * 1000

// The backend enforces tiers from ~/.zyraxon/subscription.json (see
// packages/zyraxon/src/subscription/canonical.ts), written by the desktop main process
// over the set-subscription-state IPC channel. If this push is skipped the UI shows an
// unlocked plan while every premium tool stays denied at execution time.
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
  // The renderer store is the authority for the UI, so a paid activation found in storage
  // must reach the backend too, not just the UI.
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

    function activateWithCode(code: string): { success: boolean; message: string } {
      const result = validateSecretCode(code)
      if (!result) return { success: false, message: "Invalid activation code" }

      const now = Date.now()
      const expiresAt = result.durationDays ? computeExpiresAt(result.durationDays) : null

      setState({
        tier: result.tier,
        activatedAt: now,
        expiresAt,
        secretCode: code.trim().toUpperCase(),
        stripeSessionId: null,
      })
      setRestoreProblem(null)
      saveState(state)
      return { success: true, message: `${SUBSCRIPTION_PLANS[result.tier].name} plan activated!` }
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
