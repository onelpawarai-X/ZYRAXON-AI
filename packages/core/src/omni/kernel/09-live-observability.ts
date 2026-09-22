import { execSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

/**
 * KERNEL 09: Live Observability
 * Algorithm: Stack Trace Parsing + Error Clustering via Jaccard Similarity + Crash Pattern Analysis + Anomaly Detection via Z-Score
 * Input: Errors, stack traces, application state
 * Output: Crash reports, suggested fixes, error clusters, anomaly scores
 * Boundary: Max 500 reports; cluster threshold 0.3 similarity; anomaly z-score > 2.0
 * Example: Two similar stack traces → same cluster → shared fix suggestion
 */

export interface CrashReport {
  timestamp: number
  error: string
  stackTrace: string
  appState: string
  suggestedFix?: string
  cluster?: string
  severity: "low" | "medium" | "high" | "critical"
  occurrenceCount: number
}

export interface ErrorCluster {
  id: string
  patterns: string[]
  representativeError: string
  suggestedFix: string
  count: number
  firstSeen: number
  lastSeen: number
}

interface StackFrame {
  file: string
  line: number
  column: number
  function: string
}

function deterministicHash(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return union.size === 0 ? 0 : intersection.size / union.size
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

function parseStackTrace(stack: string): StackFrame[] {
  const frames: StackFrame[] = []
  const lines = stack.split("\n")
  for (const line of lines) {
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/)
    if (match) {
      frames.push({ file: match[2], line: parseInt(match[3], 10), column: parseInt(match[4], 10), function: match[1] })
    } else {
      const simpleMatch = line.match(/at\s+(.+?):(\d+):(\d+)/)
      if (simpleMatch) {
        frames.push({ file: simpleMatch[1], line: parseInt(simpleMatch[2], 10), column: parseInt(simpleMatch[3], 10), function: "<anonymous>" })
      }
    }
  }
  return frames
}

function extractErrorTokens(error: string): Set<string> {
  const tokens = new Set<string>()
  const words = error.toLowerCase().split(/[\s:;,()\[\]{}]+/).filter((w) => w.length > 2)
  for (const w of words) tokens.add(w)
  return tokens
}

function classifySeverity(error: string, stack: string): CrashReport["severity"] {
  const criticalPatterns = [/out of memory/i, /segfault/i, /fatal/i, /corrupt/i, /overflow/i]
  const highPatterns = [/unhandled.*rejection/i, /uncaught.*exception/i, /cannot.*read.*propert/i, /type.*error/i]
  const mediumPatterns = [/reference.*error/i, /syntax.*error/i, /network.*error/i, /timeout/i]
  for (const p of criticalPatterns) if (p.test(error) || p.test(stack)) return "critical"
  for (const p of highPatterns) if (p.test(error) || p.test(stack)) return "high"
  for (const p of mediumPatterns) if (p.test(error) || p.test(stack)) return "medium"
  return "low"
}

export class LiveObservability {
  private reports: CrashReport[] = []
  private clusters: ErrorCluster[] = []
  private maxReports = 500
  private clusterThreshold = 0.3
  private errorTimeline: Array<{ timestamp: number; errorCount: number; severity: string }> = []

  async captureError(error: Error, context?: string): Promise<CrashReport> {
    const report: CrashReport = {
      timestamp: Date.now(),
      error: error.message,
      stackTrace: error.stack || "",
      appState: context ?? this.getCurrentAppState(),
      severity: classifySeverity(error.message, error.stack || ""),
      occurrenceCount: 1,
    }
    report.suggestedFix = this.analyzeAndSuggest(report)
    report.cluster = this.assignToCluster(report)
    this.reports.push(report)
    if (this.reports.length > this.maxReports) this.reports.shift()
    this.updateTimeline(report)
    return report
  }

  private getCurrentAppState(): string {
    try {
      const logPath = join(process.cwd(), "packages/core/logs/error.log")
      if (existsSync(logPath)) {
        const content = readFileSync(logPath, "utf-8")
        return content.slice(-500)
      }
    } catch {}
    return "unknown"
  }

  private analyzeAndSuggest(report: CrashReport): string {
    const error = report.error
    if (error.includes("undefined") || error.includes("null")) return "Add null check before accessing the property"
    if (error.includes("not a function")) return "Check if the import/exports are correct for the module"
    if (error.includes("ENOENT")) return "File not found — check the path or create the directory"
    if (error.includes("EACCES")) return "Permission denied — check file permissions or use sudo"
    if (error.includes("ECONNREFUSED")) return "Connection refused — verify the server is running"
    if (error.includes("ETIMEOUT")) return "Connection timed out — check network or increase timeout"
    if (error.includes("SyntaxError")) return "Syntax error — check bracket matching and string escaping"
    if (error.includes("TypeError")) return "Type error — verify the variable type and add type guards"
    if (error.includes("ReferenceError")) return "Undefined variable — check scope and imports"
    if (error.includes("ENOMEM") || error.includes("out of memory")) return "Out of memory — reduce batch size or increase heap"
    if (error.includes("Cannot read properties")) return "Null reference — add optional chaining or null check"
    if (error.includes("is not a function")) return "Type mismatch — verify the import and function signature"
    const frames = parseStackTrace(report.stackTrace)
    if (frames.length > 0) {
      const topFrame = frames[0]
      return `Error at ${topFrame.file}:${topFrame.line} in ${topFrame.function} — review the code at this location`
    }
    return "Analyze the stack trace manually — check the error context"
  }

  private assignToCluster(report: CrashReport): string {
    const reportTokens = extractErrorTokens(report.error)
    for (const cluster of this.clusters) {
      const clusterTokens = extractErrorTokens(cluster.representativeError)
      const similarity = jaccardSimilarity(reportTokens, clusterTokens)
      if (similarity >= this.clusterThreshold) {
        cluster.patterns.push(report.error.slice(0, 100))
        cluster.count++
        cluster.lastSeen = report.timestamp
        return cluster.id
      }
    }
    const newCluster: ErrorCluster = {
      id: `cluster-${deterministicHash(report.error).toString(36)}`,
      patterns: [report.error.slice(0, 100)],
      representativeError: report.error,
      suggestedFix: report.suggestedFix ?? "",
      count: 1,
      firstSeen: report.timestamp,
      lastSeen: report.timestamp,
    }
    this.clusters.push(newCluster)
    return newCluster.id
  }

  private updateTimeline(report: CrashReport) {
    const hourBucket = Math.floor(report.timestamp / 3600000) * 3600000
    const existing = this.errorTimeline.find((t) => t.timestamp === hourBucket)
    if (existing) {
      existing.errorCount++
    } else {
      this.errorTimeline.push({ timestamp: hourBucket, errorCount: 1, severity: report.severity })
    }
    if (this.errorTimeline.length > 168) this.errorTimeline.shift()
  }

  getClusters(): ErrorCluster[] { return [...this.clusters] }
  getRecentReports(n: number = 5): CrashReport[] { return this.reports.slice(-n) }

  getSeverityDistribution(): Record<string, number> {
    const dist: Record<string, number> = {}
    for (const r of this.reports) dist[r.severity] = (dist[r.severity] ?? 0) + 1
    return dist
  }

  getErrorFrequency(): Map<string, number> {
    const freq = new Map<string, number>()
    for (const r of this.reports) { const key = r.error.slice(0, 50); freq.set(key, (freq.get(key) ?? 0) + 1) }
    return freq
  }

  computeAnomalyScore(): number {
    if (this.reports.length < 10) return 0
    const hourlyCounts: number[] = []
    const now = Date.now()
    for (let h = 0; h < 24; h++) {
      const hourStart = now - (h + 1) * 3600000
      const hourEnd = now - h * 3600000
      const count = this.reports.filter((r) => r.timestamp >= hourStart && r.timestamp < hourEnd).length
      hourlyCounts.push(count)
    }
    const mean = hourlyCounts.reduce((s, v) => s + v, 0) / hourlyCounts.length
    const variance = hourlyCounts.reduce((s, v) => s + (v - mean) ** 2, 0) / hourlyCounts.length
    const stdDev = Math.sqrt(variance)
    const currentHour = hourlyCounts[0] ?? 0
    return stdDev > 0 ? (currentHour - mean) / stdDev : 0
  }

  getTopErrors(limit: number = 5): Array<{ error: string; count: number; lastSeen: number }> {
    const freq = this.getErrorFrequency()
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([error, count]) => {
        const lastReport = this.reports.find((r) => r.error.startsWith(error.slice(0, 20)))
        return { error, count, lastSeen: lastReport?.timestamp ?? 0 }
      })
  }

  getTimeline(): Array<{ timestamp: number; errorCount: number; severity: string }> { return [...this.errorTimeline] }

  getErrorEntropy(): number {
    const freq = this.getErrorFrequency()
    return shannonEntropy(Array.from(freq.values()))
  }

  getClusterStats(): { totalClusters: number; avgClusterSize: number; largestCluster: number } {
    if (this.clusters.length === 0) return { totalClusters: 0, avgClusterSize: 0, largestCluster: 0 }
    const sizes = this.clusters.map((c) => c.count)
    return {
      totalClusters: this.clusters.length,
      avgClusterSize: sizes.reduce((s, v) => s + v, 0) / sizes.length,
      largestCluster: Math.max(...sizes),
    }
  }

  getRecentErrorRate(): { errorsPerMinute: number; trend: "increasing" | "decreasing" | "stable" } {
    const now = Date.now()
    const recent = this.reports.filter((r) => now - r.timestamp < 60000)
    const older = this.reports.filter((r) => now - r.timestamp >= 60000 && now - r.timestamp < 120000)
    const recentRate = recent.length
    const olderRate = older.length
    const trend = recentRate > olderRate * 1.2 ? "increasing" : recentRate < olderRate * 0.8 ? "decreasing" : "stable"
    return { errorsPerMinute: recentRate, trend }
  }

  async learn(toolName: string, result: unknown) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result)
    if (resultStr.includes("Error") || resultStr.includes("error")) {
      this.captureError(new Error(resultStr.slice(0, 200)), `tool:${toolName}`)
    }
  }
}
