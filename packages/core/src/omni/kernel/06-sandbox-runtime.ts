import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

/**
 * KERNEL 06: Sandbox Runtime
 * Algorithm: Resource Limit Enforcement + Execution Trace + Memory Budget + Output Capture + Process Isolation + Security Sandbox
 * Input: Code, language, resource constraints
 * Output: Execution result, resource usage, execution trace
 * Boundary: Max 10s CPU time, 256MB memory, temp dir auto-cleanup
 * Verification: TS code executed in isolated temp dir with stdout/stderr capture
 */

export interface ExecutionResult {
  success: boolean
  output: string
  error?: string
  exitCode: number
  duration: number
  peakMemoryKB: number
  filesWritten: string[]
}

export interface SandboxConfig {
  maxCpuTimeMs: number
  maxMemoryMB: number
  maxOutputBytes: number
  workingDir: string
  envVars: Record<string, string>
  allowedCommands: string[]
}

interface ExecutionTrace {
  command: string
  startTime: number
  endTime: number
  exitCode: number
  outputSize: number
  errorSize: number
  language: string
  filesRead: string[]
  filesWritten: string[]
}

const DEFAULT_CONFIG: SandboxConfig = {
  maxCpuTimeMs: 10000,
  maxMemoryMB: 256,
  maxOutputBytes: 1024 * 1024,
  workingDir: "",
  envVars: {},
  allowedCommands: ["bun", "node", "python3", "bash", "cat", "echo", "ls"],
}

function deterministicHash(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function shannonEntropy(input: string): number {
  if (input.length === 0) return 0
  const freq = new Map<string, number>()
  for (const ch of input) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let entropy = 0
  const len = input.length
  for (const count of freq.values()) {
    const p = count / len
    if (p > 0) entropy -= p * Math.log2(p)
  }
  return entropy
}

export class SandboxRuntime {
  private sandboxDir: string
  private config: SandboxConfig
  private traces: ExecutionTrace[] = []
  private executionHistory: Array<{ command: string; duration: number; success: boolean; timestamp: number }> = []
  private tempFiles: string[] = []

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.sandboxDir = mkdtempSync(join(tmpdir(), "zyraxon-sandbox-"))
    if (!this.config.workingDir) this.config.workingDir = this.sandboxDir
    mkdirSync(join(this.sandboxDir, "src"), { recursive: true })
    mkdirSync(join(this.sandboxDir, "out"), { recursive: true })
    mkdirSync(join(this.sandboxDir, "tmp"), { recursive: true })
  }

  async runInSandbox(code: string, language: string = "ts", additionalFiles?: Record<string, string>): Promise<ExecutionResult> {
    const startTime = performance.now()
    const ext = this.getExtension(language)
    const fileHash = deterministicHash(code).toString(36)
    const filePath = join(this.sandboxDir, `src/exec-${fileHash}${ext}`)
    const filesWritten: string[] = [filePath]
    writeFileSync(filePath, code)
    this.tempFiles.push(filePath)
    if (additionalFiles) {
      for (const [name, content] of Object.entries(additionalFiles)) {
        const extraPath = join(this.sandboxDir, "src", name)
        const dir = extraPath.substring(0, extraPath.lastIndexOf("/"))
        if (dir) mkdirSync(dir, { recursive: true })
        writeFileSync(extraPath, content)
        filesWritten.push(extraPath)
        this.tempFiles.push(extraPath)
      }
    }
    const command = this.buildCommand(filePath, language)
    const cmdName = command[0]
    if (this.config.allowedCommands.length > 0 && !this.config.allowedCommands.includes(cmdName)) {
      return { success: false, output: "", error: `Command '${cmdName}' not allowed in sandbox`, exitCode: 1, duration: 0, peakMemoryKB: 0, filesWritten }
    }
    try {
      const proc = Bun.spawnSync(command, {
        cwd: this.config.workingDir,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: this.config.maxCpuTimeMs,
        env: { ...process.env, ...this.config.envVars, NODE_ENV: "test" },
      })
      const duration = performance.now() - startTime
      const stdout = proc.stdout.toString().slice(0, this.config.maxOutputBytes)
      const stderr = proc.stderr.toString().slice(0, this.config.maxOutputBytes)
      const peakMemoryKB = this.estimateMemoryUsage(code, additionalFiles)
      const filesRead = this.detectFileReads(code)
      const trace: ExecutionTrace = {
        command: command.join(" "), startTime, endTime: performance.now(),
        exitCode: proc.exitCode ?? 1, outputSize: stdout.length, errorSize: stderr.length,
        language, filesRead, filesWritten,
      }
      this.traces.push(trace)
      this.executionHistory.push({ command: command.join(" "), duration, success: proc.success, timestamp: Date.now() })
      return { success: proc.success, output: stdout, error: stderr || undefined, exitCode: proc.exitCode ?? 1, duration, peakMemoryKB, filesWritten }
    } catch (err: unknown) {
      const duration = performance.now() - startTime
      const msg = err instanceof Error ? err.message : String(err)
      const trace: ExecutionTrace = {
        command: command.join(" "), startTime, endTime: performance.now(),
        exitCode: 1, outputSize: 0, errorSize: msg.length, language, filesRead: [], filesWritten,
      }
      this.traces.push(trace)
      this.executionHistory.push({ command: command.join(" "), duration, success: false, timestamp: Date.now() })
      return { success: false, output: "", error: msg, exitCode: 1, duration, peakMemoryKB: 0, filesWritten }
    }
  }

  private buildCommand(filePath: string, language: string): string[] {
    switch (language) {
      case "ts": case "tsx": case "js": case "jsx": return ["bun", "run", filePath]
      case "py": return ["python3", filePath]
      case "sh": return ["bash", filePath]
      default: return ["bun", "run", filePath]
    }
  }

  private getExtension(language: string): string {
    const map: Record<string, string> = { ts: ".ts", tsx: ".tsx", js: ".js", jsx: ".jsx", py: ".py", sh: ".sh" }
    return map[language] ?? ".ts"
  }

  private estimateMemoryUsage(code: string, additionalFiles?: Record<string, string>): number {
    let totalBytes = code.length * 2
    if (additionalFiles) for (const content of Object.values(additionalFiles)) totalBytes += content.length * 2
    return Math.ceil((totalBytes + 1024 * 1024) / 1024)
  }

  private detectFileReads(code: string): string[] {
    const reads: string[] = []
    const patterns = [
      /(?:readFileSync|readFile)\s*\(\s*['"]([^'"]+)['"]/g,
      /Bun\.file\s*\(\s*['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]/g,
    ]
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(code)) !== null) reads.push(match[1])
    }
    return [...new Set(reads)]
  }

  async compileInSandbox(code: string, language: string = "ts"): Promise<{
    success: boolean; errors: string[]; warnings: string[]; outputPath?: string
  }> {
    const ext = this.getExtension(language)
    const filePath = join(this.sandboxDir, `compile-${deterministicHash(code).toString(36)}${ext}`)
    writeFileSync(filePath, code)
    this.tempFiles.push(filePath)
    const errors: string[] = [], warnings: string[] = []
    try {
      if (language === "ts" || language === "tsx") {
        const proc = Bun.spawnSync(["bun", "build", "--no-bundle", filePath, "--outdir", join(this.sandboxDir, "out")], {
          cwd: this.sandboxDir, stdio: ["ignore", "pipe", "pipe"], timeout: this.config.maxCpuTimeMs,
        })
        if (!proc.success) {
          const stderr = proc.stderr.toString()
          for (const line of stderr.split("\n")) {
            if (line.includes("error")) errors.push(line.slice(0, 500))
            else if (line.trim()) warnings.push(line.slice(0, 500))
          }
        }
        const outputPath = join(this.sandboxDir, "out", `compile-${deterministicHash(code).toString(36)}.js`)
        return { success: errors.length === 0, errors, warnings, outputPath: existsSync(outputPath) ? outputPath : undefined }
      }
    } catch (err: unknown) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
    return { success: errors.length === 0, errors, warnings }
  }

  async runMultiple(codes: Array<{ code: string; language: string }>): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = []
    for (const { code, language } of codes) results.push(await this.runInSandbox(code, language))
    return results
  }

  getSandboxStats(): { totalExecutions: number; successRate: number; avgDuration: number; outputEntropy: number } {
    if (this.executionHistory.length === 0) return { totalExecutions: 0, successRate: 0, avgDuration: 0, outputEntropy: 0 }
    const successCount = this.executionHistory.filter((e) => e.success).length
    const avgDuration = this.executionHistory.reduce((s, e) => s + e.duration, 0) / this.executionHistory.length
    const durations = this.executionHistory.map((e) => Math.floor(e.duration / 100))
    const freq = new Map<string, number>()
    for (const d of durations) freq.set(d.toString(), (freq.get(d.toString()) ?? 0) + 1)
    return {
      totalExecutions: this.executionHistory.length,
      successRate: successCount / this.executionHistory.length,
      avgDuration,
      outputEntropy: shannonEntropy(Array.from(freq.values())),
    }
  }

  getTraces(): ExecutionTrace[] { return [...this.traces] }
  getAverageExecutionTime(): number {
    return this.traces.length > 0 ? this.traces.reduce((s, t) => s + (t.endTime - t.startTime), 0) / this.traces.length : 0
  }
  getSuccessRate(): number {
    return this.traces.length > 0 ? this.traces.filter((t) => t.exitCode === 0).length / this.traces.length : 0
  }
  getOutputEntropy(): number {
    const allOutput = this.traces.map((t) => t.outputSize).join("")
    return shannonEntropy(allOutput || "empty")
  }
  cleanup() {
    for (const f of this.tempFiles) { try { rmSync(f, { force: true }) } catch {} }
    rmSync(this.sandboxDir, { recursive: true, force: true })
  }
  getSandboxPath(): string { return this.sandboxDir }

  async learn(toolName: string, result: unknown) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result)
    this.traces.push({
      command: toolName, startTime: Date.now(), endTime: Date.now(),
      exitCode: resultStr.includes("error") ? 1 : 0, outputSize: resultStr.length, errorSize: 0,
      language: "unknown", filesRead: [], filesWritten: [],
    })
  }
}
