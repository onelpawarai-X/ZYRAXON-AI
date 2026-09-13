import { createSignal, For, Show } from "solid-js"
import { useSubscription } from "@/context/subscription"
import { SUBSCRIPTION_PLANS, TIER_ORDER, type SubscriptionTier } from "@/context/subscription-types"

const TIER_COLORS: Record<SubscriptionTier, { bg: string; border: string; text: string; glow: string; btn: string }> = {
  free: { bg: "#1a1a2e", border: "#333366", text: "#8888aa", glow: "transparent", btn: "#333366" },
  pro: { bg: "#0d2818", border: "#00ff88", text: "#00ff88", glow: "rgba(0,255,136,0.3)", btn: "#00ff88" },
  max: { bg: "#1a0d28", border: "#8b5cf6", text: "#8b5cf6", glow: "rgba(139,92,246,0.3)", btn: "#8b5cf6" },
  ultra: { bg: "#281a0d", border: "#ff6b00", text: "#ff6b00", glow: "rgba(255,107,0,0.3)", btn: "#ff6b00" },
}

const TIER_ICONS: Record<SubscriptionTier, string> = {
  free: "⚡",
  pro: "🚀",
  max: "⭐",
  ultra: "👑",
}

export function SettingsSubscription() {
  const sub = useSubscription()
  const [code, setCode] = createSignal("")
  const [codeMessage, setCodeMessage] = useState("")

  function handleActivateCode() {
    const result = sub.activateWithCode(code())
    setCodeMessage(result.message)
    if (result.success) setCode("")
    setTimeout(() => setCodeMessage(""), 5000)
  }

  return (
    <div class="settings-v2-tab-header" style={{ "margin-top": "16px" }}>
      <div style={{ "padding-bottom": "12px" }}>
        <h2 style={{ "font-size": "18px", "font-weight": "700", color: "var(--text-strong)", margin: "0 0 4px 0" }}>
          Subscription Plans
        </h2>
        <p style={{ "font-size": "12px", color: "var(--text-weak)", margin: 0 }}>
          Choose the plan that fits your needs
        </p>
      </div>
      <div class="settings-v2-tab-body">
        <div style={{ "margin-bottom": "20px", padding: "12px 16px", "border-radius": "8px", background: "var(--surface-raised-base)", "border-left": `3px solid ${TIER_COLORS[sub.tier()].btn}` }}>
          <div style={{ "font-size": "13px", "font-weight": "600", color: "var(--text-strong)" }}>
            Current Plan: {TIER_ICONS[sub.tier()]} {sub.plan().name}
            <Show when={sub.daysRemaining() !== null}>
              <span style={{ "font-size": "11px", color: "var(--text-weak)", "margin-left": "8px" }}>
                {sub.daysRemaining()} days remaining
              </span>
            </Show>
          </div>
          <div style={{ "font-size": "12px", color: "var(--text-weak)", "margin-top": "4px" }}>
            {sub.plan().toolCount} tools available | {sub.plan().maxAgents} agents | {sub.plan().memoryOptimization}
          </div>
          <Show when={sub.daysRemaining() !== null && sub.daysRemaining()! <= 3}>
            <div style={{ "font-size": "12px", color: "#ff4444", "margin-top": "6px", "font-weight": "600" }}>
              ⚠️ Your subscription expires in {sub.daysRemaining()} days!
            </div>
          </Show>
        </div>

        <div style={{ display: "grid", "grid-template-columns": "repeat(4, 1fr)", gap: "12px", "margin-bottom": "20px" }}>
          <For each={TIER_ORDER}>
            {(tierId) => {
              const plan = SUBSCRIPTION_PLANS[tierId]
              const colors = TIER_COLORS[tierId]
              const isCurrent = sub.tier() === tierId
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
                        <span style={{ color: colors.text }}>✓</span> {f}
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
                      onClick={() => sub.activateTier(tierId)}
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
                  </Show>
                  <Show when={isCurrent && tierId === "free"}>
                    <button
                      onClick={() => sub.activateTier("free")}
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
            🔑 Secret Code Activation
          </h3>
          <p style={{ "font-size": "12px", color: "var(--text-weak)", margin: "0 0 10px 0" }}>
            Enter a secret code to activate a subscription plan without payment
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={code()}
              onInput={(e) => setCode(e.currentTarget.value)}
              placeholder="Enter secret code (e.g. ZYRAXON-PRO-2026)"
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
        </div>

        <Show when={sub.tier() !== "free"}>
          <div style={{ padding: "12px 16px", "border-radius": "8px", background: "var(--surface-raised-base)", border: "1px solid var(--surface-raised-border)", "margin-bottom": "12px" }}>
            <div style={{ "font-size": "12px", color: "var(--text-weak)", "margin-bottom": "6px" }}>Subscription Details</div>
            <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "8px", "font-size": "12px" }}>
              <div><span style={{ color: "var(--text-weak)" }}>Plan:</span> <span style={{ color: "var(--text-strong)", "font-weight": "600" }}>{sub.plan().name}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Price:</span> <span style={{ color: "var(--text-strong)" }}>${sub.plan().price}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Tools:</span> <span style={{ color: "var(--text-strong)" }}>{sub.plan().toolCount}</span></div>
              <div><span style={{ color: "var(--text-weak)" }}>Memory:</span> <span style={{ color: "var(--text-strong)" }}>{sub.plan().memoryOptimization}</span></div>
            </div>
          </div>
        </Show>

        <button
          onClick={() => sub.resetToFree()}
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

function useState<T>(initial: T): [() => T, (v: T) => void] {
  const [get, set] = createSignal(initial)
  return [get, set]
}
