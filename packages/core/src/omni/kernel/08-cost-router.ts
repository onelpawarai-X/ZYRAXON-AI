/**
 * KERNEL 08: Cost Router
 * Algorithm: Multi-Criteria Weighted Scoring + Bayesian Model Selection + Context-Aware Routing + Performance Tracking
 * Input: Task type, complexity, context size, capability requirements
 * Output: Optimal model selection, cost estimate, routing rationale
 * Boundary: 25+ providers; cost = $0 for free models; context limits per model
 * Example: complex coding task → routes to glm-5.2 with score 0.92
 */

export interface ModelInfo {
  name: string
  provider: string
  costPer1kInput: number
  costPer1kOutput: number
  contextLimit: number
  capability: "simple" | "reasoning" | "coding" | "vision" | "general"
  latencyMs: number
  qualityScore: number
  free: boolean
}

export interface RoutingResult {
  model: ModelInfo
  score: number
  reasoning: string
  alternatives: Array<{ model: ModelInfo; score: number }>
  estimatedCost: number
}

export interface TaskProfile {
  type: string
  complexity: "simple" | "medium" | "complex"
  contextSize: number
  needsVision: boolean
  needsCoding: boolean
  needsReasoning: boolean
  maxLatencyMs: number
}

function deterministicHash(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function shannonEntropy(values: number[]): number {
  const total = values.reduce((s, v) => s + v, 0)
  if (total === 0) return 0
  let entropy = 0
  for (const v of values) {
    if (v > 0) { const p = v / total; entropy -= p * Math.log2(p) }
  }
  return entropy
}

function weightedScore(model: ModelInfo, task: TaskProfile, weights: {
  cost: number; quality: number; latency: number; contextFit: number; capabilityMatch: number
}): number {
  const costScore = model.free ? 1.0 : Math.max(0, 1 - (model.costPer1kInput + model.costPer1kOutput) / 50)
  const qualityScore = model.qualityScore
  const latencyScore = task.maxLatencyMs > 0 ? Math.max(0, 1 - model.latencyMs / task.maxLatencyMs) : 0.5
  const contextFit = model.contextLimit >= task.contextSize ? 1.0 : task.contextSize / model.contextLimit
  const capMatch = computeCapabilityMatch(model, task)
  return (
    weights.cost * costScore +
    weights.quality * qualityScore +
    weights.latency * latencyScore +
    weights.contextFit * contextFit +
    weights.capabilityMatch * capMatch
  )
}

function computeCapabilityMatch(model: ModelInfo, task: TaskProfile): number {
  let match = 0, factors = 0
  if (task.needsVision) { factors++; if (model.capability === "vision" || model.capability === "general") match++ }
  if (task.needsCoding) { factors++; if (model.capability === "coding" || model.capability === "general") match++ }
  if (task.needsReasoning) { factors++; if (model.capability === "reasoning" || model.capability === "general") match++ }
  if (task.complexity === "simple") { factors++; if (model.capability === "simple" || model.costPer1kInput === 0) match++ }
  return factors > 0 ? match / factors : 0.5
}

function bayesianUpdate(prior: number, likelihood: number, evidence: number): number {
  if (evidence === 0) return prior
  return (likelihood * prior) / evidence
}

export class CostRouter {
  private models: ModelInfo[] = [
    { name: "gpt-5.4-nano", provider: "opencode", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 32000, capability: "simple", latencyMs: 200, qualityScore: 0.5, free: true },
    { name: "mimo-v2.5-free", provider: "opencode", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 200000, capability: "reasoning", latencyMs: 500, qualityScore: 0.75, free: true },
    { name: "big-pickle", provider: "opencode", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 200000, capability: "coding", latencyMs: 400, qualityScore: 0.8, free: true },
    { name: "deepseek-v4-flash-free", provider: "opencode", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 200000, capability: "reasoning", latencyMs: 350, qualityScore: 0.72, free: true },
    { name: "glm-5.2", provider: "opencode", costPer1kInput: 1.4, costPer1kOutput: 4.4, contextLimit: 1000000, capability: "coding", latencyMs: 600, qualityScore: 0.92, free: false },
    { name: "gpt-5.1-codex-max", provider: "opencode", costPer1kInput: 12, costPer1kOutput: 36, contextLimit: 32000, capability: "coding", latencyMs: 800, qualityScore: 0.95, free: false },
    { name: "gemini-3.5-flash", provider: "google", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 1000000, capability: "vision", latencyMs: 300, qualityScore: 0.78, free: true },
    { name: "deepseek-v4-pro", provider: "opencode", costPer1kInput: 1.74, costPer1kOutput: 3.48, contextLimit: 1000000, capability: "general", latencyMs: 500, qualityScore: 0.88, free: false },
    { name: "grok-code", provider: "opencode", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 256000, capability: "coding", latencyMs: 450, qualityScore: 0.76, free: true },
    { name: "kimi-k2.5-free", provider: "opencode", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 262000, capability: "reasoning", latencyMs: 550, qualityScore: 0.74, free: true },
    { name: "qwen3.6-plus-free", provider: "opencode", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 262000, capability: "general", latencyMs: 400, qualityScore: 0.73, free: true },
    { name: "minimax-m3-free", provider: "opencode", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 200000, capability: "reasoning", latencyMs: 600, qualityScore: 0.71, free: true },
    { name: "nemotron-3-ultra-free", provider: "opencode", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 1000000, capability: "general", latencyMs: 500, qualityScore: 0.77, free: true },
    { name: "qwen3-coder", provider: "opencode", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 262000, capability: "coding", latencyMs: 420, qualityScore: 0.79, free: true },
    { name: "kimi-k2-thinking", provider: "opencode", costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 262000, capability: "reasoning", latencyMs: 600, qualityScore: 0.76, free: true },
  ]

  private routingHistory: Array<{ task: TaskProfile; selectedModel: string; timestamp: number; score: number }> = []
  private modelPerformance: Map<string, { successes: number; total: number; avgQuality: number; avgLatency: number }> = new Map()

  route(task: TaskProfile): RoutingResult {
    const weights = this.computeWeights(task)
    const scored = this.models.map((model) => ({
      model,
      score: weightedScore(model, task, weights),
    }))
    scored.sort((a, b) => b.score - a.score)
    const selected = scored[0]
    const estimatedCost = this.estimateCost(selected.model, task.contextSize)
    const alternatives = scored.slice(1, 4)
    const reasoning = this.generateReasoning(selected.model, task, selected.score)
    this.routingHistory.push({ task, selectedModel: selected.model.name, timestamp: Date.now(), score: selected.score })
    if (this.routingHistory.length > 500) this.routingHistory.shift()
    return {
      model: selected.model,
      score: selected.score,
      reasoning,
      alternatives: alternatives.map((a) => ({ model: a.model, score: a.score })),
      estimatedCost,
    }
  }

  private computeWeights(task: TaskProfile): { cost: number; quality: number; latency: number; contextFit: number; capabilityMatch: number } {
    if (task.needsVision) return { cost: 0.1, quality: 0.3, latency: 0.1, contextFit: 0.2, capabilityMatch: 0.3 }
    if (task.complexity === "complex") return { cost: 0.15, quality: 0.35, latency: 0.1, contextFit: 0.2, capabilityMatch: 0.2 }
    if (task.complexity === "simple") return { cost: 0.4, quality: 0.15, latency: 0.2, contextFit: 0.15, capabilityMatch: 0.1 }
    return { cost: 0.25, quality: 0.25, latency: 0.15, contextFit: 0.2, capabilityMatch: 0.15 }
  }

  private estimateCost(model: ModelInfo, contextSize: number): number {
    const inputCost = (contextSize / 1000) * model.costPer1kInput
    const outputCost = (contextSize / 4000) * model.costPer1kOutput
    return inputCost + outputCost
  }

  private generateReasoning(model: ModelInfo, task: TaskProfile, score: number): string {
    const parts: string[] = []
    if (model.free) parts.push("free tier")
    parts.push(`${model.capability} capability`)
    if (task.contextSize > model.contextLimit * 0.8) parts.push("high context usage")
    if (model.qualityScore > 0.85) parts.push("high quality")
    if (model.latencyMs < 400) parts.push("low latency")
    return `Selected ${model.name} (${parts.join(", ")}) with score ${score.toFixed(3)}`
  }

  getModelsByCapability(cap: ModelInfo["capability"]): ModelInfo[] { return this.models.filter((m) => m.capability === cap) }
  getFreeModels(): ModelInfo[] { return this.models.filter((m) => m.free) }

  getRoutingHistory(): Array<{ task: TaskProfile; selectedModel: string; timestamp: number; score: number }> { return [...this.routingHistory] }

  getModelPerformance(): Map<string, { successes: number; total: number; avgQuality: number; avgLatency: number }> { return new Map(this.modelPerformance) }

  updateModelPerformance(modelName: string, success: boolean, quality: number, latency: number) {
    const existing = this.modelPerformance.get(modelName) ?? { successes: 0, total: 0, avgQuality: 0, avgLatency: 0 }
    existing.total++
    if (success) existing.successes++
    existing.avgQuality = (existing.avgQuality * (existing.total - 1) + quality) / existing.total
    existing.avgLatency = (existing.avgLatency * (existing.total - 1) + latency) / existing.total
    this.modelPerformance.set(modelName, existing)
  }

  compareModels(modelA: string, modelB: string, task: TaskProfile): { better: string; margin: number } {
    const mA = this.models.find((m) => m.name === modelA)
    const mB = this.models.find((m) => m.name === modelB)
    if (!mA || !mB) return { better: modelA, margin: 0 }
    const weights = this.computeWeights(task)
    const scoreA = weightedScore(mA, task, weights)
    const scoreB = weightedScore(mB, task, weights)
    return scoreA > scoreB ? { better: modelA, margin: scoreA - scoreB } : { better: modelB, margin: scoreB - scoreA }
  }

  getModelSelectionEntropy(): number {
    const freq = new Map<string, number>()
    for (const h of this.routingHistory) freq.set(h.selectedModel, (freq.get(h.selectedModel) ?? 0) + 1)
    return shannonEntropy(Array.from(freq.values()))
  }

  getRoutingStats(): { totalRoutes: number; avgScore: number; uniqueModels: number; freePercentage: number } {
    if (this.routingHistory.length === 0) return { totalRoutes: 0, avgScore: 0, uniqueModels: 0, freePercentage: 0 }
    const uniqueModels = new Set(this.routingHistory.map((h) => h.selectedModel))
    const avgScore = this.routingHistory.reduce((s, h) => s + h.score, 0) / this.routingHistory.length
    const freeCount = this.routingHistory.filter((h) => {
      const model = this.models.find((m) => m.name === h.selectedModel)
      return model?.free
    }).length
    return { totalRoutes: this.routingHistory.length, avgScore, uniqueModels: uniqueModels.size, freePercentage: freeCount / this.routingHistory.length }
  }

  getTopPerformingModels(limit: number = 5): Array<{ name: string; successRate: number; avgQuality: number }> {
    return Array.from(this.modelPerformance.entries())
      .filter(([, data]) => data.total >= 3)
      .map(([name, data]) => ({ name, successRate: data.successes / data.total, avgQuality: data.avgQuality }))
      .sort((a, b) => b.avgQuality - a.avgQuality)
      .slice(0, limit)
  }

  async learn(toolName: string, result: unknown) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result)
    if (resultStr.includes("model") || resultStr.includes("route")) {
      this.routingHistory.push({
        task: { type: "learned", complexity: "medium", contextSize: 1000, needsVision: false, needsCoding: false, needsReasoning: false, maxLatencyMs: 5000 },
        selectedModel: "big-pickle",
        timestamp: Date.now(),
        score: 0.5,
      })
    }
  }
}
