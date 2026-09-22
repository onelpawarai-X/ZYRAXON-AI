import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

export interface ToolRecord {
  id: number
  toolName: string
  argsHash: string
  resultSummary: string
  success: number
  latency: number
  timestamp: number
  sessionId: string
  errorCategory: string
}

export interface SemanticNode {
  id: number
  concept: string
  frequency: number
  successRate: number
  avgLatency: number
  relatedConcepts: string
  category: string
  promoted: number
  promotedAt: number | null
}

export interface CachedTemplate {
  id: number
  patternHash: string
  concept: string
  template: string
  successRate: number
  usageCount: number
  createdAt: number
  lastUsedAt: number
}

function deterministicHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  let h2 = 0x62b83f54
  for (let i = 0; i < input.length; i++) {
    h2 ^= input.charCodeAt(i)
    h2 = Math.imul(h2, 0x1b873593)
  }
  return (hash >>> 0).toString(36) + (h2 >>> 0).toString(36)
}

function sha256Like(input: string): string {
  let h = 0xdeadbeef
  let h2 = 0xcafebabe
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h = Math.imul(h ^ c, 0x5bd1e995)
    h ^= h >>> 15
    h2 = Math.imul(h2 ^ c, 0x27d4eb2d)
    h2 ^= h2 >>> 13
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h ^= Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35)
  return ((h >>> 0) ^ (h2 >>> 0)).toString(16).padStart(8, "0")
}

export class MemoryGraphEngine {
  private db: Database
  private pruningInterval: ReturnType<typeof setInterval> | null = null
  private promotionThreshold = 0.95
  private minFrequencyForPromotion = 3

  constructor(dataDir?: string) {
    const dir = dataDir ?? join(process.cwd(), ".zyraxon-data")
    mkdirSync(dir, { recursive: true })
    const dbPath = join(dir, "omni-memory.db")
    this.db = new Database(dbPath)
    this.db.run("PRAGMA journal_mode = WAL")
    this.db.run("PRAGMA synchronous = NORMAL")
    this.db.run("PRAGMA busy_timeout = 5000")
    this.db.run("PRAGMA cache_size = -32768")
    this.db.run("PRAGMA temp_store = MEMORY")
    this.initSchema()
  }

  private initSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tool_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        args_hash TEXT NOT NULL DEFAULT '',
        result_summary TEXT NOT NULL DEFAULT '',
        success INTEGER NOT NULL DEFAULT 0,
        latency REAL NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        session_id TEXT NOT NULL DEFAULT '',
        error_category TEXT NOT NULL DEFAULT ''
      )
    `)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS semantic_graph (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        concept TEXT NOT NULL UNIQUE,
        frequency INTEGER NOT NULL DEFAULT 1,
        success_rate REAL NOT NULL DEFAULT 1.0,
        avg_latency REAL NOT NULL DEFAULT 0,
        related_concepts TEXT NOT NULL DEFAULT '[]',
        category TEXT NOT NULL DEFAULT 'general',
        promoted INTEGER NOT NULL DEFAULT 0,
        promoted_at INTEGER
      )
    `)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cached_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_hash TEXT NOT NULL UNIQUE,
        concept TEXT NOT NULL,
        template TEXT NOT NULL DEFAULT '',
        success_rate REAL NOT NULL DEFAULT 0,
        usage_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL
      )
    `)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS edge_weights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_concept TEXT NOT NULL,
        target_concept TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        co_occurrence INTEGER NOT NULL DEFAULT 1,
        last_seen INTEGER NOT NULL,
        UNIQUE(source_concept, target_concept)
      )
    `)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_tool_history_name ON tool_history(tool_name)
    `)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_tool_history_ts ON tool_history(timestamp)
    `)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_semantic_concept ON semantic_graph(concept)
    `)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_edge_source ON edge_weights(source_concept)
    `)
  }

  init() {
    this.startPruningLoop()
  }

  record(toolName: string, result: unknown, success: boolean, sessionId: string = "") {
    const now = Date.now()
    const latency = performance.now()
    const resultSummary = typeof result === "string" ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200)
    const argsHash = sha256Like(toolName + resultSummary)
    const errorCategory = success ? "" : categorizeError(resultSummary)
    this.db.run(
      `INSERT INTO tool_history (tool_name, args_hash, result_summary, success, latency, timestamp, session_id, error_category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [toolName, argsHash, resultSummary, success ? 1 : 0, latency, now, sessionId, errorCategory],
    )
    this.updateSemanticGraph(toolName, latency, success)
    this.updateEdgeWeights(toolName)
  }

  private updateSemanticGraph(concept: string, latency: number, success: boolean) {
    const existing = this.db.query("SELECT * FROM semantic_graph WHERE concept = ?").get(concept) as SemanticNode | undefined
    if (existing) {
      const newFreq = existing.frequency + 1
      const newRate = (existing.successRate * existing.frequency + (success ? 1 : 0)) / newFreq
      const newLat = (existing.avgLatency * existing.frequency + latency) / newFreq
      this.db.run(
        `UPDATE semantic_graph SET frequency = ?, success_rate = ?, avg_latency = ? WHERE concept = ?`,
        [newFreq, newRate, newLat, concept],
      )
      if (newFreq >= this.minFrequencyForPromotion && newRate >= this.promotionThreshold && !existing.promoted) {
        this.promoteToTemplate(concept, newRate)
      }
    } else {
      this.db.run(
        `INSERT INTO semantic_graph (concept, frequency, success_rate, avg_latency, category, promoted, promoted_at)
         VALUES (?, 1, ?, ?, ?, 0, NULL)`,
        [concept, success ? 1.0 : 0.0, latency, categorizeConcept(concept)],
      )
    }
  }

  private updateEdgeWeights(currentConcept: string) {
    const recentTools = this.db
      .query(
        `SELECT DISTINCT tool_name FROM tool_history
         WHERE timestamp > ? AND tool_name != ?
         ORDER BY timestamp DESC LIMIT 10`,
      )
      .all(Date.now() - 60000, currentConcept) as Array<{ tool_name: string }>
    const now = Date.now()
    for (const row of recentTools) {
      const existing = this.db
        .query("SELECT * FROM edge_weights WHERE source_concept = ? AND target_concept = ?")
        .get(currentConcept, row.tool_name) as { weight: number; co_occurrence: number } | undefined
      if (existing) {
        const newWeight = existing.weight * 0.9 + 1.0 * 0.1
        this.db.run(
          `UPDATE edge_weights SET weight = ?, co_occurrence = co_occurrence + 1, last_seen = ?
           WHERE source_concept = ? AND target_concept = ?`,
          [newWeight, now, currentConcept, row.tool_name],
        )
      } else {
        this.db.run(
          `INSERT INTO edge_weights (source_concept, target_concept, weight, co_occurrence, last_seen)
           VALUES (?, ?, 1.0, 1, ?)`,
          [currentConcept, row.tool_name, now],
        )
      }
    }
  }

  private promoteToTemplate(concept: string, successRate: number) {
    const now = Date.now()
    const patternHash = sha256Like(concept + now)
    const template = JSON.stringify({ concept, successRate, promotedAt: now })
    this.db.run(
      `INSERT OR REPLACE INTO cached_templates (pattern_hash, concept, template, success_rate, usage_count, created_at, last_used_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [patternHash, concept, template, successRate, now, now],
    )
    this.db.run(
      `UPDATE semantic_graph SET promoted = 1, promoted_at = ? WHERE concept = ?`,
      [now, concept],
    )
  }

  getHighSuccessPatterns(threshold: number = 0.95): SemanticNode[] {
    return this.db
      .query(
        `SELECT * FROM semantic_graph WHERE success_rate >= ? AND frequency >= ? ORDER BY success_rate DESC, frequency DESC`,
      )
      .all(threshold, this.minFrequencyForPromotion) as SemanticNode[]
  }

  getCachedTemplates(): CachedTemplate[] {
    return this.db.query("SELECT * FROM cached_templates ORDER BY success_rate DESC, usage_count DESC").all() as CachedTemplate[]
  }

  getRelatedConcepts(concept: string, limit: number = 10): Array<{ concept: string; weight: number }> {
    const edges = this.db
      .query(
        `SELECT target_concept as concept, weight FROM edge_weights WHERE source_concept = ?
         UNION
         SELECT source_concept as concept, weight FROM edge_weights WHERE target_concept = ?
         ORDER BY weight DESC LIMIT ?`,
      )
      .all(concept, concept, limit) as Array<{ concept: string; weight: number }>
    return edges
  }

  computeCentrality(): Array<{ concept: string; centrality: number }> {
    const nodes = this.db.query("SELECT concept, frequency FROM semantic_graph").all() as Array<{ concept: string; frequency: number }>
    const edges = this.db.query("SELECT source_concept, target_concept, weight FROM edge_weights").all() as Array<{
      source_concept: string
      target_concept: string
      weight: number
    }>
    const nodeCount = nodes.length
    if (nodeCount === 0) return []
    const degreeMap = new Map<string, number>()
    for (const node of nodes) degreeMap.set(node.concept, 0)
    for (const edge of edges) {
      degreeMap.set(edge.source_concept, (degreeMap.get(edge.source_concept) ?? 0) + 1)
      degreeMap.set(edge.target_concept, (degreeMap.get(edge.target_concept) ?? 0) + 1)
    }
    const maxDegree = Math.max(...Array.from(degreeMap.values()), 1)
    const result: Array<{ concept: string; centrality: number }> = []
    for (const node of nodes) {
      const degree = degreeMap.get(node.concept) ?? 0
      const frequencyScore = Math.min(node.frequency / 100, 1.0)
      const centrality = 0.6 * (degree / maxDegree) + 0.4 * frequencyScore
      result.push({ concept: node.concept, centrality })
    }
    result.sort((a, b) => b.centrality - a.centrality)
    return result
  }

  getToolStats(toolName: string): {
    totalCalls: number
    successRate: number
    avgLatency: number
    errorBreakdown: Record<string, number>
  } {
    const stats = this.db
      .query(
        `SELECT
          COUNT(*) as total,
          SUM(success) as successes,
          AVG(latency) as avg_lat
         FROM tool_history WHERE tool_name = ?`,
      )
      .get(toolName) as { total: number; successes: number; avg_lat: number } | undefined
    const errors = this.db
      .query(
        `SELECT error_category, COUNT(*) as cnt
         FROM tool_history WHERE tool_name = ? AND success = 0 AND error_category != ''
         GROUP BY error_category`,
      )
      .all(toolName) as Array<{ error_category: string; cnt: number }>
    const errorBreakdown: Record<string, number> = {}
    for (const e of errors) errorBreakdown[e.error_category] = e.cnt
    return {
      totalCalls: stats?.total ?? 0,
      successRate: stats?.total ? (stats.successes ?? 0) / stats.total : 0,
      avgLatency: stats?.avg_lat ?? 0,
      errorBreakdown,
    }
  }

  private startPruningLoop() {
    this.pruningInterval = setInterval(() => {
      this.pruneOldEntries()
    }, 3600000)
  }

  private pruneOldEntries() {
    const weekAgo = Date.now() - 604800000
    this.db.run("DELETE FROM tool_history WHERE timestamp < ?", [weekAgo])
    this.db.run("DELETE FROM edge_weights WHERE last_seen < ?", [weekAgo])
    this.db.run("DELETE FROM semantic_graph WHERE frequency < 2 AND success_rate < 0.5 AND promoted = 0")
    this.db.run("VACUUM")
  }

  shutdown() {
    if (this.pruningInterval) clearInterval(this.pruningInterval)
    this.db.close()
  }
}

function categorizeError(summary: string): string {
  if (summary.includes("not found") || summary.includes("ENOENT")) return "not_found"
  if (summary.includes("permission") || summary.includes("EACCES")) return "permission"
  if (summary.includes("timeout") || summary.includes("TIMEOUT")) return "timeout"
  if (summary.includes("syntax") || summary.includes("SyntaxError")) return "syntax"
  if (summary.includes("type") || summary.includes("TypeError")) return "type"
  if (summary.includes("reference") || summary.includes("ReferenceError")) return "reference"
  if (summary.includes("network") || summary.includes("ECONNREFUSED")) return "network"
  if (summary.includes("memory") || summary.includes("OOM")) return "memory"
  return "other"
}

function categorizeConcept(concept: string): string {
  if (/^(edit|write|apply_patch)$/.test(concept)) return "file_modification"
  if (/^(bash|shell)$/.test(concept)) return "execution"
  if (/^(read|glob|grep)$/.test(concept)) return "search"
  if (/^(webfetch|websearch)$/.test(concept)) return "network"
  if (/^(task)$/.test(concept)) return "orchestration"
  return "general"
}
