import { createSignal, createEffect, For, Show } from "solid-js"
import {
  loadSubState,
  activateWithCode,
  activateTier,
  resetToFree,
  getDaysRemaining,
  openStripeCheckout,
  TIER_ORDER,
  SUBSCRIPTION_PLANS,
  type SubscriptionTier,
  type SubscriptionState,
} from "@/utils/subscription-store"

const TIER_COLORS: Record<SubscriptionTier, { bg: string; border: string; text: string; glow: string; btn: string }> = {
  free: { bg: "#1a1a2e", border: "#333366", text: "#8888aa", glow: "transparent", btn: "#333366" },
  pro: { bg: "#0d2818", border: "#00ff88", text: "#00ff88", glow: "rgba(0,255,136,0.3)", btn: "#00ff88" },
  max: { bg: "#1a0d28", border: "#8b5cf6", text: "#8b5cf6", glow: "rgba(139,92,246,0.3)", btn: "#8b5cf6" },
  ultra: { bg: "#281a0d", border: "#ff6b00", text: "#ff6b00", glow: "rgba(255,107,0,0.3)", btn: "#ff6b00" },
}

const TIER_ICONS: Record<SubscriptionTier, string> = {
  free: "\u26A1",
  pro: "\uD83D\uDE80",
  max: "\u2B50",
  ultra: "\uD83D\uDC51",
}

export function SettingsSubscription() {
  const [state, setState] = createSignal<SubscriptionState>(loadSubState())
  const [code, setCode] = createSignal("")
  const [codeMessage, setCodeMessage] = createSignal("")
  const [showSuccess, setShowSuccess] = createSignal(false)

  const currentTier = (): SubscriptionTier => state().tier
  const currentPlan = () => SUBSCRIPTION_PLANS[state().tier]
  const daysRemaining = () => getDaysRemaining(state())

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

  function handleActivateTier(tier: SubscriptionTier) {
    const newState = activateTier(tier)
    setState(newState)
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 3000)
  }

  function handleReset() {
    const newState = resetToFree()
    setState(newState)
  }

  function handleStripeClick(tier: SubscriptionTier) {
    openStripeCheckout(tier)
  }

  return (
    <div class="settings-v2-tab-header" style={{ "margin-top": "16px" }}>
      <div style={{ "padding-bottom": "12px" }}>
        <h2 style={{ "font-size": "18px", "font-weight": "700", color: "var(--text-strong)", margin: "0 0 4px 0" }}>
          Subscription Plans
        </h2>
        <p style={{ "font-size": "12px", color: "var(--text-weak)", margin: 0 }}>
          Choose the plan that fits your needs. Secret codes unlock permanently.
        </p>
      </div>
      <div class="settings-v2-tab-body">
        <div style={{ "margin-bottom": "20px", padding: "12px 16px", "border-radius": "8px", background: "var(--surface-raised-base)", "border-left": `3px solid ${TIER_COLORS[currentTier()].btn}` }}>
          <div style={{ "font-size": "13px", "font-weight": "600", color: "var(--text-strong)" }}>
            Current Plan: {TIER_ICONS[currentTier()]} {currentPlan().name}
            <Show when={daysRemaining() !== null}>
              <span style={{ "font-size": "11px", color: "var(--text-weak)", "margin-left": "8px" }}>
                {daysRemaining()} days remaining
              </span>
            </Show>
            <Show when={!daysRemaining() && currentTier() !== "free"}>
              <span style={{ "font-size": "11px", color: "#00ff88", "margin-left": "8px" }}>
                Permanent unlock
              </span>
            </Show>
          </div>
          <div style={{ "font-size": "12px", color: "var(--text-weak)", "margin-top": "4px" }}>
            {currentPlan().toolCount} tools | {currentPlan().maxAgents === -1 ? "Unlimited" : currentPlan().maxAgents} agents | {currentPlan().memoryOptimization}
          </div>
        </div>

        <div style={{ display: "grid", "grid-template-columns": "repeat(4, 1fr)", gap: "12px", "margin-bottom": "20px" }}>
          <For each={TIER_ORDER}>
            {(tierId) => {
              const plan = SUBSCRIPTION_PLANS[tierId]
              const colors = TIER_COLORS[tierId]
              const isCurrent = currentTier() === tierId
              return (
                <div
                  style={{
                    "background": colors.bg,
                    "border": `1px solid ${isCurrent ? colors.border : "#2a2a3e"}`,
                    "border-radius": "12px",
                    "padding": "16px",
                    "position": "relative",
                    "box-shadow": isCurrent ? `0 0 20px ${colors.glow}` : "none",
                    "transition": "all 0.3s ease",
                  }}
                >
                  <Show when={isCurrent}>
                    <div style={{
                      position: "absolute",
                      top: "-8px",
                      right: "-8px",
                      background: colors.btn,
                      color: "#000",
                      "font-size": "9px",
                      "font-weight": "700",
                      padding: "2px 8px",
                      "border-radius": "10px",
                      "text-transform": "uppercase",
                    }}>Current</div>
                  </Show>
                  <div style={{ "font-size": "24px", "margin-bottom": "4px" }}>{TIER_ICONS[tierId]}</div>
                  <div style={{ "font-size": "16px", "font-weight": "700", color: colors.text, "margin-bottom": "4px" }}>
                    {plan.name}
                  </div>
                  <div style={{ "font-size": "22px", "font-weight": "800", color: "var(--text-strong)", "margin-bottom": "8px" }}>
                    ${plan.price}
                    <span style={{ "font-size": "12px", "font-weight": "400", color: "var(--text-weak)" }}>
                      {tierId === "free" ? " /forever" : tierId === "pro" ? " /15 days" : tierId === "max" ? " /2 months" : " /year"}
                    </span>
                  </div>
                  <div style={{ "font-size": "11px", color: "var(--text-weak)", "margin-bottom": "10px" }}>
                    {plan.description}
                  </div>
                  <div style={{ "font-size": "11px", color: "var(--text-weak)", "margin-bottom": "8px" }}>
                    {plan.toolCount} tools | {plan.maxAgents === -1 ? "Unlimited" : plan.maxAgents} agents
                  </div>
                  <For each={plan.features.slice(0, 6)}>
                    {(f) => (
                      <div style={{ "font-size": "11px", color: "var(--text-weak)", "padding": "2px 0", display: "flex", "align-items": "center", gap: "6px" }}>
                        <span style={{ color: colors.text }}>{"\u2713"}</span> {f}
                      </div>
                    )}
                  </For>
                  <Show when={plan.features.length > 6}>
                    <div style={{ "font-size": "10px", color: "var(--text-weak)", "margin-top": "4px" }}>
                      +{plan.features.length - 6} more features
                    </div>
                  </Show>
                  <Show when={!isCurrent && tierId !== "free"}>
                    <button
                      onClick={() => handleActivateTier(tierId)}
                      style={{
                        width: "100%",
                        "margin-top": "10px",
                        padding: "8px",
                        "border-radius": "8px",
                        border: `1px solid ${colors.border}`,
                        background: "transparent",
                        color: colors.text,
                        "font-size": "12px",
                        "font-weight": "600",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.btn
                        e.currentTarget.style.color = "#000"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent"
                        e.currentTarget.style.color = colors.text
                      }}
                    >
                      Activate {plan.name}
                    </button>
                    <button
                      onClick={() => handleStripeClick(tierId)}
                      style={{
                        width: "100%",
                        "margin-top": "6px",
                        padding: "6px",
                        "border-radius": "8px",
                        border: `1px solid ${colors.border}`,
                        background: colors.btn,
                        color: "#000",
                        "font-size": "11px",
                        "font-weight": "600",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        opacity: "0.85",
                      }}
                    >
                      Pay with Stripe
                    </button>
                  </Show>
                  <Show when={isCurrent && tierId === "free"}>
                    <button
                      disabled
                      style={{
                        width: "100%",
                        "margin-top": "10px",
                        padding: "8px",
                        "border-radius": "8px",
                        border: `1px solid ${colors.border}`,
                        background: "transparent",
                        color: colors.text,
                        "font-size": "12px",
                        "font-weight": "600",
                        cursor: "default",
                        opacity: "0.5",
                      }}
                    >
                      Active Plan
                    </button>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>

        <div style={{ "margin-bottom": "20px", padding: "16px", "border-radius": "8px", background: "var(--surface-raised-base)", border: "1px solid var(--surface-raised-border)" }}>
          <h3 style={{ "font-size": "14px", "font-weight": "600", color: "var(--text-strong)", margin: "0 0 8px 0" }}>
            {"\uD83D\uDD11"} Secret Code Activation
          </h3>
          <p style={{ "font-size": "12px", color: "var(--text-weak)", margin: "0 0 10px 0" }}>
            Enter a secret code for permanent unlock — no expiry, no limitations
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={code()}
              onInput={(e) => setCode(e.currentTarget.value)}
              placeholder="Enter secret code (e.g. ZYRAXON-ULTRA-2026)"
              style={{
                flex: "1",
                padding: "8px 12px",
                "border-radius": "8px",
                border: "1px solid var(--surface-raised-border)",
                background: "var(--surface-base)",
                color: "var(--text-strong)",
                "font-size": "12px",
                "font-family": "monospace",
              }}
            />
            <button
              onClick={handleActivateCode}
              style={{
                padding: "8px 16px",
                "border-radius": "8px",
                border: "none",
                background: "#00ff88",
                color: "#000",
                "font-size": "12px",
                "font-weight": "600",
                cursor: "pointer",
              }}
            >
              Activate
            </button>
          </div>
          <Show when={codeMessage()}>
            <div style={{
              "margin-top": "8px",
              padding: "6px 10px",
              "border-radius": "6px",
              "font-size": "12px",
              background: codeMessage().includes("Invalid") ? "rgba(255,68,68,0.15)" : "rgba(0,255,136,0.15)",
              color: codeMessage().includes("Invalid") ? "#ff4444" : "#00ff88",
            }}>
              {codeMessage()}
            </div>
          </Show>
          <Show when={showSuccess()}>
            <div style={{
              "margin-top": "8px",
              padding: "6px 10px",
              "border-radius": "6px",
              "font-size": "12px",
              background: "rgba(0,255,136,0.2)",
              color: "#00ff88",
              "font-weight": "600",
            }}>
              {"\u2705"} Tier upgraded successfully! All {currentPlan().toolCount} tools unlocked.
            </div>
          </Show>
        </div>

        <Show when={currentTier() !== "free"}>
          <div style={{ padding: "12px 16px", "border-radius": "8px", background: "var(--surface-raised-base)", border: "1px solid var(--surface-raised-border)", "margin-bottom": "12px" }}>
            <div style={{ "font-size": "12px", color: "var(--text-weak)", "margin-bottom": "6px" }}>Subscription Details</div>
            <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "8px", "font-size": "12px" }}>
              <div><span style={{ color: "var(--text-weak)" }}>Plan:</span> <span style={{ color: "var(--text-strong)", "font-weight": "600" }}>{currentPlan().name}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Price:</span> <span style={{ color: "var(--text-strong)" }}>${currentPlan().price}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Tools:</span> <span style={{ color: "var(--text-strong)" }}>{currentPlan().toolCount}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Memory:</span> <span style={{ color: "var(--text-strong)" }}>{currentPlan().memoryOptimization}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Expiry:</span> <span style={{ color: "var(--text-strong)" }}>{daysRemaining() !== null ? `${daysRemaining()} days` : "Never (permanent)"}</span></div>
            </div>
          </div>
        </Show>

        <button
          onClick={handleReset}
          style={{
            padding: "6px 12px",
            "border-radius": "6px",
            border: "1px solid #333",
            background: "transparent",
            color: "#666",
            "font-size": "11px",
            cursor: "pointer",
          }}
        >
          Reset to Free
        </button>
      </div>
    </div>
  )
}
