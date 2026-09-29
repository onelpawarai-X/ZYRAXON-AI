// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import {
  type SubscriptionTier,
  type SubscriptionState,
  SUBSCRIPTION_PLANS,
  TIER_ORDER,
  hasAccess,
} from "@/context/subscription-types"

const ADMIN_AUTH_KEY = "zyraxon-admin-auth"

// Subscription state lives in @/context/subscription — the single store every consumer
// reads. This module only holds helpers that touch their own browser storage.
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
    return
  }
  // Fallback: show instructions to configure Stripe
  alert(
    `Stripe Payment Link not configured for ${plan.name} tier.\n\n` +
      `To set up Stripe payments:\n` +
      `1. Go to https://dashboard.stripe.com/payment-links\n` +
      `2. Create a payment link for $${plan.price} (${plan.durationDays || "permanent"})\n` +
      `3. Add the link to your .env file:\n` +
      `   VITE_STRIPE_${tier.toUpperCase()}_LINK=your-link-here\n` +
      `4. Restart the app`,
  )
}

export function isStripeReady(): boolean {
  // Check if ANY Stripe payment link is configured
  const proLink = import.meta.env.VITE_STRIPE_PRO_LINK
  const maxLink = import.meta.env.VITE_STRIPE_MAX_LINK
  const ultraLink = import.meta.env.VITE_STRIPE_ULTRA_LINK
  return (
    (proLink && !proLink.includes("your-")) ||
    (maxLink && !maxLink.includes("your-")) ||
    (ultraLink && !ultraLink.includes("your-"))
  )
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
    return
  }
  localStorage.removeItem(ADMIN_AUTH_KEY)
}

export { TIER_ORDER, SUBSCRIPTION_PLANS, hasAccess }
export type { SubscriptionTier, SubscriptionState }
