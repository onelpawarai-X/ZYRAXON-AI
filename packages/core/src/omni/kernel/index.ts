import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { MultiFileComposer } from "./01-multi-file-composer"
import { TerminalAutonomy } from "./02-terminal-autonomy"
import { BackgroundLoop } from "./03-background-loop"
import { BehaviorCascade } from "./04-behavior-cascade"
import { GitPairProgramming } from "./05-git-pair"
import { SandboxRuntime } from "./06-sandbox-runtime"
import { IdeaToDeploy } from "./07-idea-to-deploy"
import { CostRouter } from "./08-cost-router"
import { LiveObservability } from "./09-live-observability"
import { KnowledgeGraph } from "./10-knowledge-graph"
import { SecurityScanner } from "./11-security-scanner"
import { SilentPrecompile } from "./12-silent-precompile"
import { VisualContextSync } from "./13-visual-context-sync"
import { SelfEvolvingPrompt } from "./14-self-evolving-prompt"
import { ZeroTrustToken } from "./15-zero-trust-token"

export class KernelEngine {
  multiFileComposer: MultiFileComposer
  terminalAutonomy: TerminalAutonomy
  backgroundLoop: BackgroundLoop
  behaviorCascade: BehaviorCascade
  gitPair: GitPairProgramming
  sandboxRuntime: SandboxRuntime | null = null
  ideaToDeploy: IdeaToDeploy
  costRouter: CostRouter
  liveObservability: LiveObservability
  knowledgeGraph: KnowledgeGraph
  securityScanner: SecurityScanner
  silentPrecompile: SilentPrecompile
  visualContextSync: VisualContextSync
  selfEvolvingPrompt: SelfEvolvingPrompt
  zeroTrustToken: ZeroTrustToken
  private db: Database
  private mechanisms: Map<string, unknown> = new Map()

  constructor(dataDir?: string) {
    const dir = dataDir ?? join(process.cwd(), ".zyraxon-data")
    mkdirSync(dir, { recursive: true })
    const dbPath = join(dir, "omni-kernels.db")
    this.db = new Database(dbPath)
    this.db.run("PRAGMA journal_mode = WAL")
    this.db.run("PRAGMA synchronous = NORMAL")
    this.db.run("PRAGMA busy_timeout = 5000")
    this.db.run("PRAGMA temp_store = MEMORY")
    this.initSchema()
    this.multiFileComposer = new MultiFileComposer()
    this.terminalAutonomy = new TerminalAutonomy()
    this.backgroundLoop = new BackgroundLoop()
    this.behaviorCascade = new BehaviorCascade()
    this.gitPair = new GitPairProgramming()
    this.ideaToDeploy = new IdeaToDeploy()
    this.costRouter = new CostRouter()
    this.liveObservability = new LiveObservability()
    this.knowledgeGraph = new KnowledgeGraph(dir)
    this.securityScanner = new SecurityScanner()
    this.silentPrecompile = new SilentPrecompile()
    this.visualContextSync = new VisualContextSync()
    this.selfEvolvingPrompt = new SelfEvolvingPrompt(dir)
    this.zeroTrustToken = new ZeroTrustToken()
  }

  private initSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS mechanism_registry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        success_count INTEGER NOT NULL DEFAULT 0,
        fail_count INTEGER NOT NULL DEFAULT 0,
        last_used INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0
      )
    `)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS mechanism_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mechanism_name TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_mech_name ON mechanism_registry(name)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_mech_metric ON mechanism_metrics(mechanism_name, metric_name)`)
  }

  init() {
    const names = [
      "multi-file-composer", "terminal-autonomy", "background-loop",
      "behavior-cascade", "git-pair", "sandbox-runtime", "idea-to-deploy",
      "cost-router", "live-observability", "knowledge-graph",
      "security-scanner", "silent-precompile", "visual-context-sync",
      "self-evolving-prompt", "zero-trust-token",
    ]
    const now = Date.now()
    for (const name of names) {
      this.db.run(
        `INSERT OR IGNORE INTO mechanism_registry (name, active, success_count, fail_count, last_used, created_at)
         VALUES (?, 1, 0, 0, ?, ?)`,
        [name, now, now],
      )
    }
    this.mechanisms.set("multi-file-composer", this.multiFileComposer)
    this.mechanisms.set("terminal-autonomy", this.terminalAutonomy)
    this.mechanisms.set("background-loop", this.backgroundLoop)
    this.mechanisms.set("behavior-cascade", this.behaviorCascade)
    this.mechanisms.set("git-pair", this.gitPair)
    this.mechanisms.set("idea-to-deploy", this.ideaToDeploy)
    this.mechanisms.set("cost-router", this.costRouter)
    this.mechanisms.set("live-observability", this.liveObservability)
    this.mechanisms.set("knowledge-graph", this.knowledgeGraph)
    this.mechanisms.set("security-scanner", this.securityScanner)
    this.mechanisms.set("silent-precompile", this.silentPrecompile)
    this.mechanisms.set("visual-context-sync", this.visualContextSync)
    this.mechanisms.set("self-evolving-prompt", this.selfEvolvingPrompt)
    this.mechanisms.set("zero-trust-token", this.zeroTrustToken)
    this.knowledgeGraph.init()
    this.selfEvolvingPrompt.init()
    this.zeroTrustToken.init()
  }

  learn(toolName: string, result: unknown): boolean {
    const mechName = this.findRelevantMechanism(toolName)
    if (!mechName) return false
    const mech = this.mechanisms.get(mechName) as { learn?: (tool: string, result: unknown) => void } | undefined
    if (mech?.learn) {
      mech.learn(toolName, result)
      this.db.run(
        `UPDATE mechanism_registry SET success_count = success_count + 1, last_used = ? WHERE name = ?`,
        [Date.now(), mechName],
      )
      this.db.run(
        `INSERT INTO mechanism_metrics (mechanism_name, metric_name, metric_value, timestamp) VALUES (?, 'learn', 1, ?)`,
        [mechName, Date.now()],
      )
      return true
    }
    this.db.run(
      `UPDATE mechanism_registry SET last_used = ? WHERE name = ?`,
      [Date.now(), mechName],
    )
    return false
  }

  private findRelevantMechanism(toolName: string): string | null {
    const mapping: Record<string, string> = {
      edit: "multi-file-composer",
      write: "multi-file-composer",
      apply_patch: "multi-file-composer",
      bash: "terminal-autonomy",
      task: "background-loop",
      browser: "visual-context-sync",
      memory: "knowledge-graph",
      webfetch: "security-scanner",
      websearch: "security-scanner",
      glob: "silent-precompile",
      grep: "silent-precompile",
      read: "silent-precompile",
      skill: "self-evolving-prompt",
      todowrite: "behavior-cascade",
    }
    return mapping[toolName] ?? null
  }

  getActiveMechanisms(): string[] {
    return this.db
      .query("SELECT name FROM mechanism_registry WHERE active = 1")
      .all()
      .map((r: { name: string }) => r.name)
  }

  getMechanismStats(): Array<{ name: string; successCount: number; failCount: number; lastUsed: number }> {
    return this.db
      .query("SELECT name, success_count as successCount, fail_count as failCount, last_used as lastUsed FROM mechanism_registry")
      .all() as Array<{ name: string; successCount: number; failCount: number; lastUsed: number }>
  }

  shutdown() {
    this.db.close()
  }
}

export { MultiFileComposer } from "./01-multi-file-composer"
export { TerminalAutonomy } from "./02-terminal-autonomy"
export { BackgroundLoop } from "./03-background-loop"
export { BehaviorCascade } from "./04-behavior-cascade"
export { GitPairProgramming } from "./05-git-pair"
export { SandboxRuntime } from "./06-sandbox-runtime"
export { IdeaToDeploy } from "./07-idea-to-deploy"
export { CostRouter } from "./08-cost-router"
export { LiveObservability } from "./09-live-observability"
export { KnowledgeGraph } from "./10-knowledge-graph"
export { SecurityScanner } from "./11-security-scanner"
export { SilentPrecompile } from "./12-silent-precompile"
export { VisualContextSync } from "./13-visual-context-sync"
export { SelfEvolvingPrompt } from "./14-self-evolving-prompt"
export { ZeroTrustToken } from "./15-zero-trust-token"
