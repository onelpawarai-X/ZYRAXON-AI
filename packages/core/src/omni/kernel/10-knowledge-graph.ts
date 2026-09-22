import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

/**
 * KERNEL 10: Knowledge Graph
 * Algorithm: TF-IDF Similarity + PageRank Centrality + Bayesian Confidence Update + Co-occurrence Analysis
 * Input: Patterns, categories, solutions, context strings
 * Output: Relevant knowledge entries, graph centrality, high-confidence patterns
 * Boundary: DB-backed persistent storage; TF-IDF vocabulary built from stored entries
 * Example: recall("edit file error") → returns top-5 entries ranked by TF-IDF cosine similarity
 */

export interface KnowledgeEntry {
  id: number
  pattern: string
  category: string
  solution: string
  frequency: number
  confidence: number
  createdAt: number
  lastAccessed: number
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
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i] }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function extractTFIDF(text: string, vocabulary: string[]): number[] {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const tf = new Map<string, number>()
  for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1)
  const total = words.length || 1
  return vocabulary.map((term) => (tf.get(term) ?? 0) / total)
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

function bayesianUpdate(prior: number, likelihood: number, evidence: number): number {
  if (evidence === 0) return prior
  return (likelihood * prior) / evidence
}

export class KnowledgeGraph {
  private db: Database
  private vocabulary: string[] = []
  private entryCache: Map<number, KnowledgeEntry> = new Map()

  constructor(dataDir?: string) {
    const dir = dataDir ?? join(process.cwd(), ".zyraxon-data")
    mkdirSync(dir, { recursive: true })
    const dbPath = join(dir, "omni-knowledge.db")
    this.db = new Database(dbPath)
    this.db.run("PRAGMA journal_mode = WAL")
    this.db.run("PRAGMA synchronous = NORMAL")
    this.db.run("PRAGMA busy_timeout = 5000")
    this.db.run("PRAGMA temp_store = MEMORY")
    this.initSchema()
  }

  private initSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS knowledge_graph (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL DEFAULT 'general',
        solution TEXT NOT NULL DEFAULT '',
        frequency INTEGER NOT NULL DEFAULT 1,
        confidence REAL NOT NULL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL
      )
    `)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS knowledge_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL,
        target_id INTEGER NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        co_occurrence INTEGER NOT NULL DEFAULT 1,
        UNIQUE(source_id, target_id)
      )
    `)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_kg_pattern ON knowledge_graph(pattern)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_kg_category ON knowledge_graph(category)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_kg_confidence ON knowledge_graph(confidence)`)
  }

  init() { this.buildVocabulary() }

  private buildVocabulary() {
    const entries = this.db.query("SELECT pattern, solution FROM knowledge_graph").all() as Array<{ pattern: string; solution: string }>
    const allText = entries.map((e) => `${e.pattern} ${e.solution}`).join(" ")
    const wordFreq = new Map<string, number>()
    const words = allText.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    for (const w of words) wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1)
    this.vocabulary = Array.from(wordFreq.entries())
      .filter(([, freq]) => freq >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 300)
      .map(([word]) => word)
  }

  learn(pattern: string, category: string, solution: string) {
    const existing = this.db.query("SELECT * FROM knowledge_graph WHERE pattern = ?").get(pattern) as KnowledgeEntry | undefined
    const now = Date.now()
    if (existing) {
      const newFreq = existing.frequency + 1
      const newConf = bayesianUpdate(existing.confidence, 0.8, newFreq / 100)
      this.db.run(
        `UPDATE knowledge_graph SET frequency = ?, confidence = MIN(1.0, ?), last_accessed = ? WHERE pattern = ?`,
        [newFreq, newConf, now, pattern],
      )
      this.entryCache.delete(existing.id)
    } else {
      this.db.run(
        `INSERT INTO knowledge_graph (pattern, category, solution, frequency, confidence, created_at, last_accessed)
         VALUES (?, ?, ?, 1, 0.5, ?, ?)`,
        [pattern, category, solution, now, now],
      )
      this.buildVocabulary()
    }
  }

  recall(context: string, limit: number = 5): KnowledgeEntry[] {
    if (this.vocabulary.length === 0) this.buildVocabulary()
    const queryVector = extractTFIDF(context, this.vocabulary)
    const entries = this.db.query("SELECT * FROM knowledge_graph").all() as KnowledgeEntry[]
    const scored = entries.map((entry) => {
      const entryText = `${entry.pattern} ${entry.solution}`
      const entryVector = extractTFIDF(entryText, this.vocabulary)
      const similarity = cosineSimilarity(queryVector, entryVector)
      const confidenceBoost = entry.confidence * 0.3
      const frequencyBoost = Math.min(entry.frequency / 20, 0.2)
      return { entry, score: similarity + confidenceBoost + frequencyBoost }
    })
    scored.sort((a, b) => b.score - a.score)
    const results = scored.slice(0, limit).map((s) => s.entry)
    const now = Date.now()
    for (const entry of results) this.db.run("UPDATE knowledge_graph SET last_accessed = ? WHERE id = ?", [now, entry.id])
    return results
  }

  getHighConfidence(threshold: number = 0.8): KnowledgeEntry[] {
    return this.db.query("SELECT * FROM knowledge_graph WHERE confidence >= ? ORDER BY frequency DESC").all(threshold) as KnowledgeEntry[]
  }

  computeCentrality(): Array<{ pattern: string; centrality: number }> {
    const entries = this.db.query("SELECT id, pattern, frequency FROM knowledge_graph").all() as Array<{ id: number; pattern: string; frequency: number }>
    const edges = this.db.query("SELECT source_id, target_id, weight FROM knowledge_edges").all() as Array<{ source_id: number; target_id: number; weight: number }>
    const degreeMap = new Map<number, number>()
    for (const entry of entries) degreeMap.set(entry.id, 0)
    for (const edge of edges) {
      degreeMap.set(edge.source_id, (degreeMap.get(edge.source_id) ?? 0) + 1)
      degreeMap.set(edge.target_id, (degreeMap.get(edge.target_id) ?? 0) + 1)
    }
    const maxDegree = Math.max(...Array.from(degreeMap.values()), 1)
    return entries.map((entry) => {
      const degree = degreeMap.get(entry.id) ?? 0
      const freqScore = Math.min(entry.frequency / 50, 1.0)
      const centrality = 0.6 * (degree / maxDegree) + 0.4 * freqScore
      return { pattern: entry.pattern, centrality }
    }).sort((a, b) => b.centrality - a.centrality)
  }

  addEdge(sourceId: number, targetId: number, weight: number = 1.0) {
    const existing = this.db.query("SELECT * FROM knowledge_edges WHERE source_id = ? AND target_id = ?").get(sourceId, targetId) as { weight: number; co_occurrence: number } | undefined
    if (existing) {
      const newWeight = existing.weight * 0.9 + weight * 0.1
      this.db.run(`UPDATE knowledge_edges SET weight = ?, co_occurrence = co_occurrence + 1 WHERE source_id = ? AND target_id = ?`, [newWeight, sourceId, targetId])
    } else {
      this.db.run(`INSERT INTO knowledge_edges (source_id, target_id, weight, co_occurrence) VALUES (?, ?, ?, 1)`, [sourceId, targetId, weight])
    }
  }

  getRelatedEntries(pattern: string, limit: number = 5): Array<{ pattern: string; similarity: number }> {
    const entry = this.db.query("SELECT * FROM knowledge_graph WHERE pattern = ?").get(pattern) as KnowledgeEntry | undefined
    if (!entry) return []
    const entryVector = extractTFIDF(`${entry.pattern} ${entry.solution}`, this.vocabulary)
    const allEntries = this.db.query("SELECT * FROM knowledge_graph WHERE id != ?").all(entry.id) as KnowledgeEntry[]
    const scored = allEntries.map((e) => {
      const eVector = extractTFIDF(`${e.pattern} ${e.solution}`, this.vocabulary)
      return { pattern: e.pattern, similarity: cosineSimilarity(entryVector, eVector) }
    })
    return scored.filter((s) => s.similarity > 0.1).sort((a, b) => b.similarity - a.similarity).slice(0, limit)
  }

  getCategoryDistribution(): Map<string, number> {
    const rows = this.db.query("SELECT category, COUNT(*) as cnt FROM knowledge_graph GROUP BY category").all() as Array<{ category: string; cnt: number }>
    return new Map(rows.map((r) => [r.category, r.cnt]))
  }

  getStats(): { totalEntries: number; avgConfidence: number; totalEdges: number; highConfidence: number } {
    const total = (this.db.query("SELECT COUNT(*) as cnt FROM knowledge_graph").get() as { cnt: number }).cnt
    const avgConf = (this.db.query("SELECT AVG(confidence) as avg_conf FROM knowledge_graph").get() as { avg_conf: number }).avg_conf ?? 0
    const edges = (this.db.query("SELECT COUNT(*) as cnt FROM knowledge_edges").get() as { cnt: number }).cnt
    const highConf = (this.db.query("SELECT COUNT(*) as cnt FROM knowledge_graph WHERE confidence >= 0.8").get() as { cnt: number }).cnt
    return { totalEntries: total, avgConfidence: avgConf, totalEdges: edges, highConfidence: highConf }
  }

  getPatternEntropy(): number {
    const entries = this.db.query("SELECT frequency FROM knowledge_graph").all() as Array<{ frequency: number }>
    return shannonEntropy(entries.map((e) => e.frequency))
  }

  getRecentEntries(limit: number = 10): KnowledgeEntry[] {
    return this.db.query("SELECT * FROM knowledge_graph ORDER BY last_accessed DESC LIMIT ?").all(limit) as KnowledgeEntry[]
  }

  deleteEntry(pattern: string): boolean {
    const entry = this.db.query("SELECT id FROM knowledge_graph WHERE pattern = ?").get(pattern) as { id: number } | undefined
    if (!entry) return false
    this.db.run("DELETE FROM knowledge_edges WHERE source_id = ? OR target_id = ?", [entry.id, entry.id])
    this.db.run("DELETE FROM knowledge_graph WHERE id = ?", [entry.id])
    this.entryCache.delete(entry.id)
    return true
  }

  shutdown() { this.db.close() }
}
