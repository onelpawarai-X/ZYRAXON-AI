import { Effect, Context, Layer } from "effect"
import path from "path"
import os from "os"
import fs from "fs/promises"

const SUBSCRIPTION_FILE = path.join(os.homedir(), ".zyraxon", "subscription.json")

export type SubscriptionTier = "free" | "pro" | "max" | "ultra"
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "unpaid" | "incomplete" | "trialing"

export interface SubscriptionInfo {
  tier: SubscriptionTier
  status: SubscriptionStatus
  stripeSubscriptionId: string | null
  stripeCustomerId: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  createdAt: string
  updatedAt: string
}

export interface Interface {
  readonly getSubscription: () => Effect.Effect<SubscriptionInfo, Error>
  readonly isActive: () => Effect.Effect<boolean, Error>
  readonly getTier: () => Effect.Effect<SubscriptionTier, Error>
  readonly canAccessMode: (mode: string) => Effect.Effect<boolean, Error>
  readonly getUpgradeOptions: () => Effect.Effect<SubscriptionTier[], Error>
  readonly isExpired: () => Effect.Effect<boolean, Error>
}

export class Service extends Context.Service<Service, Interface>()("@zyraxon/SubscriptionManager") {}

const TIER_HIERARCHY: SubscriptionTier[] = ["free", "pro", "max", "ultra"]

const MODE_TIER_REQUIREMENTS: Record<string, SubscriptionTier> = {
  general: "free",
  build: "free",
  plan: "free",
  explore: "free",
  compaction: "free",
  title: "free",
  auto: "free",
  pro: "pro",
  beast: "max",
  apex: "ultra",
  "dark-emperor": "ultra",
  vision: "max",
  "pro-builder": "pro",
}

function readSubscriptionFile(): Effect.Effect<SubscriptionInfo, Error> {
  return Effect.gen(function* () {
    try {
      const data = yield* Effect.tryPromise(() => fs.readFile(SUBSCRIPTION_FILE, "utf-8"))
      const parsed = JSON.parse(data) as Partial<SubscriptionInfo>
      return {
        tier: parsed.tier ?? "free",
        status: parsed.status ?? "incomplete",
        stripeSubscriptionId: parsed.stripeSubscriptionId ?? null,
        stripeCustomerId: parsed.stripeCustomerId ?? null,
        currentPeriodStart: parsed.currentPeriodStart ?? null,
        currentPeriodEnd: parsed.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: parsed.cancelAtPeriodEnd ?? false,
        createdAt: parsed.createdAt ?? new Date().toISOString(),
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      }
    } catch {
      return {
        tier: "free",
        status: "incomplete",
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }
  })
}

function getTierIndex(tier: SubscriptionTier): number {
  return TIER_HIERARCHY.indexOf(tier)
}

function isTierAtLeast(current: SubscriptionTier, required: SubscriptionTier): boolean {
  return getTierIndex(current) >= getTierIndex(required)
}

function calculateExpiryDate(periodStart: string, tier: SubscriptionTier): Date | null {
  if (!periodStart) return null
  const start = new Date(periodStart)
  switch (tier) {
    case "pro":
      return new Date(start.getTime() + 15 * 24 * 60 * 60 * 1000)
    case "max":
      return new Date(start.getTime() + 60 * 24 * 60 * 60 * 1000)
    case "ultra":
      return new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000)
    default:
      return null
  }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const getSubscription = Effect.fn("SubscriptionManager.getSubscription")(function* () {
      return yield* readSubscriptionFile()
    })

    const isActive = Effect.fn("SubscriptionManager.isActive")(function* () {
      const sub = yield* readSubscriptionFile()
      if (sub.tier === "free") return true
      if (sub.status !== "active") return false
      if (!sub.currentPeriodEnd) return true
      return new Date(sub.currentPeriodEnd) > new Date()
    })

    const getTier = Effect.fn("SubscriptionManager.getTier")(function* () {
      const sub = yield* readSubscriptionFile()
      return sub.tier
    })

    const canAccessMode = Effect.fn("SubscriptionManager.canAccessMode")(function* (mode: string) {
      const sub = yield* readSubscriptionFile()
      const requiredTier = MODE_TIER_REQUIREMENTS[mode] ?? "free"
      return isTierAtLeast(sub.tier, requiredTier)
    })

    const getUpgradeOptions = Effect.fn("SubscriptionManager.getUpgradeOptions")(function* () {
      const sub = yield* readSubscriptionFile()
      const currentIndex = getTierIndex(sub.tier)
      return TIER_HIERARCHY.slice(currentIndex + 1)
    })

    const isExpired = Effect.fn("SubscriptionManager.isExpired")(function* () {
      const sub = yield* readSubscriptionFile()
      if (sub.tier === "free") return false
      if (!sub.currentPeriodEnd) return false
      return new Date(sub.currentPeriodEnd) < new Date()
    })

    return Service.of({
      getSubscription,
      isActive,
      getTier,
      canAccessMode,
      getUpgradeOptions,
      isExpired,
    })
  }),
)

export { layer }
export const node = layer

export * as SubscriptionManager from "./subscription-manager"
