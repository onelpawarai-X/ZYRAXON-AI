import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { readFile } from "node:fs/promises"

export interface VisualFrame {
  timestamp: number
  detectedElements: string[]
  appState: string
  terminalActivity: string
  screenContent: string
}

export interface PrefetchResult {
  key: string
  content: string
  filePath: string
  relevance: number
  cachedAt: number
}

export interface ContextPrediction {
  predictedFiles: string[]
  predictedCommands: string[]
  confidence: number
  basedOnFrames: number
}

function deterministicHash(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  }
  return hash
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

function extractTFIDF(text: string, vocabulary: string[]): number[] {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const tf = new Map<string, number>()
  for (const word of words) tf.set(word, (tf.get(word) ?? 0) + 1)
  const total = words.length || 1
  return vocabulary.map((term) => {
    const freq = tf.get(term) ?? 0
    return freq / total
  })
}

export class VisionContextEngine {
  private db: Database
  private lastFrame: VisualFrame | null = null
  private predictiveCache: Map<string, PrefetchResult> = new Map()
  private frameHistory: VisualFrame[] = []
  private vocabulary: string[] = []

  constructor(dataDir?: string) {
    const dir = dataDir ?? join(process.cwd(), ".zyraxon-data")
    mkdirSync(dir, { recursive: true })
    const dbPath = join(dir, "omni-vision.db")
    this.db = new Database(dbPath)
    this.db.run("PRAGMA journal_mode = WAL")
    this.db.run("PRAGMA synchronous = NORMAL")
    this.db.run("PRAGMA busy_timeout = 5000")
    this.db.run("PRAGMA temp_store = MEMORY")
    this.initSchema()
  }

  private initSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS visual_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        frame_summary TEXT NOT NULL DEFAULT '',
        detected_elements TEXT NOT NULL DEFAULT '[]',
        app_state TEXT NOT NULL DEFAULT '',
        terminal_activity TEXT NOT NULL DEFAULT '',
        screen_content TEXT NOT NULL DEFAULT '',
        timestamp INTEGER NOT NULL
      )
    `)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS predictive_cache (
        key TEXT PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '',
        file_path TEXT NOT NULL DEFAULT '',
        relevance REAL NOT NULL DEFAULT 0,
        hit_count INTEGER NOT NULL DEFAULT 1,
        last_access INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS file_access_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 1,
        last_access INTEGER NOT NULL,
        context_hash INTEGER NOT NULL DEFAULT 0,
        UNIQUE(file_path, context_hash)
      )
    `)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS terminal_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_pattern TEXT NOT NULL,
        frequency INTEGER NOT NULL DEFAULT 1,
        last_seen INTEGER NOT NULL,
        success_rate REAL NOT NULL DEFAULT 1.0
      )
    `)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_visual_ts ON visual_history(timestamp)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_cache_relevance ON predictive_cache(relevance)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file_access ON file_access_patterns(file_path)`)
  }

  init() {
    this.buildVocabulary()
  }

  private buildVocabulary() {
    const cacheEntries = this.db.query("SELECT key, content FROM predictive_cache").all() as Array<{ key: string; content: string }>
    const allText = cacheEntries.map((e) => e.content).join(" ")
    const wordFreq = new Map<string, number>()
    const words = allText.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    for (const w of words) wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1)
    this.vocabulary = Array.from(wordFreq.entries())
      .filter(([, freq]) => freq >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 500)
      .map(([word]) => word)
  }

  captureFrame(frame: VisualFrame) {
    this.lastFrame = frame
    this.frameHistory.push(frame)
    if (this.frameHistory.length > 100) this.frameHistory.shift()
    this.db.run(
      `INSERT INTO visual_history (frame_summary, detected_elements, app_state, terminal_activity, screen_content, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        frame.detectedElements.join(","),
        JSON.stringify(frame.detectedElements),
        frame.appState,
        frame.terminalActivity,
        frame.screenContent.slice(0, 5000),
        frame.timestamp,
      ],
    )
    this.updateFileAccessPatterns(frame)
    this.updateTerminalPatterns(frame.terminalActivity)
  }

  private updateFileAccessPatterns(frame: VisualFrame) {
    const now = Date.now()
    const contextHash = deterministicHash(frame.appState + frame.terminalActivity)
    const filePatterns = /(?:\/[\w.-]+)+\.\w+/g
    const matches = frame.screenContent.match(filePatterns) ?? []
    for (const filePath of new Set(matches)) {
      const existing = this.db
        .query("SELECT * FROM file_access_patterns WHERE file_path = ? AND context_hash = ?")
        .get(filePath, contextHash) as { id: number; access_count: number } | undefined
      if (existing) {
        this.db.run(
          `UPDATE file_access_patterns SET access_count = access_count + 1, last_access = ? WHERE file_path = ? AND context_hash = ?`,
          [now, filePath, contextHash],
        )
      } else {
        this.db.run(
          `INSERT INTO file_access_patterns (file_path, access_count, last_access, context_hash) VALUES (?, 1, ?, ?)`,
          [filePath, now, contextHash],
        )
      }
    }
  }

  private updateTerminalPatterns(terminalActivity: string) {
    if (!terminalActivity) return
    const now = Date.now()
    const commands = terminalActivity.split("\n").filter((l) => l.trim())
    for (const cmd of commands.slice(-5)) {
      const pattern = cmd.trim().slice(0, 100)
      const existing = this.db.query("SELECT * FROM terminal_patterns WHERE command_pattern = ?").get(pattern) as
        | { id: number; frequency: number }
        | undefined
      if (existing) {
        this.db.run(
          `UPDATE terminal_patterns SET frequency = frequency + 1, last_seen = ? WHERE command_pattern = ?`,
          [now, pattern],
        )
      } else {
        this.db.run(
          `INSERT INTO terminal_patterns (command_pattern, frequency, last_seen, success_rate) VALUES (?, 1, ?, 1.0)`,
          [pattern, now],
        )
      }
    }
  }

  predict(context: unknown): ContextPrediction {
    const predictedFiles: string[] = []
    const predictedCommands: string[] = []
    if (this.frameHistory.length === 0) {
      return { predictedFiles, predictedCommands, confidence: 0, basedOnFrames: 0 }
    }
    const recentFrames = this.frameHistory.slice(-10)
    const currentVector = extractTFIDF(
      recentFrames.map((f) => f.screenContent).join(" "),
      this.vocabulary,
    )
    const fileScores = new Map<string, number>()
    const accessRows = this.db.query("SELECT file_path, access_count FROM file_access_patterns ORDER BY access_count DESC LIMIT 50").all() as Array<{
      file_path: string
      access_count: number
    }>
    for (const row of accessRows) {
      const accessScore = Math.min(row.access_count / 10, 1.0)
      const recencyBonus = 0.5
      fileScores.set(row.file_path, accessScore * recencyBonus)
    }
    const sortedFiles = Array.from(fileScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([file]) => file)
    predictedFiles.push(...sortedFiles)
    const termRows = this.db
      .query("SELECT command_pattern, frequency FROM terminal_patterns ORDER BY frequency DESC LIMIT 10")
      .all() as Array<{ command_pattern: string; frequency: number }>
    predictedCommands.push(...termRows.map((r) => r.command_pattern))
    const confidence = Math.min(this.frameHistory.length / 20, 1.0)
    return {
      predictedFiles,
      predictedCommands,
      confidence,
      basedOnFrames: this.frameHistory.length,
    }
  }

  async prefetch(key: string, filePaths: string[]): Promise<PrefetchResult[]> {
    const results: PrefetchResult[] = []
    for (const fp of filePaths) {
      const cached = this.predictiveCache.get(`${key}:${fp}`)
      if (cached) {
        this.db.run(
          `UPDATE predictive_cache SET hit_count = hit_count + 1, last_access = ? WHERE key = ?`,
          [Date.now(), `${key}:${fp}`],
        )
        results.push(cached)
        continue
      }
      try {
        const content = await readFile(fp, "utf-8")
        const relevance = this.computeRelevance(content, key)
        const result: PrefetchResult = {
          key: `${key}:${fp}`,
          content,
          filePath: fp,
          relevance,
          cachedAt: Date.now(),
        }
        this.predictiveCache.set(result.key, result)
        this.db.run(
          `INSERT OR REPLACE INTO predictive_cache (key, content, file_path, relevance, hit_count, last_access, created_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [result.key, content.slice(0, 10000), fp, relevance, Date.now(), Date.now()],
        )
        results.push(result)
      } catch {}
    }
    results.sort((a, b) => b.relevance - a.relevance)
    return results
  }

  private computeRelevance(content: string, query: string): number {
    if (!this.vocabulary.length) {
      this.buildVocabulary()
    }
    const contentVector = extractTFIDF(content, this.vocabulary)
    const queryVector = extractTFIDF(query, this.vocabulary)
    const similarity = cosineSimilarity(contentVector, queryVector)
    const lengthFactor = Math.min(content.length / 1000, 1.0) * 0.1
    return Math.max(0, Math.min(1, similarity + lengthFactor))
  }

  async cacheResult(key: string, data: string, filePath: string = "") {
    const relevance = this.computeRelevance(data, key)
    const result: PrefetchResult = { key, content: data, filePath, relevance, cachedAt: Date.now() }
    this.predictiveCache.set(key, result)
    this.db.run(
      `INSERT OR REPLACE INTO predictive_cache (key, content, file_path, relevance, hit_count, last_access, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [key, data.slice(0, 10000), filePath, relevance, Date.now(), Date.now()],
    )
  }

  getTerminalActivity(): string {
    return this.lastFrame?.terminalActivity ?? ""
  }

  getAppState(): string {
    return this.lastFrame?.appState ?? ""
  }

  getLastFrame(): VisualFrame | null {
    return this.lastFrame
  }

  getFrameHistory(): VisualFrame[] {
    return [...this.frameHistory]
  }

  getCachedPrefetches(): PrefetchResult[] {
    return Array.from(this.predictiveCache.values())
  }

  getFrequentFiles(limit: number = 10): Array<{ filePath: string; accessCount: number }> {
    return this.db
      .query("SELECT file_path as filePath, access_count as accessCount FROM file_access_patterns ORDER BY access_count DESC LIMIT ?")
      .all(limit) as Array<{ filePath: string; accessCount: number }>
  }

  shutdown() {
    this.db.close()
  }
}
