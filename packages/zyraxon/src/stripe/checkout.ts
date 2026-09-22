import { Effect, Context, Layer } from "effect"
import path from "path"
import os from "os"
import fs from "fs/promises"

const SUBSCRIPTION_FILE = path.join(os.homedir(), ".zyraxon", "subscription.json")

export type SubscriptionTier = "free" | "pro" | "max" | "ultra"

export interface CheckoutSession {
  tier: SubscriptionTier
  priceId: string
  successUrl: string
  cancelUrl: string
}

export interface CheckoutResult {
  url: string
  sessionId: string
}

export interface Interface {
  readonly createCheckoutSession: (tier: SubscriptionTier) => Effect.Effect<CheckoutResult, Error>
  readonly getPaymentLinks: () => Effect.Effect<Record<SubscriptionTier, string>, Error>
  readonly getCurrentTier: () => Effect.Effect<SubscriptionTier, Error>
}

export class Service extends Context.Service<Service, Interface>()("@zyraxon/StripeCheckout") {}

const PRICE_IDS: Record<SubscriptionTier, string | undefined> = {
  free: undefined,
  pro: process.env.STRIPE_PRO_PRICE_ID,
  max: process.env.STRIPE_MAX_PRICE_ID,
  ultra: process.env.STRIPE_ULTRA_PRICE_ID,
}

const SUCCESS_URL = "https://zyraxonai.lovable.app/subscription/success"
const CANCEL_URL = "https://zyraxonai.lovable.app/subscription/cancel"

const PAYMENT_LINKS: Record<SubscriptionTier, string | undefined> = {
  free: undefined,
  pro: process.env.STRIPE_PRO_PAYMENT_LINK,
  max: process.env.STRIPE_MAX_PAYMENT_LINK,
  ultra: process.env.STRIPE_ULTRA_PAYMENT_LINK,
}

function readCurrentTier(): Effect.Effect<SubscriptionTier, Error> {
  return Effect.gen(function* () {
    try {
      const data = yield* Effect.tryPromise(() => fs.readFile(SUBSCRIPTION_FILE, "utf-8"))
      const parsed = JSON.parse(data) as { tier?: string }
      const tier = parsed.tier
      if (tier === "pro" || tier === "max" || tier === "ultra" || tier === "free") {
        return tier
      }
      return "free"
    } catch {
      return "free"
    }
  })
}

function validateTier(tier: SubscriptionTier): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const priceId = PRICE_IDS[tier]
    if (!priceId) {
      return yield* Effect.fail(new Error(`No price configured for tier: ${tier}`))
    }
    return priceId
  })
}

function generateSessionId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `cs_${timestamp}_${random}`
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const createCheckoutSession = Effect.fn("StripeCheckout.createCheckoutSession")(function* (
      tier: SubscriptionTier,
    ) {
      const priceId = yield* validateTier(tier)

      const sessionId = generateSessionId()
      const params = new URLSearchParams({
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        mode: "subscription",
        success_url: SUCCESS_URL,
        cancel_url: CANCEL_URL,
        "metadata[tier]": tier,
      })

      const stripeSecretKey = process.env.STRIPE_SECRET_KEY
      if (!stripeSecretKey) {
        return yield* Effect.fail(new Error("STRIPE_SECRET_KEY not configured"))
      }

      const response = yield* Effect.tryPromise(() =>
        fetch("https://api.stripe.com/v1/checkout/sessions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        }),
      )

      if (!response.ok) {
        const errorText = yield* Effect.tryPromise(() => response.text())
        return yield* Effect.fail(new Error(`Stripe API error: ${errorText}`))
      }

      const session = (yield* Effect.tryPromise(() => response.json())) as { id: string; url: string }

      return {
        url: session.url,
        sessionId: session.id,
      }
    })

    const getPaymentLinks = Effect.fn("StripeCheckout.getPaymentLinks")(function* () {
      return {
        free: undefined,
        pro: PAYMENT_LINKS.pro ?? "",
        max: PAYMENT_LINKS.max ?? "",
        ultra: PAYMENT_LINKS.ultra ?? "",
      }
    })

    const getCurrentTier = Effect.fn("StripeCheckout.getCurrentTier")(function* () {
      return yield* readCurrentTier()
    })

    return Service.of({
      createCheckoutSession,
      getPaymentLinks,
      getCurrentTier,
    })
  }),
)

export { layer }
export const node = layer

export * as StripeCheckout from "./checkout"
