// Copyright (c) 2026 onelpawarai. All rights reserved.

export type SubscriptionTier = "free" | "pro" | "max" | "ultra"

export interface SubscriptionPlan {
  id: SubscriptionTier
  name: string
  price: number
  currency: string
  durationDays: number | null
  description: string
  features: string[]
  toolCount: number | string
  memoryOptimization: string
  maxAgents: number
  maxProjects: string
}

export interface SubscriptionState {
  tier: SubscriptionTier
  activatedAt: number | null
  expiresAt: number | null
  secretCode: string | null
  stripeSessionId: string | null
}

export const TIER_ORDER: SubscriptionTier[] = ["free", "pro", "max", "ultra"]

export function hasAccess(currentTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
  return TIER_ORDER.indexOf(currentTier) >= TIER_ORDER.indexOf(requiredTier)
}

export const FREE_STATE: SubscriptionState = {
  tier: "free",
  activatedAt: null,
  expiresAt: null,
  secretCode: null,
  stripeSessionId: null,
}

export type SubscriptionParse =
  | { ok: true; state: SubscriptionState }
  | { ok: false; reason: string }

function toMs(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value !== "string") return undefined
  const asNumber = Number(value)
  if (!Number.isNaN(asNumber)) return asNumber
  const asDate = Date.parse(value)
  return Number.isNaN(asDate) ? undefined : asDate
}

function toStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

export function parseSubscriptionState(raw: unknown): SubscriptionParse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "state is not an object" }
  const obj = raw as Record<string, unknown>
  if (typeof obj.tier !== "string") return { ok: false, reason: "state is missing a string tier field" }
  const tier = obj.tier.trim().toLowerCase() as SubscriptionTier
  if (!TIER_ORDER.includes(tier)) {
    return { ok: false, reason: `unknown tier "${obj.tier}", expected one of ${TIER_ORDER.join(", ")}` }
  }
  const activatedAt = toMs(obj.activatedAt)
  if (activatedAt === undefined) {
    return { ok: false, reason: `activatedAt is not a timestamp: ${JSON.stringify(obj.activatedAt)}` }
  }
  const expiresAt = toMs(obj.expiresAt)
  if (expiresAt === undefined) {
    return { ok: false, reason: `expiresAt is not a timestamp: ${JSON.stringify(obj.expiresAt)}` }
  }
  return {
    ok: true,
    state: {
      tier,
      activatedAt,
      expiresAt,
      secretCode: toStr(obj.secretCode),
      stripeSessionId: toStr(obj.stripeSessionId),
    },
  }
}

// ═══════════════════════════════════════════════════════════════
// LIVE SERVER LICENSE VERIFICATION (No local secret codes)
// ═══════════════════════════════════════════════════════════════
export const VERIFY_LICENSE_API = "https://zyraxon-group-x.lovable.app/api/public/agent/verify-license"

export interface ServerVerifyResponse {
  valid: boolean
  tier?: SubscriptionTier
  expiresAt?: string
  remainingMs?: number
  justActivated?: boolean
  reason?: "invalid" | "expired" | "revoked" | "bad_request" | "server_error"
}

export async function verifyLicenseWithServer(code: string, machineId?: string): Promise<ServerVerifyResponse> {
  const clean = code.trim().toUpperCase()
  if (!clean) return { valid: false, reason: "bad_request" }

  try {
    const res = await fetch(VERIFY_LICENSE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: clean, machineId }),
    })

    if (!res.ok) {
      return { valid: false, reason: "server_error" }
    }

    const data = (await res.json()) as ServerVerifyResponse
    return data
  } catch {
    return { valid: false, reason: "server_error" }
  }
}

// ═══════════════════════════════════════════════════════════════
// TOOL TIER MAP — MIRRORS packages/zyraxon/src/subscription/tier-map.ts
// ═══════════════════════════════════════════════════════════════
export const TOOL_TIER_MAP: Record<string, SubscriptionTier> = {
  // FREE
  bash: "free", edit: "free", glob: "free",
  grep: "free", invalid: "free", memory: "free", plan: "free",
  question: "free", read: "free", skill: "free",
  todowrite: "free", webfetch: "free", websearch: "free", write: "free",
  x_analogy_add: "free", x_causal_add_link: "free", x_context_set: "free", x_doc_count_words: "free",
  x_doc_create: "free", x_doc_edit: "free", x_doc_markdown_to_html: "free", x_doc_read: "free",
  x_life_age: "free", x_life_aspect_ratio: "free", x_life_bmi: "free", x_life_calories: "free",
  x_life_color: "free", x_life_date_diff: "free", x_life_emi: "free", x_life_fuel: "free",
  x_life_gst: "free", x_life_heart_rate: "free", x_life_pace: "free", x_life_pixel_rem: "free",
  x_life_savings_goal: "free", x_life_temp: "free", x_life_text_stats: "free", x_life_tip: "free",
  x_life_unit: "free", x_life_wind_chill: "free", x_life_wpm: "free", x_math_combinatorics: "free",
  x_math_derivative: "free", x_math_geometry: "free", x_math_gradient: "free", x_math_integral: "free",
  x_math_matrix: "free", x_math_prime: "free", x_math_stats: "free", x_memory_append: "free",
  x_memory_create: "free", x_memory_delete: "free", x_memory_read: "free", x_memory_search: "free",
  x_memory_update: "free", x_memory_view: "free", x_reason_add_fact: "free", x_skill_create: "free",
  x_skill_delete: "free", x_skill_list: "free", x_spatial_add_obj: "free", x_subscription_status: "free",
  x_mode_switch: "free", media_generate: "free", mcp_disconnect: "free", model_call: "free",
  x_session_list: "free", x_session_open: "free", x_session_send: "free",
  x_session_subagent: "free", x_session_switch: "free", x_session_remove: "free",
  x_ui_buttons_list: "free", x_ui_button_send: "free", x_ui_button_stop: "free", x_ui_button_new_session: "free",
  x_ui_button_review: "free", x_ui_button_preview: "free", x_ui_button_sidebar: "free",
  x_ui_button_mode: "free", x_ui_button_model: "free", x_ui_button_terminal: "free",
  x_ui_button_attach: "free", x_ui_button_todo: "free", x_ui_button_settings: "free",
  x_ui_button_plan_exit: "free",
  x_preview_list_windows: "free", x_preview_attach_window: "free", x_preview_detach_window: "free",
  x_preview_launch_app: "free", x_preview_open_url: "free", x_preview_screenshot: "free",
  x_preview_click: "free", x_preview_type: "free", x_preview_fill_form: "free",
  x_preview_key: "free", x_preview_scroll: "free", x_preview_read_text: "free",
  x_preview_elements: "free", x_preview_find: "free", x_preview_wait: "free",
  x_desktop_share: "pro", x_desktop_link: "pro", x_desktop_stop_share: "pro",
  site_preview: "free", site_create: "free", site_publish: "free",
  site_unpublish: "free", site_domain: "free",
  x_task_create: "free", x_task_delete: "free", x_task_list: "free", x_task_run_now: "free",
  x_task_scheduler_status: "free", x_task_start_scheduler: "free", x_task_toggle: "free", x_world_add_object: "free",
  task: "free", system_info: "free",
  mcp_websearch: "free", mcp_catalog: "free", mcp_status: "free", mcp_connect: "free",
  nuphus_screenshot: "free", nuphus_list_windows: "free", nuphus_focus_window: "free", nuphus_click: "free",
  nuphus_type: "free", nuphus_hotkey: "free", nuphus_scroll: "free", nuphus_mouse_move: "free",
  nuphus_drag: "free", nuphus_ocr: "free", nuphus_clipboard_get: "free", nuphus_clipboard_set: "free",
  nuphus_browser_navigate: "free", nuphus_browser_snapshot: "free", nuphus_browser_click: "free", nuphus_browser_type: "free",
  nuphus_browser_screenshot: "free", nuphus_browser_cookies: "free", nuphus_browser_execute: "free",
  tp_apps: "free", tp_windows: "free", tp_elements: "free", tp_find: "free",
  tp_snapshot: "free", tp_get_element: "free", tp_element_at: "free", tp_diagnostics: "free",
  tp_activate_window: "free", tp_minimize_window: "free", tp_fullscreen_window: "free", tp_close_window: "free",
  tp_move_window: "free", tp_resize_window: "free", tp_find_window: "free", tp_monitor_count: "free",
  tp_click: "free", tp_double_click: "free", tp_right_click: "free", tp_click_at: "free",
  tp_double_click_at: "free", tp_right_click_at: "free", tp_mouse_move: "free", tp_drag: "free",
  tp_type_text: "free", tp_press_key: "free", tp_hotkey: "free", tp_scroll: "free",
  tp_set_value: "free", tp_set_numeric_value: "free", tp_focus: "free", tp_select_text: "free",
  tp_select_text_range: "free", tp_action: "free", tp_read_text: "free", tp_screenshot: "free",
  tp_screenshot_window: "free", tp_chrome_profiles: "free", tp_open_chrome_profile: "free", tp_new_tab: "free",
  tp_list_tabs: "free", tp_switch_tab: "free", tp_close_tab: "free", tp_wait_for: "free",
  tp_wait_for_app: "free", tp_wait_for_window: "free", tp_configure: "free",
}

export function getToolRequiredTier(toolId: string): SubscriptionTier {
  return TOOL_TIER_MAP[toolId] ?? "max"
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    currency: "USD",
    durationDays: null,
    description: "Get started with the basics",
    features: [
      "Basic AI Chat",
      "File System Access (Read/Write/Edit)",
      "Shell Execution (Bash/PowerShell)",
      "Web Search & Fetch",
      "Glob & Grep File Search",
      "Todo Task Management",
      "Basic Memory (100 entries)",
      "Math & Science Tools",
      "Daily Life Tools",
      "Document & Skill Tools",
      "Basic Browser Automation",
      "Mode Switching (general/build/plan/explore/vision)",
    ],
    toolCount: 186,
    memoryOptimization: "Basic (100 entries, 10MB cache)",
    maxAgents: 1,
    maxProjects: "3",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 5,
    currency: "USD",
    durationDays: 15,
    description: "More power for professionals",
    features: [
      "Everything in Free",
      "Unlimited Projects",
      "Memory & Context Sync (500 entries)",
      "Code Analysis & Planning",
      "Self-Evolution & Screen Vision",
      "API Testing Tools",
      "Aviation Systems",
      "Ground Vehicle Systems",
      "Drone Systems",
      "Helicopter Systems",
      "ML & Safety Tools",
      "Common Sense & Ethics AI",
      "Creativity Engine",
      "Multi-Agent (up to 3 agents)",
      "Priority Processing",
    ],
    toolCount: 503,
    memoryOptimization: "Pro (500 entries, 50MB cache)",
    maxAgents: 3,
    maxProjects: "Unlimited",
  },
  max: {
    id: "max",
    name: "Max",
    price: 15,
    currency: "USD",
    durationDays: 60,
    description: "Built for teams and scale",
    features: [
      "Everything in Pro",
      "Space Systems",
      "Industrial Control",
      "Infrastructure Systems",
      "Security & Surveillance",
      "Survey & Mapping",
      "Agriculture Systems",
      "Marine Systems",
      "Construction Systems",
      "Physical Interface & Sensors",
      "SDR & Radio",
      "Digital Twin & Simulation",
      "Dashboard & Visualization",
      "Alert & Notification",
      "Data Logging & Export",
      "Remote Control",
      "Predictive Maintenance",
      "Decision Support",
      "Authorization & Auth",
      "Multi-Agent (up to 8 agents)",
      "Team Workspace (3 members)",
      "GitHub Integration",
    ],
    toolCount: 827,
    memoryOptimization: "Max (2000 entries, 200MB cache)",
    maxAgents: 8,
    maxProjects: "Unlimited + Team",
  },
  ultra: {
    id: "ultra",
    name: "Ultra",
    price: 99,
    currency: "USD",
    durationDays: 365,
    description: "Maximum power. No limits.",
    features: [
      "Everything in Max",
      "Singularity AI Engine",
      "Guardian System",
      "OMNI-KERNEL 15-layer system",
      "Ultra Code Generator",
      "Ultra Security Sweeper",
      "Ultra Performance Optimizer",
      "Ultra Refactoring Engine",
      "Ultra Test Generator",
      "Ultra Auto-Deploy Pipeline",
      "Ultra Code Reviewer",
      "Ultra Quantum Analyzer",
      "Unlimited Agents (no cap)",
      "Full Cloud Execution (24/7)",
      "Team Workspace (10 members)",
      "Custom Models & Settings",
      "Priority Support",
      "Early Access to New Features",
      "Memory (10000 entries, 1GB cache)",
    ],
    toolCount: "888+",
    memoryOptimization: "Ultra (10000 entries, 1GB cache)",
    maxAgents: -1,
    maxProjects: "Unlimited + Team + Enterprise",
  },
}

export const TIER_STATS: Record<SubscriptionTier, { totalTools: number | string; categories: string[] }> = {
  free: {
    totalTools: 186,
    categories: ["Core AI", "Math", "Science", "Finance", "Data Science", "Security Basics", "Daily Life", "Memory", "Documents", "Tasks", "Captcha", "Subscription", "Acid/Base", "Chemistry", "Biology", "Life Tools", "System Info", "Web Search", "Nuphus Desktop", "Touchpoint Desktop"],
  },
  pro: {
    totalTools: 503,
    categories: ["Everything in Free", "Aviation", "Ground Vehicles", "Drones", "Helicopters", "ML & Safety", "Common Sense & Ethics", "Creativity", "Data Science Advanced", "Finance Advanced", "Vehicle Systems", "Planning", "Media Processing", "OCR", "Code Analysis", "API Testing", "Screen Vision", "Self-Evolution", "Task Automation"],
  },
  max: {
    totalTools: 827,
    categories: ["Everything in Pro", "Space", "Industrial", "Infrastructure", "Security", "Survey", "Agriculture", "Marine", "Construction", "Physical Interface", "SDR", "Digital Twin", "Dashboard", "Alert", "Data Logger", "Remote Control", "Predictive Maintenance", "Decision Support", "Authorization", "Extended AI", "Engineering", "Advanced Security", "CDP Browser", "Computer Control", "Site Builder"],
  },
  ultra: {
    totalTools: "888+",
    categories: ["Everything in Max", "Singularity", "Guardian", "Universal Command Engine", "Ultra Tools", "Self-Improvement"],
  },
}
