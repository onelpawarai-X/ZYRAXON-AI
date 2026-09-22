import { Effect, Context, Layer } from "effect"
import path from "path"
import os from "os"
import fs from "fs/promises"

const SUBSCRIPTION_FILE = path.join(os.homedir(), ".zyraxon", "subscription.json")

export interface SubscriptionData {
  tier: "free" | "pro" | "max" | "ultra"
  stripeSubscriptionId: string | null
  stripeCustomerId: string | null
  status: "active" | "canceled" | "past_due" | "unpaid" | "incomplete" | "trialing"
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  createdAt: string
  updatedAt: string
}

export interface WebhookEvent {
  id: string
  type: string
  data: {
    object: Record<string, unknown>
    previous_attributes?: Record<string, unknown>
  }
  created: number
}

export interface Interface {
  readonly handleWebhook: (event: WebhookEvent) => Effect.Effect<void, Error>
  readonly getSubscription: () => Effect.Effect<SubscriptionData, Error>
}

export class Service extends Context.Service<Service, Interface>()("@zyraxon/StripeWebhook") {}

const PRICE_TO_TIER: Record<string, SubscriptionData["tier"]> = {}

function loadPriceMapping(): Effect.Effect<void> {
  return Effect.gen(function* () {
    const proPriceId = process.env.STRIPE_PRO_PRICE_ID
    const maxPriceId = process.env.STRIPE_MAX_PRICE_ID
    const ultraPriceId = process.env.STRIPE_ULTRA_PRICE_ID

    if (proPriceId) PRICE_TO_TIER[proPriceId] = "pro"
    if (maxPriceId) PRICE_TO_TIER[maxPriceId] = "max"
    if (ultraPriceId) PRICE_TO_TIER[ultraPriceId] = "ultra"
  })
}

function readSubscription(): Effect.Effect<SubscriptionData, Error> {
  return Effect.gen(function* () {
    try {
      const data = yield* Effect.tryPromise(() => fs.readFile(SUBSCRIPTION_FILE, "utf-8"))
      return JSON.parse(data) as SubscriptionData
    } catch {
      return {
        tier: "free",
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        status: "incomplete",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }
  })
}

function writeSubscription(data: SubscriptionData): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const dir = path.dirname(SUBSCRIPTION_FILE)
    yield* Effect.tryPromise(() => fs.mkdir(dir, { recursive: true }))
    const updated = { ...data, updatedAt: new Date().toISOString() }
    yield* Effect.tryPromise(() => fs.writeFile(SUBSCRIPTION_FILE, JSON.stringify(updated, null, 2), "utf-8"))
  })
}

function extractPriceId(items: unknown): string | null {
  if (!items || typeof items !== "object") return null
  const itemsObj = items as Record<string, unknown>
  const data = itemsObj.data
  if (!Array.isArray(data) || data.length === 0) return null
  const firstItem = data[0] as Record<string, unknown>
  const price = firstItem.price
  if (!price || typeof price !== "object") return null
  const priceObj = price as Record<string, unknown>
  return typeof priceObj.id === "string" ? priceObj.id : null
}

function handleCheckoutCompleted(event: WebhookEvent): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const obj = event.data.object as Record<string, unknown>
    const mode = obj.mode
    if (mode !== "subscription") return

    const subscriptionId = typeof obj.subscription === "string" ? obj.subscription : null
    const customerId = typeof obj.customer === "string" ? obj.customer : null
    const metadata = obj.metadata as Record<string, string> | undefined
    const requestedTier = metadata?.tier as SubscriptionData["tier"] | undefined

    if (!subscriptionId || !customerId) return

    const existing = yield* readSubscription()
    const tier = requestedTier ?? "free"

    yield* writeSubscription({
      ...existing,
      tier,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    })
  })
}

function handleSubscriptionUpdated(event: WebhookEvent): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const obj = event.data.object as Record<string, unknown>
    const subscriptionId = typeof obj.id === "string" ? obj.id : null
    const status = typeof obj.status === "string" ? obj.status : null
    const cancelAtPeriodEnd = typeof obj.cancel_at_period_end === "boolean" ? obj.cancel_at_period_end : false

    if (!subscriptionId) return

    const items = obj.items as Record<string, unknown> | undefined
    const priceId = extractPriceId(items)
    const tier = priceId ? (PRICE_TO_TIER[priceId] ?? "free") : "free"

    const currentPeriodStart = typeof obj.current_period_start === "number"
      ? new Date(obj.current_period_start * 1000).toISOString()
      : null
    const currentPeriodEnd = typeof obj.current_period_end === "number"
      ? new Date(obj.current_period_end * 1000).toISOString()
      : null

    const existing = yield* readSubscription()
    if (existing.stripeSubscriptionId !== subscriptionId) return

    const mappedStatus: SubscriptionData["status"] =
      status === "active" ? "active" :
      status === "canceled" ? "canceled" :
      status === "past_due" ? "past_due" :
      status === "unpaid" ? "unpaid" :
      status === "incomplete" ? "incomplete" :
      status === "trialing" ? "trialing" :
      "incomplete"

    yield* writeSubscription({
      ...existing,
      tier: status === "canceled" ? "free" : tier,
      status: mappedStatus,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    })
  })
}

function handleSubscriptionDeleted(event: WebhookEvent): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const obj = event.data.object as Record<string, unknown>
    const subscriptionId = typeof obj.id === "string" ? obj.id : null

    if (!subscriptionId) return

    const existing = yield* readSubscription()
    if (existing.stripeSubscriptionId !== subscriptionId) return

    yield* writeSubscription({
      ...existing,
      tier: "free",
      status: "canceled",
      cancelAtPeriodEnd: false,
    })
  })
}

function handleInvoicePaymentSucceeded(event: WebhookEvent): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const obj = event.data.object as Record<string, unknown>
    const subscriptionId = typeof obj.subscription === "string"
      ? obj.subscription
      : (obj.parent as Record<string, unknown>)?.subscription_details
        ? ((obj.parent as Record<string, unknown>).subscription_details as Record<string, unknown>).subscription as string
        : null

    if (!subscriptionId) return

    const existing = yield* readSubscription()
    if (existing.stripeSubscriptionId !== subscriptionId) return

    yield* writeSubscription({
      ...existing,
      status: "active",
    })
  })
}

function handleInvoicePaymentFailed(event: WebhookEvent): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const obj = event.data.object as Record<string, unknown>
    const subscriptionId = typeof obj.subscription === "string"
      ? obj.subscription
      : (obj.parent as Record<string, unknown>)?.subscription_details
        ? ((obj.parent as Record<string, unknown>).subscription_details as Record<string, unknown>).subscription as string
        : null

    if (!subscriptionId) return

    const existing = yield* readSubscription()
    if (existing.stripeSubscriptionId !== subscriptionId) return

    yield* writeSubscription({
      ...existing,
      status: "past_due",
    })
  })
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    yield* loadPriceMapping()

    const handleWebhook = Effect.fn("StripeWebhook.handleWebhook")(function* (event: WebhookEvent) {
      switch (event.type) {
        case "checkout.session.completed":
          yield* handleCheckoutCompleted(event)
          break
        case "customer.subscription.created":
        case "customer.subscription.updated":
          yield* handleSubscriptionUpdated(event)
          break
        case "customer.subscription.deleted":
          yield* handleSubscriptionDeleted(event)
          break
        case "invoice.payment_succeeded":
          yield* handleInvoicePaymentSucceeded(event)
          break
        case "invoice.payment_failed":
          yield* handleInvoicePaymentFailed(event)
          break
      }
    })

    const getSubscription = Effect.fn("StripeWebhook.getSubscription")(function* () {
      return yield* readSubscription()
    })

    return Service.of({
      handleWebhook,
      getSubscription,
    })
  }),
)

export { layer }
export const node = layer

export * as StripeWebhook from "./webhook-handler"
