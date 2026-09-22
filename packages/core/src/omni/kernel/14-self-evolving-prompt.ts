import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { writeFile } from "node:fs/promises"

/**
 * KERNEL 14: Self-Evolving Prompt
 * Algorithm: Bayesian Rule Effectiveness + Genetic Mutation of Rules + TF-IDF Matching
 * Input: Trigger patterns, actions, success outcomes
 * Output: Evolved rules, suggestions, exported rule sets
 * Boundary: DB-backed; effectiveness range [0,1]; mutation rate 0.1; max 500 rules
 * Example: Rule "error handling" → action "add try-catch" with effectiveness 0.82
 */

export interface PromptRule {
  id: number
  trigger: string
  action: string
  successCount: number
  failCount: number
  effectiveness: number
  createdAt: number
  lastUsedAt: number
}

interface RuleCandidate {
  trigger: string
  action: string
  score: number
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

function extractTFIDF(text: string, vocabulary: string[]): number[] {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const tf = new Map<string, number>()
  for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1)
  const total = words.length || 1
  return vocabulary.map((term) => (tf.get(term) ?? 0) / total)
}

function bayesianEffectiveness(successes: number, total: number, prior: number = 0.5): number {
  if (total === 0) return prior
  const alpha = successes + 1
  const beta = (total - successes) + 1
  return alpha / (alpha + beta)
}

function mutateTrigger(trigger: string, rate: number = 0.1): string {
  const words = trigger.split(/\s+/)
  const mutated: string[] = []
  for (const word of words) {
    if (deterministicHash(word + "mutate") % 100 < rate * 100) {
      const variants = generateVariants(word)
      mutated.push(variants[deterministicHash(word) % variants.length])
    } else {
      mutated.push(word)
    }
  }
  return mutated.join(" ")
}

function generateVariants(word: string): string[] {
  const suffixes = ["ing", "ed", "tion", "ment", "ness", "er", "est", "ly"]
  const prefixes = ["un", "re", "pre", "mis", "over", "out", "sub"]
  const variants: string[] = [word]
  for (const suffix of suffixes) if (!word.endsWith(suffix)) variants.push(word + suffix)
  for (const prefix of prefixes) if (!word.startsWith(prefix)) variants.push(prefix + word)
  return variants.length > 1 ? variants : [word]
}

export class SelfEvolvingPrompt {
  private db: Database
  private vocabulary: string[] = []
  private maxRules = 500
  private mutationRate = 0.1

  constructor(dataDir?: string) {
    const dir = dataDir ?? join(process.cwd(), ".zyraxon-data")
    mkdirSync(dir, { recursive: true })
    const dbPath = join(dir, "omni-prompt.db")
    this.db = new Database(dbPath)
    this.db.run("PRAGMA journal_mode = WAL")
    this.db.run("PRAGMA synchronous = NORMAL")
    this.db.run("PRAGMA busy_timeout = 5000")
    this.db.run("PRAGMA temp_store = MEMORY")
    this.initSchema()
  }

  private initSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS prompt_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger TEXT NOT NULL,
        action TEXT NOT NULL,
        success_count INTEGER NOT NULL DEFAULT 1,
        fail_count INTEGER NOT NULL DEFAULT 0,
        effectiveness REAL NOT NULL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        UNIQUE(trigger, action)
      )
    `)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_pr_trigger ON prompt_rules(trigger)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_pr_effectiveness ON prompt_rules(effectiveness)`)
  }

  init() {
    this.buildVocabulary()
  }

  private buildVocabulary() {
    const entries = this.db.query("SELECT trigger, action FROM prompt_rules").all() as Array<{ trigger: string; action: string }>
    const allText = entries.map((e) => `${e.trigger} ${e.action}`).join(" ")
    const wordFreq = new Map<string, number>()
    const words = allText.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    for (const w of words) wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1)
    this.vocabulary = Array.from(wordFreq.entries())
      .filter(([, f]) => f >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200)
      .map(([w]) => w)
  }

  learn(trigger: string, action: string, success: boolean) {
    const existing = this.db.query("SELECT * FROM prompt_rules WHERE trigger = ? AND action = ?").get(trigger, action) as PromptRule | undefined
    const now = Date.now()
    if (existing) {
      const newSuccess = existing.successCount + (success ? 1 : 0)
      const newFail = existing.failCount + (success ? 0 : 1)
      const total = newSuccess + newFail
      const newEff = bayesianEffectiveness(newSuccess, total)
      this.db.run(
        `UPDATE prompt_rules SET success_count = ?, fail_count = ?, effectiveness = ?, last_used_at = ? WHERE id = ?`,
        [newSuccess, newFail, newEff, now, existing.id],
      )
    } else {
      const ruleCount = (this.db.query("SELECT COUNT(*) as cnt FROM prompt_rules").get() as { cnt: number }).cnt
      if (ruleCount >= this.maxRules) {
        const worst = this.db.query("SELECT id FROM prompt_rules ORDER BY effectiveness ASC LIMIT 1").get() as { id: number } | undefined
        if (worst) this.db.run("DELETE FROM prompt_rules WHERE id = ?", [worst.id])
      }
      this.db.run(
        `INSERT INTO prompt_rules (trigger, action, success_count, fail_count, effectiveness, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [trigger, action, success ? 1 : 0, success ? 0 : 1, success ? 0.7 : 0.3, now, now],
      )
      this.buildVocabulary()
    }
  }

  suggest(problem: string, limit: number = 3): RuleCandidate[] {
    if (this.vocabulary.length === 0) this.buildVocabulary()
    const queryVector = extractTFIDF(problem, this.vocabulary)
    const entries = this.db.query("SELECT * FROM prompt_rules").all() as PromptRule[]
    const scored = entries.map((entry) => {
      const entryText = `${entry.trigger} ${entry.action}`
      const entryVector = extractTFIDF(entryText, this.vocabulary)
      const similarity = cosineSimilarity(queryVector, entryVector)
      const effBoost = entry.effectiveness * 0.4
      const total = entry.successCount + entry.failCount
      const confidenceBoost = Math.min(total / 20, 0.2)
      return { trigger: entry.trigger, action: entry.action, score: similarity + effBoost + confidenceBoost }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }

  evolveRules(): RuleCandidate[] {
    const entries = this.db.query("SELECT * FROM prompt_rules ORDER BY effectiveness DESC").all() as PromptRule[]
    const candidates: RuleCandidate[] = []
    for (const entry of entries) {
      if (entry.effectiveness < 0.6) continue
      const mutatedTrigger = mutateTrigger(entry.trigger, this.mutationRate)
      if (mutatedTrigger !== entry.trigger) {
        candidates.push({
          trigger: mutatedTrigger,
          action: entry.action,
          score: entry.effectiveness * 0.9,
        })
      }
      const actionVariants = generateActionVariants(entry.action)
      for (const variant of actionVariants.slice(0, 2)) {
        candidates.push({
          trigger: entry.trigger,
          action: variant,
          score: entry.effectiveness * 0.8,
        })
      }
    }
    candidates.sort((a, b) => b.score - a.score)
    return candidates.slice(0, 10)
  }

  private generateActionVariants(action: string): string[] {
    const variants: string[] = []
    if (!action.includes("try")) variants.push(`try { ${action} } catch (e) { console.error(e) }`)
    if (!action.includes("async")) variants.push(`await ${action}`)
    if (!action.includes("validate")) variants.push(`validate input before ${action}`)
    return variants
  }

  async exportRules(): Promise<string> {
    const rules = this.db.query("SELECT * FROM prompt_rules ORDER BY effectiveness DESC").all() as PromptRule[]
    return JSON.stringify(rules, null, 2)
  }

  async saveToFile(filePath: string) {
    const rules = await this.exportRules()
    await writeFile(filePath, rules, "utf-8")
  }

  getTopRules(limit: number = 10): PromptRule[] {
    return this.db.query("SELECT * FROM prompt_rules ORDER BY effectiveness DESC LIMIT ?").all(limit) as PromptRule[]
  }

  getRuleStats(): { totalRules: number; avgEffectiveness: number; highEffectiveness: number } {
    const total = (this.db.query("SELECT COUNT(*) as cnt FROM prompt_rules").get() as { cnt: number }).cnt
    const avgEff = (this.db.query("SELECT AVG(effectiveness) as avg_e FROM prompt_rules").get() as { avg_e: number }).avg_e ?? 0
    const highEff = (this.db.query("SELECT COUNT(*) as cnt FROM prompt_rules WHERE effectiveness >= 0.8").get() as { cnt: number }).cnt
    return { totalRules: total, avgEffectiveness: avgEff, highEffectiveness: highEff }
  }

  shutdown() {
    this.db.close()
  }
}
