import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { MemoryGraphEngine } from "./memory-graph"
import { ShadowCloneEngine } from "./shadow-clone"
import { VisionContextEngine } from "./vision-context"
import { SecretRedactEngine } from "./secret-redact"
import { KernelEngine } from "./kernel/index"

export interface ToolCallContext {
  toolName: string
  args: unknown
  sessionId?: string
}

export interface ToolResultContext {
  toolName: string
  result: unknown
  success: boolean
  latency: number
  sessionId?: string
}

export interface FileEditContext {
  filePath: string
  oldContent: string
  newContent: string
}

export interface ProcessBeforeToolResult {
  sanitizedArgs: unknown
  prediction: {
    predictedFiles: string[]
    predictedCommands: string[]
    confidence: number
  }
}

export interface ProcessAfterToolResult {
  recorded: boolean
  repairProposal: unknown | null
  learned: boolean
}

export interface ProcessBeforeFileEditResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  repairProposal: unknown | null
}

export class OmniKernelService {
  private memory: MemoryGraphEngine
  private shadow: ShadowCloneEngine
  private vision: VisionContextEngine
  private security: SecretRedactEngine
  private kernel: KernelEngine
  private db: Database
  private initialized = false

  constructor(dataDir?: string) {
    const dir = dataDir ?? join(process.cwd(), ".zyraxon-data")
    mkdirSync(dir, { recursive: true })
    this.memory = new MemoryGraphEngine(dir)
    this.shadow = new ShadowCloneEngine({ shadowRoot: join(dir, ".zyraxon-shadow") })
    this.vision = new VisionContextEngine(dir)
    this.security = new SecretRedactEngine(dir)
    this.kernel = new KernelEngine(dir)
    const dbPath = join(dir, "omni-kernel.db")
    this.db = new Database(dbPath)
    this.db.run("PRAGMA journal_mode = WAL")
    this.db.run("PRAGMA synchronous = NORMAL")
    this.db.run("PRAGMA busy_timeout = 5000")
    this.db.run("PRAGMA temp_store = MEMORY")
    this.initSchema()
  }

  private initSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS omni_lifecycle (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        tool_name TEXT,
        timestamp INTEGER NOT NULL,
        details TEXT NOT NULL DEFAULT '{}'
      )
    `)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS omni_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        context TEXT NOT NULL DEFAULT ''
      )
    `)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_lifecycle_type ON omni_lifecycle(event_type)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_lifecycle_ts ON omni_lifecycle(timestamp)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_metrics_name ON omni_metrics(metric_name)`)
  }

  init() {
    if (this.initialized) return
    this.memory.init()
    this.shadow.init()
    this.vision.init()
    this.security.init()
    this.kernel.init()
    this.initialized = true
    this.logLifecycle("omni_kernel_initialized", undefined, {})
  }

  async processBeforeToolCall(context: ToolCallContext): Promise<ProcessBeforeToolResult> {
    const sanitizedArgs = this.security.sanitizeContext(context.args)
    const prediction = this.vision.predict(context)
    this.logLifecycle("before_tool_call", context.toolName, {
      hasArgs: !!context.args,
      predictionConfidence: prediction.confidence,
    })
    this.recordMetric("tool_call_predicted_files", prediction.predictedFiles.length)
    return { sanitizedArgs, prediction }
  }

  async processAfterToolCall(context: ToolResultContext): Promise<ProcessAfterToolResult> {
    this.memory.record(context.toolName, context.result, context.success, context.sessionId)
    let repairProposal: unknown = null
    if (!context.success) {
      repairProposal = await this.shadow.repair(context.toolName, context.result)
      this.recordMetric("tool_failure", 1)
    } else {
      this.recordMetric("tool_success", 1)
    }
    const learned = this.kernel.learn(context.toolName, context.result)
    this.logLifecycle("after_tool_call", context.toolName, {
      success: context.success,
      latency: context.latency,
      hasRepair: !!repairProposal,
      learned,
    })
    this.recordMetric("tool_latency", context.latency)
    return { recorded: true, repairProposal, learned }
  }

  async processBeforeFileEdit(context: FileEditContext): Promise<ProcessBeforeFileEditResult> {
    const dryRunResult = await this.shadow.dryRun(context.filePath, context.newContent)
    let repairProposal: unknown = null
    if (!dryRunResult.valid && dryRunResult.errors.length > 0) {
      repairProposal = await this.shadow.repair(context.filePath, dryRunResult.errors[0])
    }
    this.logLifecycle("before_file_edit", context.filePath, {
      valid: dryRunResult.valid,
      errorCount: dryRunResult.errors.length,
      warningCount: dryRunResult.warnings.length,
    })
    this.recordMetric("file_edit_prechecked", 1)
    if (!dryRunResult.valid) this.recordMetric("file_edit_validation_failed", 1)
    return {
      valid: dryRunResult.valid,
      errors: dryRunResult.errors,
      warnings: dryRunResult.warnings,
      repairProposal,
    }
  }

  getMemoryEngine(): MemoryGraphEngine { return this.memory }
  getShadowEngine(): ShadowCloneEngine { return this.shadow }
  getVisionEngine(): VisionContextEngine { return this.vision }
  getSecurityEngine(): SecretRedactEngine { return this.security }
  getKernelEngine(): KernelEngine { return this.kernel }

  getMetrics(): {
    totalToolCalls: number
    successRate: number
    avgLatency: number
    fileEditsChecked: number
  } {
    const toolSuccess = this.db
      .query("SELECT COUNT(*) as cnt FROM omni_metrics WHERE metric_name = 'tool_success'")
      .get() as { cnt: number } | undefined
    const toolFailure = this.db
      .query("SELECT COUNT(*) as cnt FROM omni_metrics WHERE metric_name = 'tool_failure'")
      .get() as { cnt: number } | undefined
    const avgLat = this.db
      .query("SELECT AVG(metric_value) as avg_val FROM omni_metrics WHERE metric_name = 'tool_latency'")
      .get() as { avg_val: number } | undefined
    const fileEdits = this.db
      .query("SELECT COUNT(*) as cnt FROM omni_metrics WHERE metric_name = 'file_edit_prechecked'")
      .get() as { cnt: number } | undefined
    const successes = toolSuccess?.cnt ?? 0
    const failures = toolFailure?.cnt ?? 0
    const total = successes + failures
    return {
      totalToolCalls: total,
      successRate: total > 0 ? successes / total : 0,
      avgLatency: avgLat?.avg_val ?? 0,
      fileEditsChecked: fileEdits?.cnt ?? 0,
    }
  }

  private logLifecycle(eventType: string, toolName: string | undefined, details: Record<string, unknown>) {
    this.db.run(
      `INSERT INTO omni_lifecycle (event_type, tool_name, timestamp, details) VALUES (?, ?, ?, ?)`,
      [eventType, toolName ?? "", Date.now(), JSON.stringify(details)],
    )
  }

  private recordMetric(name: string, value: number) {
    this.db.run(
      `INSERT INTO omni_metrics (metric_name, metric_value, timestamp, context) VALUES (?, ?, ?, '')`,
      [name, value, Date.now()],
    )
  }

  shutdown() {
    this.memory.shutdown()
    this.shadow.shutdown()
    this.vision.shutdown()
    this.security.shutdown()
    this.kernel.shutdown()
    this.db.close()
    this.initialized = false
  }
}
