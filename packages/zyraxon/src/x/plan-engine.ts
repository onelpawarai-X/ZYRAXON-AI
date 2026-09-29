import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

export type PlanResult = { ok: boolean; data?: unknown; error?: string }

export type PlanStep = {
  index: number
  title: string
  status: "pending" | "running" | "done" | "failed" | "skipped"
  tool?: string
  args?: Record<string, unknown>
  note?: string
  attempts: number
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  result?: unknown
  error?: string
}

type SuppliedStep = string | { title?: string; tool?: string; args?: Record<string, unknown> }

export type Plan = {
  id: string
  goal: string
  context?: string
  createdAt: string
  updatedAt: string
  status: "active" | "completed" | "failed" | "abandoned"
  steps: PlanStep[]
}

const ROOT = path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), ".zyraxon")

const planFile = (id: string) => path.join(ROOT, "plans", `${id}.json`)

export async function readPlan(id: string): Promise<Plan | null> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error(`invalid plan id: ${id}`)
  const file = planFile(id)
  if (!(await Bun.file(file).exists())) return null
  return (await Bun.file(file).json()) as Plan
}

export async function writePlan(plan: Plan): Promise<void> {
  await fs.mkdir(path.join(ROOT, "plans"), { recursive: true })
  await Bun.write(planFile(plan.id), JSON.stringify(plan, null, 2))
}

export async function listPlans(): Promise<Plan[]> {
  const dir = path.join(ROOT, "plans")
  if (!(await Bun.file(dir).exists()) && !(await hasDir(dir))) return []
  const entries = await fs.readdir(dir)
  const plans = await Promise.all(
    entries
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => (await Bun.file(path.join(dir, f)).json()) as Plan),
  )
  return plans.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function hasDir(dir: string): Promise<boolean> {
  try {
    await fs.access(dir)
    return true
  } catch {
    return false
  }
}

// A caller-supplied step list is used as-is and may bind a tool plus its real
// arguments. Otherwise the goal is split on the separators a person actually
// writes, and each fragment becomes one step with no tool attached.
export function deriveSteps(goal: string, supplied?: unknown): PlanStep[] {
  if (Array.isArray(supplied)) {
    const cleaned: { title: string; tool?: string; args?: Record<string, unknown> }[] = []
    for (const raw of supplied) {
      if (typeof raw === "string") {
        const title = raw.trim()
        if (title) cleaned.push({ title })
        continue
      }
      if (raw && typeof raw === "object") {
        const step = raw as { title?: string; tool?: string; args?: Record<string, unknown> }
        const title = String(step.title ?? step.tool ?? "").trim()
        if (!title) continue
        cleaned.push({ title, tool: step.tool ? String(step.tool) : undefined, args: step.args })
      }
    }
    if (cleaned.length > 0) {
      return cleaned.map((s, index) => ({
        index: index + 1,
        title: s.title,
        status: "pending" as const,
        attempts: 0,
        tool: s.tool,
        args: s.args,
      }))
    }
  }

  const fragments =
    goal
      .split(/\r?\n+/)
      .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
      .filter(Boolean).length > 1
      ? goal.split(/\r?\n+/).map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
      : goal.split(/\s*(?:then|after that|next,|and then)\s+/i)

  return fragments
    .map((s) => s.trim())
    .filter(Boolean)
    .map((title, index) => ({ index: index + 1, title, status: "pending" as const, attempts: 0 }))
}

export function newPlanId(goal: string): string {
  const slug = goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
  const stamp = Date.now().toString(36)
  return `${slug || "plan"}-${stamp}`
}

export function createPlan(goal: string, context?: string, steps?: unknown): Plan {
  const now = new Date().toISOString()
  const planSteps = deriveSteps(goal, steps)
  if (planSteps.length === 0) throw new Error("goal must contain at least one step of work")
  return {
    id: newPlanId(goal),
    goal,
    context,
    createdAt: now,
    updatedAt: now,
    status: "active",
    steps: planSteps,
  }
}

export function summarise(plan: Plan) {
  const counts = { pending: 0, running: 0, done: 0, failed: 0, skipped: 0 }
  for (const step of plan.steps) counts[step.status] += 1
  const total = plan.steps.length
  const finished = counts.done + counts.failed + counts.skipped
  return {
    ...counts,
    total,
    finished,
    percent: total === 0 ? 0 : Math.round((finished / total) * 100),
    nextStep: plan.steps.find((s) => s.status === "pending")?.title ?? null,
    nextStepIndex: plan.steps.find((s) => s.status === "pending")?.index ?? null,
  }
}

// Records a completed step and advances the plan state. Kept separate from the
// runner so a caller can also mark progress when it did the work itself.
export function applyStepResult(
  plan: Plan,
  index: number,
  outcome: { ok: boolean; result?: unknown; error?: string; note?: string },
): Plan {
  const step = plan.steps.find((s) => s.index === index)
  if (!step) throw new Error(`plan ${plan.id} has no step ${index}`)
  const now = new Date().toISOString()
  step.attempts += 1
  step.status = outcome.ok ? "done" : "failed"
  step.finishedAt = now
  if (step.startedAt) step.durationMs = new Date(now).getTime() - new Date(step.startedAt).getTime()
  if (outcome.result !== undefined) step.result = outcome.result
  if (outcome.error) step.error = outcome.error
  if (outcome.note) step.note = outcome.note

  plan.updatedAt = now
  const remaining = plan.steps.filter((s) => s.status === "pending" || s.status === "running")
  if (remaining.length === 0) {
    plan.status = plan.steps.some((s) => s.status === "failed") ? "failed" : "completed"
  } else {
    plan.status = "active"
  }
  return plan
}

export function markSkipped(plan: Plan, index: number, note?: string): Plan {
  const step = plan.steps.find((s) => s.index === index)
  if (!step) throw new Error(`plan ${plan.id} has no step ${index}`)
  step.status = "skipped"
  step.note = note
  plan.updatedAt = new Date().toISOString()
  const anyOpen = plan.steps.some((s) => s.status === "pending" || s.status === "running")
  plan.status = anyOpen ? "active" : plan.steps.some((s) => s.status === "failed") ? "failed" : "completed"
  return plan
}

export function claimNextStep(plan: Plan): PlanStep | null {
  const next = plan.steps.find((s) => s.status === "pending")
  if (!next) return null
  next.status = "running"
  next.startedAt = new Date().toISOString()
  plan.updatedAt = next.startedAt
  return next
}

// ── Learning ───────────────────────────────────────────────────────────────────

export type Lesson = {
  id: string
  at: string
  task: string
  worked?: string
  failed?: string
  tags: string[]
}

const lessonFile = () => path.join(ROOT, "learning", "lessons.jsonl")

export async function recordLesson(
  task: string,
  worked?: string,
  failed?: string,
): Promise<Lesson> {
  const lesson: Lesson = {
    id: `L${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    task,
    worked: worked || undefined,
    failed: failed || undefined,
    tags: extractTags(task),
  }
  await fs.mkdir(path.join(ROOT, "learning"), { recursive: true })
  await fs.appendFile(lessonFile(), `${JSON.stringify(lesson)}\n`, "utf8")
  return lesson
}

export async function readLessons(limit = 50): Promise<Lesson[]> {
  const file = lessonFile()
  if (!(await hasDir(path.dirname(file)))) return []
  const raw = await fs.readFile(file, "utf8").catch(() => "")
  const lessons = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Lesson
      } catch {
        return null
      }
    })
    .filter((l): l is Lesson => l !== null)
  return lessons.slice(-limit).reverse()
}

function extractTags(text: string): string[] {
  const stop = new Set([
    "the","a","an","and","or","to","of","in","on","for","with","is","was","were","be","been","it","this","that","then","so",
  ])
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stop.has(w)),
    ),
  ).slice(0, 8)
}

const BASE_RULES = [
  "Verify before any destructive operation.",
  "Look at the screen before clicking an unfamiliar control.",
  "Prefer a platform-native mechanism over an invented workaround.",
  "Log every state change so a failure can be traced.",
  "Recover from a recoverable error instead of stopping silently.",
  "Report a missing dependency as an explicit error, never as a fake success.",
]

// Returns the base rules plus the recurring words from tasks that actually
// succeeded, so the guidance reflects real history rather than a static list.
export async function behaviourRules(): Promise<{
  rules: string[]
  learned: string[]
  recentLessons: Lesson[]
  lessonCount: number
}> {
  const lessons = await readLessons(200)
  const successful = lessons.filter((l) => l.worked && !l.failed)
  const frequency = new Map<string, number>()
  for (const lesson of successful) {
    for (const tag of lesson.tags) frequency.set(tag, (frequency.get(tag) ?? 0) + 1)
  }
  const learned = Array.from(frequency.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => `Recurring successful area "${tag}" (${count} times) — prefer the approach that worked.`)

  const failures = lessons.filter((l) => l.failed)
  if (failures.length > 0) {
    const recent = failures[0]
    if (recent?.failed) learned.push(`Recent failure to avoid: ${recent.failed.slice(0, 160)}`)
  }

  return { rules: [...BASE_RULES, ...learned], learned, recentLessons: lessons.slice(0, 10), lessonCount: lessons.length }
}
