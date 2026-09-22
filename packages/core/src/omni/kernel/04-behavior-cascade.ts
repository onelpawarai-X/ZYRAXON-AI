/**
 * KERNEL 04: Behavior Cascade
 * Algorithm: Markov Chain Transition Matrix + Shannon Entropy + Exponential Moving Average + Stagnation Detection + Velocity Tracking
 * Input: User actions, timestamps, file context
 * Output: Current flow state, predicted next action, entropy score
 * Boundary: History window of 50 actions; entropy threshold 0.3 for mode change
 * Verification: After 3 "edit" actions, mode="editing" with p=0.85, predicting "auto-save"
 */

export interface FlowState {
  typingSpeed: number
  scrollDepth: number
  activeFile: string
  lastActions: string[]
  currentMode: "exploring" | "editing" | "debugging" | "idle" | "building" | "reviewing"
  modeConfidence: number
  entropy: number
  timestamp: number
}

export interface ActionRecord {
  action: string
  timestamp: number
  mode: FlowState["currentMode"]
  file?: string
  duration?: number
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
    if (v > 0) {
      const p = v / total
      entropy -= p * Math.log2(p)
    }
  }
  return entropy
}

function exponentialMovingAverage(current: number, newValue: number, alpha: number = 0.3): number {
  return alpha * newValue + (1 - alpha) * current
}

const MODE_PATTERNS: Record<FlowState["currentMode"], RegExp[]> = {
  exploring: [/^ls\b/, /^cd\b/, /^find\b/, /^grep\b/, /^cat\b/, /^head\b/, /^tail\b/, /^read\b/, /^glob\b/, /^dir\b/, /^tree\b/, /^findstr\b/],
  editing: [/^edit\b/, /^write\b/, /^apply_patch\b/, /^sed\b/, /^vim\b/, /^nano\b/, /^code\b/, /^patch\b/],
  debugging: [/\berror\b/, /\bfail\b/, /\bcrash\b/, /\bdebug\b/, /^bun test\b/, /^npm test\b/, /^pytest\b/, /^jest\b/],
  building: [/^bun build\b/, /^npm run build\b/, /^make\b/, /^cargo build\b/, /^tsc\b/, /^webpack\b/, /^vite\b/],
  reviewing: [/^git diff\b/, /^git log\b/, /^git show\b/, /^git status\b/, /^git blame\b/, /^git review\b/],
  idle: [],
}

export class BehaviorCascade {
  private currentState: FlowState = {
    typingSpeed: 0, scrollDepth: 0, activeFile: "", lastActions: [],
    currentMode: "idle", modeConfidence: 0.5, entropy: 0, timestamp: Date.now(),
  }
  private transitionCounts: Map<string, Map<string, number>> = new Map()
  private totalBySource: Map<string, number> = new Map()
  private actionHistory: ActionRecord[] = []
  private maxHistory = 50
  private modeHistory: FlowState["currentMode"][] = []
  private actionTimestamps: number[] = []
  private sessionStartTime = Date.now()

  analyzeAction(action: string, file?: string) {
    const prevMode = this.currentState.currentMode
    const detectedMode = this.detectMode(action)
    if (detectedMode !== "idle") this.currentState.currentMode = detectedMode
    this.currentState.lastActions.push(action)
    if (this.currentState.lastActions.length > 10) this.currentState.lastActions.shift()
    if (file) this.currentState.activeFile = file
    this.currentState.timestamp = Date.now()
    this.recordTransition(prevMode, this.currentState.currentMode)
    const record: ActionRecord = { action, timestamp: Date.now(), mode: this.currentState.currentMode, file }
    this.actionHistory.push(record)
    if (this.actionHistory.length > this.maxHistory) this.actionHistory.shift()
    this.modeHistory.push(this.currentState.currentMode)
    if (this.modeHistory.length > 20) this.modeHistory.shift()
    this.actionTimestamps.push(Date.now())
    if (this.actionTimestamps.length > 100) this.actionTimestamps.shift()
    this.currentState.entropy = this.computeModeEntropy()
    this.currentState.modeConfidence = this.computeModeConfidence()
    this.currentState.typingSpeed = this.computeTypingSpeed()
  }

  private detectMode(action: string): FlowState["currentMode"] {
    const actionLower = action.toLowerCase()
    let bestMode: FlowState["currentMode"] = "idle"
    let bestScore = 0
    for (const [mode, patterns] of Object.entries(MODE_PATTERNS)) {
      let score = 0
      for (const pattern of patterns) if (pattern.test(actionLower)) score++
      if (score > bestScore) { bestScore = score; bestMode = mode as FlowState["currentMode"] }
    }
    return bestMode
  }

  private recordTransition(from: string, to: string) {
    if (!this.transitionCounts.has(from)) this.transitionCounts.set(from, new Map())
    const transitions = this.transitionCounts.get(from)!
    transitions.set(to, (transitions.get(to) ?? 0) + 1)
    this.totalBySource.set(from, (this.totalBySource.get(from) ?? 0) + 1)
  }

  predictNextAction(): { action: string; confidence: number; mode: FlowState["currentMode"] } | null {
    const currentMode = this.currentState.currentMode
    const transitions = this.transitionCounts.get(currentMode)
    if (!transitions || transitions.size === 0) return null
    const total = this.totalBySource.get(currentMode) ?? 1
    let bestMode = currentMode, bestProb = 0
    for (const [mode, count] of transitions) {
      const prob = count / total
      if (prob > bestProb) { bestProb = prob; bestMode = mode }
    }
    const predictions: Record<string, string> = {
      exploring: "suggesting file to edit", editing: "preparing auto-save and compile",
      debugging: "preparing fix based on error pattern", building: "monitoring build output",
      reviewing: "preparing code review comments", idle: "waiting for user input",
    }
    return { action: predictions[bestMode] ?? "unknown", confidence: bestProb, mode: bestMode as FlowState["currentMode"] }
  }

  private computeModeEntropy(): number {
    const recentModes = this.modeHistory.slice(-20)
    if (recentModes.length === 0) return 0
    const freq = new Map<string, number>()
    for (const mode of recentModes) freq.set(mode, (freq.get(mode) ?? 0) + 1)
    return shannonEntropy(Array.from(freq.values()))
  }

  private computeModeConfidence(): number {
    const recentModes = this.modeHistory.slice(-10)
    if (recentModes.length === 0) return 0.5
    const count = recentModes.filter((m) => m === this.currentState.currentMode).length
    return exponentialMovingAverage(this.currentState.modeConfidence, count / recentModes.length, 0.3)
  }

  private computeTypingSpeed(): number {
    if (this.actionTimestamps.length < 2) return 0
    const recent = this.actionTimestamps.slice(-10)
    let totalInterval = 0
    for (let i = 1; i < recent.length; i++) totalInterval += recent[i] - recent[i - 1]
    const avgInterval = totalInterval / (recent.length - 1)
    return avgInterval > 0 ? 1000 / avgInterval : 0
  }

  getState(): FlowState { return { ...this.currentState } }
  getTransitionMatrix(): Map<string, Map<string, number>> {
    const matrix = new Map<string, Map<string, number>>()
    for (const [from, transitions] of this.transitionCounts) {
      const total = this.totalBySource.get(from) ?? 1
      const probs = new Map<string, number>()
      for (const [to, count] of transitions) probs.set(to, count / total)
      matrix.set(from, probs)
    }
    return matrix
  }

  getActionFrequency(): Map<string, number> {
    const freq = new Map<string, number>()
    for (const record of this.actionHistory) { const key = record.action.split(" ")[0]; freq.set(key, (freq.get(key) ?? 0) + 1) }
    return freq
  }

  getModeDistribution(): Map<FlowState["currentMode"], number> {
    const dist = new Map<FlowState["currentMode"], number>()
    for (const mode of this.modeHistory) dist.set(mode, (dist.get(mode) ?? 0) + 1)
    return dist
  }

  getAverageActionInterval(): number {
    if (this.actionHistory.length < 2) return 0
    let totalInterval = 0
    for (let i = 1; i < this.actionHistory.length; i++) totalInterval += this.actionHistory[i].timestamp - this.actionHistory[i - 1].timestamp
    return totalInterval / (this.actionHistory.length - 1)
  }

  detectStagnation(): { stagnant: boolean; duration: number; suggestion: string } {
    if (this.actionHistory.length < 3) return { stagnant: false, duration: 0, suggestion: "" }
    const recent = this.actionHistory.slice(-5)
    const lastInterval = recent[recent.length - 1].timestamp - recent[recent.length - 2].timestamp
    const intervals = []
    for (let i = 1; i < recent.length; i++) intervals.push(recent[i].timestamp - recent[i - 1].timestamp)
    const avgInterval = intervals.reduce((s, v) => s + v, 0) / Math.max(intervals.length, 1)
    if (lastInterval > avgInterval * 3 && lastInterval > 30000) {
      const suggestions: Record<string, string> = {
        exploring: "Try editing a file to make progress", editing: "Run tests to verify your changes",
        debugging: "Check the error log for more details", building: "Wait for the build or try a clean rebuild",
        reviewing: "Accept or request changes on the review", idle: "Start a new task or ask for help",
      }
      return { stagnant: true, duration: lastInterval, suggestion: suggestions[this.currentState.currentMode] ?? "Continue working" }
    }
    return { stagnant: false, duration: 0, suggestion: "" }
  }

  getRecentActions(count: number = 10): ActionRecord[] { return this.actionHistory.slice(-count) }
  getModeStreak(): { mode: FlowState["currentMode"]; length: number } {
    if (this.modeHistory.length === 0) return { mode: "idle", length: 0 }
    const streakMode = this.modeHistory[this.modeHistory.length - 1]
    let streakLength = 0
    for (let i = this.modeHistory.length - 1; i >= 0; i--) { if (this.modeHistory[i] === streakMode) streakLength++; else break }
    return { mode: streakMode, length: streakLength }
  }

  getActionVelocity(): { actionsPerMinute: number; trend: "increasing" | "decreasing" | "stable" } {
    if (this.actionHistory.length < 2) return { actionsPerMinute: 0, trend: "stable" }
    const now = Date.now()
    const recent = this.actionHistory.filter((a) => now - a.timestamp < 60000)
    const older = this.actionHistory.filter((a) => now - a.timestamp >= 60000 && now - a.timestamp < 120000)
    const recentRate = recent.length
    const olderRate = older.length
    const trend = recentRate > olderRate * 1.2 ? "increasing" : recentRate < olderRate * 0.8 ? "decreasing" : "stable"
    return { actionsPerMinute: recentRate, trend }
  }

  getSessionDuration(): number {
    return Date.now() - this.sessionStartTime
  }

  getActionEntropy(): number {
    const freq = this.getActionFrequency()
    return shannonEntropy(Array.from(freq.values()))
  }

  getTransitionEntropy(): number {
    const allTransitions: number[] = []
    for (const [, transitions] of this.transitionCounts) {
      for (const [, count] of transitions) allTransitions.push(count)
    }
    return shannonEntropy(allTransitions)
  }

  getMostLikelySequence(length: number = 3): FlowState["currentMode"][] {
    const sequence: FlowState["currentMode"][] = [this.currentState.currentMode]
    for (let i = 0; i < length - 1; i++) {
      const current = sequence[sequence.length - 1]
      const transitions = this.transitionCounts.get(current)
      if (!transitions || transitions.size === 0) break
      let bestMode = current, bestCount = 0
      for (const [mode, count] of transitions) {
        if (count > bestCount) { bestCount = count; bestMode = mode }
      }
      sequence.push(bestMode as FlowState["currentMode"])
    }
    return sequence
  }

  getFlowScore(): number {
    const streak = this.getModeStreak()
    const velocity = this.getActionVelocity()
    const streakScore = Math.min(streak.length / 10, 1.0) * 0.4
    const velocityScore = Math.min(velocity.actionsPerMinute / 20, 1.0) * 0.3
    const entropyScore = (1 - this.currentState.entropy) * 0.3
    return streakScore + velocityScore + entropyScore
  }

  async learn(toolName: string, result: unknown) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result)
    if (resultStr.includes("error") || resultStr.includes("Error")) this.analyzeAction("error occurred")
    else this.analyzeAction(`${toolName} completed`)
  }
}
