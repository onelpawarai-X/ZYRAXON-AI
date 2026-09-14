import { createSignal, For, Show } from "solid-js"
import {
  loadSubState,
  activateWithCode,
  activateTier,
  activateTierWithDuration,
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

const DURATIONS: { label: string; days: number }[] = [
  { label: "15 Days", days: 15 },
  { label: "2 Months", days: 60 },
  { label: "1 Year", days: 365 },
]

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
    if (zyInput().trim().toUpperCase() === "X") {
      setZyOpen(true)
      setZyInput("")
    }
  }

  function handleAdminUnlock() {
    const input = adminTier().trim().toUpperCase()
    if (input === "UNLOCK" || input === "ALL") {
      setAdminUnlocked(true)
      setAdminMsg("Admin mode activated! Select any tier below.")
      setAdminTier("")
      setTimeout(() => setAdminMsg(""), 3000)
      return
    }
    if (input === "LOCK" || input === "RESET") {
      const newState = resetToFree()
      setState(newState)
      setAdminUnlocked(false)
      setAdminMsg("All subscriptions locked. Reset to Free.")
      setAdminTier("")
      setTimeout(() => setAdminMsg(""), 3000)
      return
    }
    if (input === "FREE") {
      const newState = resetToFree()
      setState(newState)
      setAdminMsg("Reset to Free tier!")
      setAdminTier("")
      setTimeout(() => setAdminMsg(""), 3000)
      return
    }
    const tier = input.toLowerCase() as SubscriptionTier
    if (["pro", "max", "ultra"].includes(tier)) {
      const newState = activateTier(tier)
      setState(newState)
      setAdminUnlocked(true)
      setAdminMsg(`${SUBSCRIPTION_PLANS[tier].name} activated permanently!`)
      setAdminTier("")
      setTimeout(() => setAdminMsg(""), 3000)
      return
    }
    setAdminMsg("Type: UNLOCK, FREE, PRO, MAX, ULTRA, or LOCK")
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

  function handleLockTier(tier: SubscriptionTier) {
    const newState = lockSubscription()
    setState(newState)
    setAdminMsg(`Subscription locked. Reset to Free.`)
    setTimeout(() => setAdminMsg(""), 3000)
  }

  function handleReset() {
    const newState = resetToFree()
    setState(newState)
  }

  return (
    <div class="settings-v2-tab-header" style={{ "margin-top": "16px" }}>
      <div style={{ "padding-bottom": "12px", display: "flex", "align-items": "center", "justify-content": "space-between" }}>
        <div>
          <h2 style={{ "font-size": "18px", "font-weight": "700", color: "var(--text-strong)", margin: "0 0 4px 0" }}>
            Subscription Plans
          </h2>
          <p style={{ "font-size": "12px", color: "var(--text-weak)", margin: 0 }}>
            Choose the plan that fits your needs. Secret codes unlock permanently.
          </p>
        </div>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => {
              if (!zyOpen()) {
                setZyInput("")
              }
              setZyOpen(!zyOpen())
            }}
            style={{
              padding: "4px 10px",
              "border-radius": "6px",
              border: "1px solid #444",
              background: zyOpen() ? "#ff6b00" : "#222",
              color: zyOpen() ? "#000" : "#666",
              "font-size": "11px",
              "font-weight": "700",
              cursor: "pointer",
              "letter-spacing": "1px",
            }}
          >
            ZY
          </button>
          <Show when={zyOpen()}>
            <div style={{
              position: "absolute",
              top: "110%",
              right: 0,
              background: "#1a1a2e",
              border: "1px solid #333",
              "border-radius": "8px",
              padding: "10px",
              width: "220px",
              "z-index": 100,
              "box-shadow": "0 8px 32px rgba(0,0,0,0.6)",
            }}>
              <div style={{ "font-size": "10px", color: "#666", "margin-bottom": "6px" }}>
                Enter access code:
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  value={zyInput()}
                  onInput={(e) => setZyInput(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleZySubmit() }}
                  placeholder="Type X"
                  autofocus
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    "border-radius": "6px",
                    border: "1px solid #444",
                    background: "#111",
                    color: "#00ff88",
                    "font-size": "12px",
                    "font-family": "monospace",
                  }}
                />
                <button
                  onClick={handleZySubmit}
                  style={{
                    padding: "6px 12px",
                    "border-radius": "6px",
                    border: "none",
                    background: "#00ff88",
                    color: "#000",
                    "font-size": "11px",
                    "font-weight": "600",
                    cursor: "pointer",
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </Show>
        </div>
      </div>

      <Show when={zyOpen() && adminOpen()}>
        <div style={{
          "margin-bottom": "16px",
          padding: "14px",
          "border-radius": "10px",
          background: "linear-gradient(135deg, #1a0d28, #0d1a28)",
          border: "1px solid #8b5cf6",
          "box-shadow": "0 0 20px rgba(139,92,246,0.2)",
        }}>
          <div style={{ "font-size": "12px", "font-weight": "700", color: "#8b5cf6", "margin-bottom": "8px", display: "flex", "align-items": "center", gap: "6px" }}>
            {"\u2699\uFE0F"} Admin Control Panel
          </div>
          <p style={{ "font-size": "11px", color: "#888", "margin-bottom": "8px" }}>
            Type tier name + Enter to activate. Type LOCK to disable.
          </p>
          <div style={{ display: "flex", gap: "6px", "margin-bottom": "8px" }}>
            <input
              type="text"
              value={adminTier()}
              onInput={(e) => setAdminTier(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdminUnlock() }}
              placeholder="UNLOCK / PRO / MAX / ULTRA / LOCK"
              style={{
                flex: 1,
                padding: "6px 8px",
                "border-radius": "6px",
                border: "1px solid #8b5cf6",
                background: "#111",
                color: "#00ff88",
                "font-size": "12px",
                "font-family": "monospace",
              }}
            />
            <button
              onClick={handleAdminUnlock}
              style={{
                padding: "6px 12px",
                "border-radius": "6px",
                border: "none",
                background: "#8b5cf6",
                color: "#fff",
                "font-size": "11px",
                "font-weight": "600",
                cursor: "pointer",
              }}
            >
              Set
            </button>
          </div>
          <Show when={adminMsg()}>
            <div style={{
              padding: "6px 10px",
              "border-radius": "6px",
              "font-size": "11px",
              background: adminMsg().includes("locked") || adminMsg().includes("Lock") ? "rgba(255,68,68,0.15)" : "rgba(0,255,136,0.15)",
              color: adminMsg().includes("locked") || adminMsg().includes("Lock") ? "#ff4444" : "#00ff88",
            }}>
              {adminMsg()}
            </div>
          </Show>
          <div style={{ display: "grid", "grid-template-columns": "repeat(4, 1fr)", gap: "6px", "margin-top": "10px" }}>
            <For each={["pro", "max", "ultra"] as SubscriptionTier[]}>
              {(tier) => {
                const colors = TIER_COLORS[tier]
                const plan = SUBSCRIPTION_PLANS[tier]
                const isActive = currentTier() === tier
                return (
                  <button
                    onClick={() => {
                      const newState = activateTier(tier)
                      setState(newState)
                      setAdminMsg(`${plan.name} activated permanently!`)
                      setTimeout(() => setAdminMsg(""), 2000)
                    }}
                    style={{
                      padding: "8px 4px",
                      "border-radius": "6px",
                      border: `1px solid ${isActive ? colors.border : "#333"}`,
                      background: isActive ? colors.bg : "transparent",
                      color: colors.text,
                      "font-size": "10px",
                      "font-weight": "600",
                      cursor: "pointer",
                      "text-align": "center",
                    }}
                  >
                    {TIER_ICONS[tier]} {plan.name}
                    <Show when={isActive}>
                      <div style={{ "font-size": "8px", color: "#00ff88", "margin-top": "2px" }}>ACTIVE</div>
                    </Show>
                  </button>
                )
              }}
            </For>
            <button
              onClick={() => {
                const newState = resetToFree()
                setState(newState)
                setAdminMsg("Reset to Free!")
                setTimeout(() => setAdminMsg(""), 2000)
              }}
              style={{
                padding: "8px 4px",
                "border-radius": "6px",
                border: "1px solid #333",
                background: "transparent",
                color: "#ff4444",
                "font-size": "10px",
                "font-weight": "600",
                cursor: "pointer",
                "text-align": "center",
              }}
            >
              {"\uD83D\uDD12"} Lock All
            </button>
          </div>
        </div>
      </Show>

      <div class="settings-v2-tab-body">
        <div style={{
          "margin-bottom": "20px",
          padding: "12px 16px",
          "border-radius": "8px",
          background: "var(--surface-raised-base)",
          "border-left": `3px solid ${TIER_COLORS[currentTier()].btn}`,
        }}>
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
                  <div style={{ "font-size": "11px", color: "var(--text-weak)", "margin-bottom": "8px" }}>
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
                    <For each={DURATIONS}>
                      {(dur) => (
                        <button
                          onClick={() => handleStripePay(tierId)}
                          style={{
                            width: "100%",
                            "margin-top": "6px",
                            padding: "6px",
                            "border-radius": "6px",
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
                          Pay ${plan.price} ({dur.label})
                        </button>
                      )}
                    </For>
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

        <div style={{
          "margin-bottom": "20px",
          padding: "16px",
          "border-radius": "8px",
          background: "var(--surface-raised-base)",
          border: "1px solid var(--surface-raised-border)",
        }}>
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
              onKeyDown={(e) => { if (e.key === "Enter") handleActivateCode() }}
              placeholder="ZYRAXON-ULTRA-2026"
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
              background: codeMessage().includes("Invalid") || codeMessage().includes("not configured") ? "rgba(255,68,68,0.15)" : "rgba(0,255,136,0.15)",
              color: codeMessage().includes("Invalid") || codeMessage().includes("not configured") ? "#ff4444" : "#00ff88",
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
              {"\u2705"} Tier upgraded! All {currentPlan().toolCount} tools unlocked.
            </div>
          </Show>
        </div>

        <Show when={currentTier() !== "free"}>
          <div style={{
            padding: "12px 16px",
            "border-radius": "8px",
            background: "var(--surface-raised-base)",
            border: "1px solid var(--surface-raised-border)",
            "margin-bottom": "12px",
          }}>
            <div style={{ "font-size": "12px", color: "var(--text-weak)", "margin-bottom": "6px" }}>Subscription Details</div>
            <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "8px", "font-size": "12px" }}>
              <div><span style={{ color: "var(--text-weak)" }}>Plan:</span> <span style={{ color: "var(--text-strong)", "font-weight": "600" }}>{currentPlan().name}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Price:</span> <span style={{ color: "var(--text-strong)" }}>${currentPlan().price}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Tools:</span> <span style={{ color: "var(--text-strong)" }}>{currentPlan().toolCount}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Memory:</span> <span style={{ color: "var(--text-strong)" }}>{currentPlan().memoryOptimization}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Expiry:</span> <span style={{ color: "var(--text-strong)" }}>{daysRemaining() !== null ? `${daysRemaining()} days` : "Never (permanent)"}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Type:</span> <span style={{ color: "var(--text-strong)" }}>{state().secretCode ? "Secret Code" : state().stripeSessionId ? "Stripe" : "Free"}</span></div>
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
