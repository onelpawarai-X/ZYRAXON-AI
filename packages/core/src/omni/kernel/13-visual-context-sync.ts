/**
 * KERNEL 13: Visual Context Sync
 * Algorithm: Error Pattern Detection + UI Element Extraction + Frame Similarity via Cosine
 * Input: Screen text, HTML content, browser URL
 * Output: Visual context, detected errors, UI elements, frame history
 * Boundary: Max 50 frames in history; error buffer capped at 20; similarity threshold 0.7
 * Example: Detects "TypeError" in screen text → adds to error buffer → suggests fix
 */

export interface VisualContext {
  screenContent: string
  detectedErrors: string[]
  uiElements: string[]
  browserUrl?: string
  timestamp: number
  frameHash: number
}

interface UIElement {
  type: string
  text: string
  selector?: string
}

function deterministicHash(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function textToVector(text: string, vocabulary: string[]): number[] {
  const words = text.toLowerCase().split(/\s+/)
  const tf = new Map<string, number>()
  for (const w of words) if (w.length > 2) tf.set(w, (tf.get(w) ?? 0) + 1)
  const total = words.length || 1
  return vocabulary.map((term) => (tf.get(term) ?? 0) / total)
}

const ERROR_PATTERNS: RegExp[] = [
  /(?:Error|Exception|Fatal|Failed|Crash):\s*[^\n]+/gi,
  /(?:Uncaught|Unhandled|Rejected|Rejection)[^\n]+/gi,
  /(?:SyntaxError|TypeError|ReferenceError|RangeError|URIError):[^\n]+/gi,
  /\b(?:404|500|403|401|502|503)\s+(?:Error|Not Found|Forbidden|Unauthorized)/gi,
  /(?:ENOENT|EACCES|ECONNREFUSED|ETIMEDOUT|ENOMEM)[^\n]*/gi,
  /(?:panic|abort|segfault|core dump)[^\n]*/gi,
]

const UI_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: "button", pattern: /<button[^>]*>([^<]+)<\/button>/gi },
  { type: "link", pattern: /<a[^>]*>([^<]+)<\/a>/gi },
  { type: "input", pattern: /<input[^>]*(?:placeholder="([^"]*)")?[^>]*>/gi },
  { type: "aria-label", pattern: /aria-label="([^"]+)"/gi },
  { type: "heading", pattern: /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi },
  { type: "modal", pattern: /(?:modal|dialog|popup|overlay)/gi },
  { type: "form", pattern: /<form[^>]*>([\s\S]*?)<\/form>/gi },
  { type: "nav", pattern: /<nav[^>]*>([\s\S]*?)<\/nav>/gi },
]

export class VisualContextSync {
  private lastContext: VisualContext | null = null
  private errorBuffer: string[] = []
  private frameHistory: VisualContext[] = []
  private maxFrames = 50
  private vocabulary: string[] = []
  private uiElementHistory: Map<string, number> = new Map()

  syncFromScreen(screenText: string, browserUrl?: string): VisualContext {
    if (this.vocabulary.length === 0) this.buildVocabulary(screenText)
    const context: VisualContext = {
      screenContent: screenText,
      detectedErrors: this.detectErrors(screenText),
      uiElements: this.extractUIElements(screenText).map((e) => `${e.type}: ${e.text}`),
      browserUrl,
      timestamp: Date.now(),
      frameHash: deterministicHash(screenText),
    }
    if (this.lastContext) {
      const similarity = this.computeFrameSimilarity(this.lastContext.screenContent, screenText)
      if (similarity > 0.95) return this.lastContext
    }
    this.lastContext = context
    this.frameHistory.push(context)
    if (this.frameHistory.length > this.maxFrames) this.frameHistory.shift()
    if (context.detectedErrors.length > 0) {
      this.errorBuffer.push(...context.detectedErrors)
      if (this.errorBuffer.length > 20) this.errorBuffer.splice(0, this.errorBuffer.length - 20)
    }
    for (const el of context.uiElements) this.uiElementHistory.set(el, (this.uiElementHistory.get(el) ?? 0) + 1)
    return context
  }

  private buildVocabulary(text: string) {
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    const freq = new Map<string, number>()
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1)
    this.vocabulary = Array.from(freq.entries())
      .filter(([, f]) => f >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200)
      .map(([w]) => w)
  }

  private detectErrors(text: string): string[] {
    const errors: string[] = []
    for (const pattern of ERROR_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags)
      let match
      while ((match = regex.exec(text)) !== null) errors.push(match[0].trim())
    }
    return [...new Set(errors)].slice(0, 5)
  }

  private extractUIElements(text: string): UIElement[] {
    const elements: UIElement[] = []
    for (const { type, pattern } of UI_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags)
      let match
      while ((match = regex.exec(text)) !== null) {
        const elText = (match[1] ?? match[0]).trim()
        if (elText.length > 0 && elText.length < 200) elements.push({ type, text: elText })
      }
    }
    return elements.slice(0, 15)
  }

  private computeFrameSimilarity(textA: string, textB: string): number {
    if (this.vocabulary.length === 0) return 0
    const vecA = textToVector(textA, this.vocabulary)
    const vecB = textToVector(textB, this.vocabulary)
    return cosineSimilarity(vecA, vecB)
  }

  getLastContext(): VisualContext | null {
    return this.lastContext
  }

  getRecentErrors(): string[] {
    return [...this.errorBuffer]
  }

  getFrameHistory(): VisualContext[] {
    return [...this.frameHistory]
  }

  getFrequentUIElements(limit: number = 10): Array<{ element: string; count: number }> {
    return Array.from(this.uiElementHistory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([element, count]) => ({ element, count }))
  }

  getErrorTrend(): Array<{ timestamp: number; errorCount: number }> {
    return this.frameHistory.map((f) => ({ timestamp: f.timestamp, errorCount: f.detectedErrors.length }))
  }

  detectAnomalies(): Array<{ type: string; description: string; severity: string }> {
    const anomalies: Array<{ type: string; description: string; severity: string }> = []
    if (this.errorBuffer.length > 10) anomalies.push({ type: "error_spike", description: `${this.errorBuffer.length} errors in buffer`, severity: "high" })
    if (this.frameHistory.length >= 2) {
      const last = this.frameHistory[this.frameHistory.length - 1]
      const prev = this.frameHistory[this.frameHistory.length - 2]
      const similarity = this.computeFrameSimilarity(last.screenContent, prev.screenContent)
      if (similarity < 0.3) anomalies.push({ type: "screen_change", description: "Major screen content change detected", severity: "medium" })
    }
    return anomalies
  }

  async learn(toolName: string, result: unknown) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result)
    if (resultStr.includes("Error") || resultStr.includes("error")) {
      this.errorBuffer.push(resultStr.slice(0, 100))
      if (this.errorBuffer.length > 20) this.errorBuffer.shift()
    }
  }
}
