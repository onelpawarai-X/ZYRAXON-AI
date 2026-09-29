// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

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

// Resolved per read rather than at import time so the desktop main process can point the
// gate at a different state file, and so tests can exercise the real file-backed gate.
function subscriptionPath() {
  return process.env.ZYRAXON_SUBSCRIPTION_FILE ?? join(homedir(), ".zyraxon", "subscription.json")
}

let _cachedTier: Tier = "free"
let _lastRead = 0
const CACHE_TTL_MS = 2000

// The canonical gate is polled on every tool listing, so an unreadable state file would
// otherwise flood the log. Report each distinct problem once, and again only once the
// file content actually changes.
let _reportedProblem = ""

function reportProblem(problem: string) {
  if (_reportedProblem === problem) return
  _reportedProblem = problem
  console.error(`[Subscription] ${subscriptionPath()}: ${problem}. Enforcing free tier.`)
}

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
  if (!raw || typeof raw !== "object") {
    reportProblem(`state is not an object (${JSON.stringify(raw) ?? String(raw)})`)
    return FREE_STATE
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.tier !== "string") {
    reportProblem(`state is missing a string "tier" field`)
    return FREE_STATE
  }
  if (!TIER_ORDER.includes(obj.tier as Tier)) {
    reportProblem(`unknown tier "${obj.tier}", expected one of ${TIER_ORDER.join(", ")}`)
    return FREE_STATE
  }

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

type FileRead = { kind: "missing" } | { kind: "ok"; data: unknown } | { kind: "unreadable"; reason: string }

// An unreadable file is never treated as a quiet downgrade: a paid user whose state file
// got truncated or hand-edited must see the failure, otherwise the gate silently drops to
// free and premium tools stop executing with no explanation.
function readSubscriptionFile(): FileRead {
  const path = subscriptionPath()
  if (!existsSync(path)) return { kind: "missing" }
  const text = readFileSync(path, "utf-8")
  if (text.trim() === "") return { kind: "unreadable", reason: "file is empty" }
  try {
    return { kind: "ok", data: JSON.parse(text) }
  } catch (error) {
    return { kind: "unreadable", reason: error instanceof Error ? error.message : String(error) }
  }
}

export function getCurrentTier(): Tier {
  const now = Date.now()
  if (now - _lastRead < CACHE_TTL_MS) return _cachedTier
  _lastRead = now
  const read = readSubscriptionFile()
  if (read.kind === "unreadable") reportProblem(`unreadable state file (${read.reason})`)
  const validated = validateSubscription(read.kind === "ok" ? parseSubState(read.data) : FREE_STATE)
  _cachedTier = validated.tier
  return _cachedTier
}

export function readSubState(): SubscriptionState {
  const read = readSubscriptionFile()
  if (read.kind === "unreadable") reportProblem(`unreadable state file (${read.reason})`)
  return validateSubscription(read.kind === "ok" ? parseSubState(read.data) : FREE_STATE)
}

export function invalidateTierCache() {
  _lastRead = 0
  _cachedTier = "free"
  _reportedProblem = ""
}

export function subscriptionFilePath(): string {
  return subscriptionPath()
}

