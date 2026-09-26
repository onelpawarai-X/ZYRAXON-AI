import { createSignal, For, Show } from "solid-js"
import {
  loadSubState,
  activateWithCode,
  activateTier,
  resetToFree,
  lockSubscription,
  getDaysRemaining,
  openStripeCheckout,
  isStripeReady,
  isAdminUnlocked,
  setAdminUnlocked,
  TIER_ORDER,
  SUBSCRIPTION_PLANS,
  type SubscriptionTier,
  type SubscriptionState,
} from "@/utils/subscription-store"

const TIER_COLORS: Record<SubscriptionTier, string> = {
  free: "#64748b",
  pro: "#00ff88",
  max: "#a78bfa",
  ultra: "#fb923c",
}

const TIER_DURATION: Record<string, { label: string; price: number }> = {
  pro: { label: "15 Days", price: 5 },
  max: { label: "2 Months", price: 15 },
  ultra: { label: "1 Year", price: 99 },
}

export function SettingsSubscription() {
  const [state, setState] = createSignal<SubscriptionState>(loadSubState())
  const [code, setCode] = createSignal("")
  const [codeMessage, setCodeMessage] = createSignal("")
  const [showSuccess, setShowSuccess] = createSignal(false)

  const [zyOpen, setZyOpen] = createSignal(false)
  const [zyInput, setZyInput] = createSignal("")
  const [adminOpen, setAdminOpen] = createSignal(isAdminUnlocked())
  const [adminTier, setAdminTier] = createSignal("")
  const [adminMsg, setAdminMsg] = createSignal("")

  const currentTier = (): SubscriptionTier => state().tier
  const currentPlan = () => SUBSCRIPTION_PLANS[state().tier]
  const daysRemaining = () => getDaysRemaining(state())

  function handleZySubmit() {
    if (zyInput().trim().toUpperCase() === "ZYRAXON") {
      setAdminUnlocked(true)
      setAdminOpen(true)
      setZyOpen(false)
      setZyInput("")
    }
  }

  function handleAdminUnlock() {
    const tier = adminTier().trim().toLowerCase()
    if (tier === "unlock") {
      setAdminUnlocked(true)
      setAdminOpen(true)
      setAdminMsg("Admin panel unlocked!")
    } else if (tier === "lock") {
      const newState = lockSubscription()
      setState(newState)
      setAdminMsg("All subscriptions locked to Free!")
    } else if (["pro", "max", "ultra"].includes(tier)) {
      const newState = activateTier(tier as SubscriptionTier)
      setState(newState)
      setAdminMsg(`${SUBSCRIPTION_PLANS[tier as SubscriptionTier].name} activated!`)
    } else {
      setAdminMsg("Invalid. Use: UNLOCK, PRO, MAX, ULTRA, LOCK")
    }
    setAdminTier("")
    setTimeout(() => setAdminMsg(""), 3000)
  }

  function handleActivateCode() {
    const result = activateWithCode(code())
    setCodeMessage(result.message)
    setState(result.state)
    if (result.success) {
      setCode("")
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    }
    setTimeout(() => setCodeMessage(""), 5000)
  }

  function handleStripePay(tier: SubscriptionTier) {
    if (isStripeReady()) {
      openStripeCheckout(tier)
    } else {
      setCodeMessage("Stripe not configured yet. Use secret code to activate.")
      setTimeout(() => setCodeMessage(""), 3000)
    }
  }

  function handleReset() {
    const newState = resetToFree()
    setState(newState)
  }

  return (
    <div class="mt-4 space-y-5">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-[var(--text-strong)]">Subscription Plans</h2>
          <p class="text-xs text-[var(--text-weak)] mt-1">Choose the plan that fits your needs.</p>
        </div>
        <div class="relative">
          <button
            onClick={() => { if (!zyOpen()) setZyInput(""); setZyOpen(!zyOpen()) }}
            class="px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider transition-all duration-200"
            classList={{
              "bg-orange-500 text-black": zyOpen(),
              "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60": !zyOpen(),
            }}
          >
            ADMIN
          </button>
          <Show when={zyOpen()}>
            <div class="absolute top-full right-0 mt-2 w-64 rounded-xl p-3 z-50"
              style={{
                "background": "rgba(15,15,30,0.97)",
                "backdrop-filter": "blur(24px)",
                "border": "1px solid rgba(255,255,255,0.1)",
                "box-shadow": "0 12px 40px rgba(0,0,0,0.6)",
              }}>
              <div class="text-[11px] text-white/50 mb-2 font-medium">Enter admin access code</div>
              <div class="flex gap-2">
                <input
                  type="password"
                  value={zyInput()}
                  onInput={(e) => setZyInput(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleZySubmit() }}
                  placeholder="Access code"
                  autofocus
                  class="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-black/40 text-white border border-white/10 focus:outline-none focus:border-white/30 placeholder:text-white/20"
                />
                <button
                  onClick={handleZySubmit}
                  class="px-4 py-2 rounded-lg text-[11px] font-bold bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  Unlock
                </button>
              </div>
            </div>
          </Show>
        </div>
      </div>

      {/* Admin Panel */}
      <Show when={zyOpen() && adminOpen()}>
        <div class="rounded-xl p-4 border border-white/10"
          style={{
            "background": "rgba(255,255,255,0.03)",
            "backdrop-filter": "blur(16px)",
          }}>
          <div class="text-xs font-bold text-white/70 mb-2">Admin Control Panel</div>
          <p class="text-[11px] text-white/40 mb-2">Type tier name + Enter to activate. Type LOCK to disable.</p>
          <div class="flex gap-2 mb-2">
            <input
              type="text"
              value={adminTier()}
              onInput={(e) => setAdminTier(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdminUnlock() }}
              placeholder="UNLOCK / PRO / MAX / ULTRA / LOCK"
              class="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-black/40 text-white border border-white/10 focus:outline-none focus:border-white/30 placeholder:text-white/20"
            />
            <button
              onClick={handleAdminUnlock}
              class="px-4 py-2 rounded-lg text-[11px] font-bold bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              Set
            </button>
          </div>
          <Show when={adminMsg()}>
            <div class="px-3 py-1.5 rounded-lg text-xs"
              classList={{
                "bg-red-500/15 text-red-400": adminMsg().includes("locked") || adminMsg().includes("Lock"),
                "bg-white/10 text-white/70": !adminMsg().includes("locked") && !adminMsg().includes("Lock"),
              }}>
              {adminMsg()}
            </div>
          </Show>
        </div>
      </Show>

      {/* Current Plan Badge */}
      <div class="rounded-xl p-4 border border-white/5"
        style={{
          "background": `linear-gradient(135deg, ${TIER_COLORS[currentTier()]}08, transparent)`,
        }}>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
            style={{
              "background": `${TIER_COLORS[currentTier()]}15`,
              "color": TIER_COLORS[currentTier()],
              "border": `1px solid ${TIER_COLORS[currentTier()]}25`,
            }}>
            {currentPlan().name[0]}
          </div>
          <div class="flex-1">
            <div class="text-sm font-bold text-[var(--text-strong)]">
              Current Plan: {currentPlan().name}
              <Show when={daysRemaining() !== null}>
                <span class="text-[11px] text-[var(--text-weak)] ml-2 font-normal">{daysRemaining()} days remaining</span>
              </Show>
              <Show when={!daysRemaining() && currentTier() !== "free"}>
                <span class="text-[11px] text-emerald-400 ml-2 font-normal">Permanent unlock</span>
              </Show>
            </div>
            <div class="text-xs text-[var(--text-weak)] mt-0.5">
              {currentPlan().toolCount} tools · {currentPlan().maxAgents === -1 ? "Unlimited" : currentPlan().maxAgents} agents · {currentPlan().memoryOptimization}
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <For each={TIER_ORDER}>
          {(tierId) => {
            const plan = SUBSCRIPTION_PLANS[tierId]
            const color = TIER_COLORS[tierId]
            const isCurrent = currentTier() === tierId
            return (
              <div
                class="relative rounded-2xl p-4 transition-all duration-300 flex flex-col"
                style={{
                  "background": isCurrent ? `${color}08` : "rgba(255,255,255,0.02)",
                  "border": `1px solid ${isCurrent ? `${color}30` : "rgba(255,255,255,0.05)"}`,
                }}
              >
                <Show when={isCurrent}>
                  <div class="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-black"
                    style={{ background: color }}>
                    Current
                  </div>
                </Show>

                <div class="text-base font-bold mb-1" style={{ color: color }}>{plan.name}</div>
                <div class="text-xl font-extrabold text-[var(--text-strong)] mb-1">
                  ${plan.price}
                  <span class="text-[11px] font-normal text-[var(--text-weak)] ml-1">
                    {tierId === "free" ? "/forever" : tierId === "pro" ? "/15 days" : tierId === "max" ? "/2 months" : "/year"}
                  </span>
                </div>
                <div class="text-[11px] text-[var(--text-weak)] mb-2">{plan.description}</div>
                <div class="text-[11px] text-[var(--text-weak)] mb-2">
                  {plan.toolCount} tools · {plan.maxAgents === -1 ? "Unlimited" : plan.maxAgents} agents
                </div>

                <div class="flex-1">
                  <For each={plan.features.slice(0, 5)}>
                    {(f) => (
                      <div class="text-[11px] text-[var(--text-weak)] py-0.5 flex items-center gap-1.5">
                        <span style={{ color: color }}>{">"}</span> {f}
                      </div>
                    )}
                  </For>
                  <Show when={plan.features.length > 5}>
                    <div class="text-[10px] text-[var(--text-weak)] mt-1 opacity-60">
                      +{plan.features.length - 5} more features
                    </div>
                  </Show>
                </div>

                <Show when={!isCurrent && tierId !== "free"}>
                  <div class="mt-3">
                    <button
                      onClick={() => handleStripePay(tierId)}
                      class="w-full py-2.5 rounded-lg text-[12px] font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        "background": color,
                        "color": "#000",
                      }}
                    >
                      Upgrade to {plan.name} — ${TIER_DURATION[tierId]?.price ?? plan.price}/{TIER_DURATION[tierId]?.label ?? "month"}
                    </button>
                  </div>
                </Show>

                <Show when={isCurrent && tierId === "free"}>
                  <button
                    disabled
                    class="w-full mt-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-white/30 cursor-default"
                  >
                    Active Plan
                  </button>
                </Show>
              </div>
            )
          }}
        </For>
      </div>

      {/* Secret Code Activation */}
      <div class="rounded-xl p-4"
        style={{
          "background": "rgba(255,255,255,0.02)",
          "border": "1px solid rgba(255,255,255,0.05)",
        }}>
        <h3 class="text-sm font-bold text-[var(--text-strong)] mb-1">Secret Code Activation</h3>
        <p class="text-[11px] text-[var(--text-weak)] mb-3">Enter a secret code for permanent unlock — no expiry, no limitations</p>
        <p class="text-[11px] text-[var(--text-weak)] mb-3">
          Need a code? Join{" "}
          <a href="https://zyraxon-group-x.lovable.app/" target="_blank" rel="noopener noreferrer" class="text-[#00D4FF] underline hover:opacity-80">
            ZYRAXON GROUP X
          </a>{" "}
          to get one.
        </p>
        <div class="flex gap-2">
          <input
            type="text"
            value={code()}
            onInput={(e) => setCode(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleActivateCode() }}
            placeholder="Enter access code"
            class="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-black/30 text-[var(--text-strong)] border border-white/10 focus:outline-none focus:border-white/30 placeholder:text-white/20"
          />
          <button
            onClick={handleActivateCode}
            class="px-4 py-2 rounded-lg text-xs font-bold bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            Activate
          </button>
        </div>
        <Show when={codeMessage()}>
          <div class="mt-2 px-3 py-1.5 rounded-lg text-xs"
            classList={{
              "bg-red-500/15 text-red-400": codeMessage().includes("Invalid") || codeMessage().includes("not configured"),
              "bg-white/10 text-white/70": !codeMessage().includes("Invalid") && !codeMessage().includes("not configured"),
            }}>
            {codeMessage()}
          </div>
        </Show>
        <Show when={showSuccess()}>
          <div class="mt-2 px-3 py-1.5 rounded-lg text-xs bg-emerald-500/20 text-emerald-400 font-semibold">
            Tier upgraded! All {currentPlan().toolCount} tools unlocked.
          </div>
        </Show>
      </div>

      {/* Subscription Details */}
      <Show when={currentTier() !== "free"}>
        <div class="rounded-xl p-4"
          style={{
            "background": "rgba(255,255,255,0.02)",
            "border": "1px solid rgba(255,255,255,0.05)",
          }}>
          <div class="text-xs text-[var(--text-weak)] mb-2">Subscription Details</div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div><span class="text-[var(--text-weak)]">Plan: </span><span class="text-[var(--text-strong)] font-semibold">{currentPlan().name}</span></div>
            <div><span class="text-[var(--text-weak)]">Price: </span><span class="text-[var(--text-strong)]">${currentPlan().price}</span></div>
            <div><span class="text-[var(--text-weak)]">Tools: </span><span class="text-[var(--text-strong)]">{currentPlan().toolCount}</span></div>
            <div><span class="text-[var(--text-weak)]">Memory: </span><span class="text-[var(--text-strong)]">{currentPlan().memoryOptimization}</span></div>
            <div><span class="text-[var(--text-weak)]">Expiry: </span><span class="text-[var(--text-strong)]">{daysRemaining() !== null ? `${daysRemaining()} days` : "Never (permanent)"}</span></div>
            <div><span class="text-[var(--text-weak)]">Type: </span><span class="text-[var(--text-strong)]">{state().secretCode ? "Secret Code" : state().stripeSessionId ? "Stripe" : "Free"}</span></div>
          </div>
        </div>
      </Show>

      {/* Reset */}
      <button
        onClick={handleReset}
        class="w-full py-2 rounded-lg text-[11px] text-white/30 border border-white/5 hover:bg-white/5 hover:text-white/50 transition-all"
      >
        Reset to Free
      </button>
    </div>
  )
}
