// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSubscription } from "@/context/subscription"
import {
  openStripeCheckout,
  isStripeReady,
  isAdminUnlocked,
  setAdminUnlocked,
  TIER_ORDER,
  SUBSCRIPTION_PLANS,
  type SubscriptionTier,
} from "@/utils/subscription-store"

const TIER_COLORS: Record<SubscriptionTier, string> = {
  free: "#64748b",
  pro: "#00ff88",
  max: "#a78bfa",
  ultra: "#fb923c",
}

const TIER_DURATION: Record<string, { labelKey: string; price: number }> = {
  pro: { labelKey: "subscription.duration.days15", price: 5 },
  max: { labelKey: "subscription.duration.months2", price: 15 },
  ultra: { labelKey: "subscription.duration.year1", price: 99 },
}

/** Which tone an activation message carries, so the badge colour is driven by the
 *  result rather than by matching words inside a translated string. */
type CodeTone = "error" | "success" | "info"

export function SettingsSubscription() {
  const subscription = useSubscription()
  const language = useLanguage()
  const t = (key: string, params?: Record<string, string | number>) => language.t(key as never, params as never)
  const [code, setCode] = createSignal("")
  const [codeMessage, setCodeMessage] = createSignal("")
  const [codeTone, setCodeTone] = createSignal<CodeTone>("info")
  const [showSuccess, setShowSuccess] = createSignal(false)
  const [isVerifying, setIsVerifying] = createSignal(false)

  const [zyOpen, setZyOpen] = createSignal(false)
  const [zyInput, setZyInput] = createSignal("")
  const [adminOpen, setAdminOpen] = createSignal(isAdminUnlocked())
  const [adminTier, setAdminTier] = createSignal("")
  const [adminMsg, setAdminMsg] = createSignal("")

  const currentTier = (): SubscriptionTier => subscription.tier()
  const currentPlan = () => SUBSCRIPTION_PLANS[currentTier()]
  const daysRemaining = () => subscription.daysRemaining()

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
      setAdminMsg(t("subscription.admin.msg.unlocked"))
    } else if (tier === "lock") {
      subscription.resetToFree()
      setAdminMsg(t("subscription.admin.msg.locked"))
    } else if (["pro", "max", "ultra"].includes(tier)) {
      subscription.activateTier(tier as SubscriptionTier, null)
      setAdminMsg(t("subscription.admin.msg.activated", { plan: SUBSCRIPTION_PLANS[tier as SubscriptionTier].name }))
    } else {
      setAdminMsg(t("subscription.admin.msg.invalid"))
    }
    setAdminTier("")
    setTimeout(() => setAdminMsg(""), 3000)
  }

  async function handleActivateCode() {
    const val = code().trim()
    if (!val) {
      setCodeTone("error")
      setCodeMessage(t("subscription.license.error.empty"))
      return
    }

    setIsVerifying(true)
    setCodeTone("info")
    setCodeMessage(t("subscription.license.verifying.server"))

    try {
      const result = await subscription.activateWithCode(val)
      setCodeTone(result.success ? "success" : "error")
      setCodeMessage(t(result.messageKey, result.params))
      if (result.success) {
        setCode("")
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 4000)
      }
    } finally {
      setIsVerifying(false)
      setTimeout(() => setCodeMessage(""), 6000)
    }
  }

  function handleStripePay(tier: SubscriptionTier) {
    if (isStripeReady()) {
      openStripeCheckout(tier)
      return
    }
    setCodeTone("info")
    setCodeMessage(t("subscription.stripe.notConfigured"))
    setTimeout(() => setCodeMessage(""), 3000)
  }

  function handleReset() {
    subscription.resetToFree()
    setAdminUnlocked(false)
  }

  return (
    <div class="mt-4 space-y-5">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-[var(--text-strong)]">{t("subscription.plans")}</h2>
          <p class="text-xs text-[var(--text-weak)] mt-1">{t("subscription.plans.description")}</p>
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
              <div class="text-[11px] text-white/50 mb-2 font-medium">{t("subscription.admin.code")}</div>
              <div class="flex gap-2">
                <input
                  type="password"
                  value={zyInput()}
                  onInput={(e) => setZyInput(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleZySubmit() }}
                  placeholder={t("subscription.admin.placeholder")}
                  autofocus
                  class="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-black/40 text-white border border-white/10 focus:outline-none focus:border-white/30 placeholder:text-white/20"
                />
                <button
                  onClick={handleZySubmit}
                  class="px-4 py-2 rounded-lg text-[11px] font-bold bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  {t("subscription.admin.unlock")}
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
          <div class="text-xs font-bold text-white/70 mb-2">{t("subscription.admin.panel")}</div>
          <p class="text-[11px] text-white/40 mb-2">{t("subscription.admin.hint")}</p>
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
              {t("subscription.admin.set")}
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

      <Show when={subscription.restoreProblem()}>
        {(problem) => (
          <div class="rounded-xl p-3 text-xs border border-red-500/20 bg-red-500/10 text-red-300">
            {t("subscription.restore.problem", { reason: problem() })}
          </div>
        )}
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
              {t("subscription.currentPlan", { plan: currentPlan().name })}
              <Show when={daysRemaining() !== null}>
                <span class="text-[11px] text-[var(--text-weak)] ml-2 font-normal">{t("subscription.daysRemaining", { days: daysRemaining() ?? 0 })}</span>
              </Show>
              <Show when={subscription.isPermanentUnlock()}>
                <span class="text-[11px] text-emerald-400 ml-2 font-normal">{t("subscription.admin.permanentUnlock")}</span>
              </Show>
            </div>
            <div class="text-xs text-[var(--text-weak)] mt-0.5">
              {t("subscription.plan.summary", {
                tools: currentPlan().toolCount,
                agents: currentPlan().maxAgents === -1 ? t("subscription.unlimited") : currentPlan().maxAgents,
                memory: currentPlan().memoryOptimization,
              })}
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
                    {t("subscription.badge.current")}
                  </div>
                </Show>

                <div class="text-base font-bold mb-1" style={{ color: color }}>{plan.name}</div>
                <div class="text-xl font-extrabold text-[var(--text-strong)] mb-1">
                  ${plan.price}
                  <span class="text-[11px] font-normal text-[var(--text-weak)] ml-1">
                    {tierId === "free" ? t("subscription.duration.forever") : t(`subscription.duration.${tierId}`)}
                  </span>
                </div>
                <div class="text-[11px] text-[var(--text-weak)] mb-2">{plan.description}</div>
                <div class="text-[11px] text-[var(--text-weak)] mb-2">
                  {t("subscription.plan.summary", {
                    tools: plan.toolCount,
                    agents: plan.maxAgents === -1 ? t("subscription.unlimited") : plan.maxAgents,
                    memory: plan.memoryOptimization,
                  })}
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
                      {t("subscription.features.more", { count: plan.features.length - 5 })}
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
                      {t("subscription.cta.buy", {
                        plan: plan.name,
                        price: TIER_DURATION[tierId]?.price ?? plan.price,
                        label: TIER_DURATION[tierId] ? t(TIER_DURATION[tierId]!.labelKey) : t("subscription.duration.months2"),
                      })}
                    </button>
                  </div>
                </Show>

                <Show when={isCurrent && tierId === "free"}>
                  <button
                    disabled
                    class="w-full mt-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-white/30 cursor-default"
                  >
                    {t("subscription.badge.active")}
                  </button>
                </Show>
              </div>
            )
          }}
        </For>
      </div>

      {/* Secret Code Activation with Server Handshake */}
      <div class="rounded-xl p-4"
        style={{
          "background": "rgba(255,255,255,0.02)",
          "border": "1px solid rgba(255,255,255,0.05)",
        }}>
        <h3 class="text-sm font-bold text-[var(--text-strong)] mb-1">{t("subscription.license.title")}</h3>
        <p class="text-[11px] text-[var(--text-weak)] mb-3">{t("subscription.license.description")}</p>
        <p class="text-[11px] text-[var(--text-weak)] mb-3">
          {t("subscription.license.need.before")}{" "}
          <a href="https://zyraxon-group-x.lovable.app/payment" target="_blank" rel="noopener noreferrer" class="text-[#00D4FF] underline hover:opacity-80">
            {t("subscription.license.need.link")}
          </a>{" "}
          {t("subscription.license.need.after")}
        </p>
        <div class="flex gap-2">
          <input
            type="text"
            value={code()}
            onInput={(e) => setCode(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleActivateCode() }}
            placeholder={t("subscription.license.placeholder")}
            disabled={isVerifying()}
            class="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-black/30 text-[var(--text-strong)] border border-white/10 focus:outline-none focus:border-white/30 placeholder:text-white/20 disabled:opacity-50"
          />
          <button
            onClick={handleActivateCode}
            disabled={isVerifying()}
            class="px-4 py-2 rounded-lg text-xs font-bold bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            {isVerifying() ? t("subscription.license.verifying") : t("subscription.license.button")}
          </button>
        </div>
        <Show when={codeMessage()}>
          <div class="mt-2 px-3 py-1.5 rounded-lg text-xs"
            classList={{
              "bg-red-500/15 text-red-400": codeTone() === "error",
              "bg-emerald-500/15 text-emerald-300": codeTone() === "success",
              "bg-white/10 text-white/70": codeTone() === "info",
            }}>
            {codeMessage()}
          </div>
        </Show>
        <Show when={showSuccess()}>
          <div class="mt-2 px-3 py-1.5 rounded-lg text-xs bg-emerald-500/20 text-emerald-400 font-semibold">
            {t("subscription.license.toast", { tools: currentPlan().toolCount })}
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
          <div class="text-xs text-[var(--text-weak)] mb-2">{t("subscription.details")}</div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div><span class="text-[var(--text-weak)]">{t("subscription.details.plan")}</span><span class="text-[var(--text-strong)] font-semibold">{currentPlan().name}</span></div>
            <div><span class="text-[var(--text-weak)]">{t("subscription.details.price")}</span><span class="text-[var(--text-strong)]">${currentPlan().price}</span></div>
            <div><span class="text-[var(--text-weak)]">{t("subscription.details.tools")}</span><span class="text-[var(--text-strong)]">{currentPlan().toolCount}</span></div>
            <div><span class="text-[var(--text-weak)]">{t("subscription.details.memory")}</span><span class="text-[var(--text-strong)]">{currentPlan().memoryOptimization}</span></div>
            <div><span class="text-[var(--text-weak)]">{t("subscription.details.expiry")}</span><span class="text-[var(--text-strong)]">{daysRemaining() !== null ? t("subscription.daysRemaining", { days: daysRemaining() ?? 0 }) : t("subscription.details.never")}</span></div>
            <div><span class="text-[var(--text-weak)]">{t("subscription.details.type")}</span><span class="text-[var(--text-strong)]">{subscription.secretCode() ? t("subscription.type.cloud") : t("subscription.type.free")}</span></div>
          </div>
        </div>
      </Show>

      {/* Reset */}
      <button
        onClick={handleReset}
        class="w-full py-2 rounded-lg text-[11px] text-white/30 border border-white/5 hover:bg-white/5 hover:text-white/50 transition-all"
      >
        {t("subscription.reset")}
      </button>
    </div>
  )
}
