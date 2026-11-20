# Stripe Payment Integration — Complete Setup Guide

## Section 1: Prerequisites

### 1.1 Create a Stripe Account
1. Go to https://dashboard.stripe.com/register
2. Sign up with your email and complete verification
3. Activate your account (test mode is available immediately)

### 1.2 API Keys Needed
You need three keys from Stripe Dashboard:
- **Publishable Key** (`pk_test_xxx` or `pk_live_xxx`) — Used in client-side code
- **Secret Key** (`sk_test_xxx` or `sk_live_xxx`) — Used in server-side code only
- **Webhook Signing Secret** (`whsec_xxx`) — Used to verify webhook authenticity

### 1.3 Where to Find Keys
1. Go to https://dashboard.stripe.com/apikeys
2. Copy your **Publishable key** and **Secret key**
3. For webhook secret: see Section 4 below

---

## Section 2: Products & Prices

### 2.1 Create Products
1. Go to https://dashboard.stripe.com/products
2. Click **+ Create product** for each tier:

#### ZYRAXON Pro
- Name: `ZYRAXON Pro`
- Description: `Professional AI agent mode with strict quality enforcement and security scanning`
- Click **Add price**
- Price: `$5.00`
- Recurring: `Every 15 days`
- Click **Add product**

#### ZYRAXON Max
- Name: `ZYRAXON Max`
- Description: `Advanced AI agent mode with all tools, subagent spawning, and self-evolution`
- Click **Add price**
- Price: `$15.00`
- Recurring: `Every 2 months`
- Click **Add product**

#### ZYRAXON Ultra
- Name: `ZYRAXON Ultra`
- Description: `Maximum power mode with all 8 ULTRA tools, autonomous operation, and tool synthesis`
- Click **Add price**
- Price: `$99.00`
- Recurring: `Every 1 year`
- Click **Add product**

### 2.2 Note Price IDs
After creating each product, copy the Price ID (starts with `price_`):
- ZYRAXON Pro: `price_xxx` (save as `STRIPE_PRO_PRICE_ID`)
- ZYRAXON Max: `price_xxx` (save as `STRIPE_MAX_PRICE_ID`)
- ZYRAXON Ultra: `price_xxx` (save as `STRIPE_ULTRA_PRICE_ID`)

---

## Section 3: Payment Links

### 3.1 Create Payment Links
1. Go to https://dashboard.stripe.com/payment-links
2. Click **+ New** for each product

#### ZYRAXON Pro Payment Link
1. Select **ZYRAXON Pro** product
2. Set the price to the recurring price created above
3. Under **After payment**, set redirect URL:
   ```
   https://zyraxonai.lovable.app/subscription/success
   ```
4. Click **Create link**
5. Copy the payment link URL

#### ZYRAXON Max Payment Link
1. Repeat steps above for ZYRAXON Max product
2. Same redirect URL: `https://zyraxonai.lovable.app/subscription/success`
3. Copy the payment link URL

#### ZYRAXON Ultra Payment Link
1. Repeat steps above for ZYRAXON Ultra product
2. Same redirect URL: `https://zyraxonai.lovable.app/subscription/success`
3. Copy the payment link URL

### 3.2 Note Payment Link URLs
Save these URLs for embedding in your application:
- Pro: `https://buy.stripe.com/xxx`
- Max: `https://buy.stripe.com/xxx`
- Ultra: `https://buy.stripe.com/xxx`

---

## Section 4: Webhook Setup

### 4.1 Create Webhook Endpoint
1. Go to https://dashboard.stripe.com/webhooks
2. Click **+ Add endpoint**
3. Enter your endpoint URL:
   ```
   https://your-server.com/api/stripe/webhook
   ```
   For local testing, use Stripe CLI (see Section 7.2)

### 4.2 Select Events to Listen
Add these events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

### 4.3 Get Webhook Signing Secret
1. After creating the webhook, click on it
2. Click **Reveal** under "Signing secret"
3. Copy the secret (starts with `whsec_`)
4. Save as `STRIPE_WEBHOOK_SECRET`

---

## Section 5: Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_signing_secret_here

# Stripe Price IDs (from Section 2.2)
STRIPE_PRO_PRICE_ID=price_xxx
STRIPE_MAX_PRICE_ID=price_xxx
STRIPE_ULTRA_PRICE_ID=price_xxx

# Optional: Stripe API version pinning
STRIPE_API_VERSION=2024-12-18.acacia
```

**IMPORTANT**: Never commit these values to version control. Use `.env` files locally and environment variables in production.

---

## Section 6: Code Integration Points

### 6.1 Server-Side (Webhook Handler)
The webhook handler reads from environment variables:
```typescript
const stripeSecretKey = process.env.STRIPE_SECRET_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
```

### 6.2 Client-Side (Checkout)
The publishable key is loaded from environment:
```typescript
const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY
```

### 6.3 Price Configuration
Prices are read from environment, never hardcoded:
```typescript
const PRICE_IDS = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  max: process.env.STRIPE_MAX_PRICE_ID,
  ultra: process.env.STRIPE_ULTRA_PRICE_ID,
}
```

### 6.4 Subscription File Location
Subscriptions are stored locally at:
```
~/.zyraxon/subscription.json
```

---

## Section 7: Testing

### 7.1 Test with Stripe Test Cards
Use these test card numbers:
- **Success**: `4242 4242 4242 4242`
- **Requires authentication**: `4000 0025 0000 3155`
- **Declined**: `4000 0000 0000 0002`
- **Insufficient funds**: `4000 0000 0000 9995`

Test card details:
- Expiry: Any future date (e.g., `12/34`)
- CVC: Any 3 digits (e.g., `123`)
- ZIP: Any valid ZIP (e.g., `12345`)

### 7.2 Test Webhooks Locally with Stripe CLI
1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login: `stripe login`
3. Forward webhooks to local server:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
4. The CLI will give you a webhook signing secret (different from Dashboard)
5. Use this secret for local testing

### 7.3 Test Subscription Lifecycle
1. **Create**: Use test card to subscribe to a plan
2. **Upgrade**: Subscribe to higher tier (proration applies)
3. **Downgrade**: Subscribe to lower tier
4. **Cancel**: Cancel subscription from customer portal
5. **Expiry**: Wait for period to end or use Stripe CLI to trigger

### 7.4 Verify Webhook Events
Check your server logs for these events:
- `checkout.session.completed` — Subscription activated
- `customer.subscription.updated` — Tier changed
- `customer.subscription.deleted` — Subscription cancelled
- `invoice.payment_succeeded` — Payment received
- `invoice.payment_failed` — Payment failed

---

## Section 8: Going Live

### 8.1 Switch to Live Keys
1. In Stripe Dashboard, toggle from "Test mode" to "Live mode" (top right)
2. Get your live API keys from https://dashboard.stripe.com/apikeys
3. Update environment variables with live keys:
   ```
   STRIPE_SECRET_KEY=sk_live_xxx
   STRIPE_PUBLISHABLE_KEY=pk_live_xxx
   ```

### 8.2 Update Webhook URL
1. Go to https://dashboard.stripe.com/webhooks
2. Edit your webhook endpoint
3. Update URL to production: `https://your-production-server.com/api/stripe/webhook`
4. Get the new webhook signing secret for production

### 8.3 Enable Live Payment Links
1. Go to https://dashboard.stripe.com/payment-links
2. Each payment link has a "Test mode" and "Live mode" URL
3. Use the live mode URLs in your application

### 8.4 Production Checklist
- [ ] All environment variables set with live keys
- [ ] Webhook endpoint is accessible from internet
- [ ] Webhook signing secret is correct for production
- [ ] Payment links are in live mode
- [ ] Test a real payment with a small amount
- [ ] Verify subscription lifecycle works end-to-end
- [ ] Monitor webhook delivery in Stripe Dashboard

---

## Troubleshooting

### Webhook Not Receiving Events
1. Check webhook URL is accessible: `curl https://your-server.com/api/stripe/webhook`
2. Verify signing secret matches
3. Check Stripe Dashboard → Webhooks → Recent deliveries for errors

### Payment Not Completing
1. Verify test card number is correct
2. Check if Stripe account is activated
3. Ensure correct price IDs are configured

### Subscription Not Updating
1. Check webhook events are being received
2. Verify subscription.json is writable
3. Check server logs for processing errors
