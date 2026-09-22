import { mkdir, cp, rm, readdir, readFile, writeFile, stat } from "node:fs/promises"
import { join, relative, dirname, extname } from "node:path"
import { existsSync, mkdirSync } from "node:fs"

export interface DryRunResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  compilable: boolean
  testedFilePath: string
}

export interface RepairProposal {
  filePath: string
  originalError: string
  proposedFix: string
  confidence: number
  diff: string
}

export interface ShadowCloneConfig {
  shadowRoot: string
  maxClones: number
  cloneExclusions: string[]
  buildTimeout: number
}

const DEFAULT_CONFIG: ShadowCloneConfig = {
  shadowRoot: "",
  maxClones: 5,
  cloneExclusions: ["node_modules", ".git", ".zyraxon-shadow", "dist", "out", ".next"],
  buildTimeout: 30000,
}

export class ShadowCloneEngine {
  private config: ShadowCloneConfig
  private activeClones: Map<string, { path: string; createdAt: number }> = new Map()
  private active = false

  constructor(config: Partial<ShadowCloneConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  init() {
    if (!this.config.shadowRoot) {
      this.config.shadowRoot = join(process.cwd(), ".zyraxon-shadow")
    }
    mkdirSync(this.config.shadowRoot, { recursive: true })
    this.active = true
  }

  async cloneWorkspace(workspacePath: string): Promise<string> {
    if (!this.active) throw new Error("ShadowCloneEngine not initialized")
    this.enforceCloneLimit()
    const cloneId = `shadow-${Date.now()}-${deterministicCounter()}`
    const shadowPath = join(this.config.shadowRoot, cloneId)
    await mkdir(shadowPath, { recursive: true })
    const exclusionArgs = this.config.cloneExclusions.flatMap((ex) => ["--exclude", ex])
    await cp(workspacePath, shadowPath, {
      recursive: true,
      force: true,
      filter: (src) => {
        const base = relative(workspacePath, src)
        return !this.config.cloneExclusions.some((ex) => base.startsWith(ex) || base === ex)
      },
    })
    this.activeClones.set(cloneId, { path: shadowPath, createdAt: Date.now() })
    return shadowPath
  }

  async dryRun(filePath: string, newContent: string): Promise<DryRunResult> {
    if (!this.active) return { valid: true, errors: [], warnings: [], compilable: true, testedFilePath: filePath }
    const errors: string[] = []
    const warnings: string[] = []
    const ext = extname(filePath)
    const shadowDir = join(this.config.shadowRoot, `dryrun-${Date.now()}`)
    await mkdir(shadowDir, { recursive: true })
    const tempPath = join(shadowDir, `testfile${ext}`)
    await writeFile(tempPath, newContent)
    try {
      if (ext === ".ts" || ext === ".tsx") {
        const result = await this.compileTypeScript(tempPath, shadowDir)
        errors.push(...result.errors)
        warnings.push(...result.warnings)
      } else if (ext === ".js" || ext === ".jsx") {
        const result = await this.compileJavaScript(tempPath)
        errors.push(...result.errors)
        warnings.push(...result.warnings)
      } else if (ext === ".json") {
        const result = await this.validateJson(newContent)
        errors.push(...result.errors)
      } else if (ext === ".css" || ext === ".scss") {
        const result = await this.validateCss(newContent)
        warnings.push(...result.warnings)
      }
      const syntaxResult = await this.checkSyntaxBasics(newContent, ext)
      warnings.push(...syntaxResult.warnings)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`Dry run failed: ${msg}`)
    } finally {
      await rm(shadowDir, { recursive: true, force: true }).catch(() => {})
    }
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      compilable: errors.length === 0,
      testedFilePath: filePath,
    }
  }

  async repair(filePath: string, error: unknown): Promise<RepairProposal | null> {
    if (!this.active) return null
    const errStr = typeof error === "string" ? error : error instanceof Error ? error.message : JSON.stringify(error)
    const ext = extname(filePath)
    const proposal = generateRepairProposal(filePath, errStr, ext)
    return proposal
  }

  private async compileTypeScript(tempPath: string, cwd: string): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = []
    const warnings: string[] = []
    try {
      const proc = Bun.spawnSync(["bun", "build", "--no-bundle", tempPath], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: this.config.buildTimeout,
      })
      if (!proc.success) {
        const stderr = proc.stderr.toString()
        const lines = stderr.split("\n").filter((l) => l.trim())
        for (const line of lines) {
          if (line.includes("error TS") || line.includes("Error:")) errors.push(line.slice(0, 500))
          else if (line.includes("warning")) warnings.push(line.slice(0, 500))
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`TypeScript compilation failed: ${msg}`)
    }
    return { errors, warnings }
  }

  private async compileJavaScript(tempPath: string): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = []
    const warnings: string[] = []
    try {
      const proc = Bun.spawnSync(["bun", "build", "--no-bundle", tempPath], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: this.config.buildTimeout,
      })
      if (!proc.success) {
        const stderr = proc.stderr.toString()
        const lines = stderr.split("\n").filter((l) => l.trim())
        for (const line of lines) {
          if (line.includes("SyntaxError") || line.includes("ReferenceError")) errors.push(line.slice(0, 500))
          else warnings.push(line.slice(0, 500))
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`JavaScript compilation failed: ${msg}`)
    }
    return { errors, warnings }
  }

  private async validateJson(content: string): Promise<{ errors: string[] }> {
    const errors: string[] = []
    try {
      JSON.parse(content)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`Invalid JSON: ${msg}`)
    }
    return { errors }
  }

  private async validateCss(content: string): Promise<{ warnings: string[] }> {
    const warnings: string[] = []
    const lines = content.split("\n")
    let braceCount = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const ch of line) {
        if (ch === "{") braceCount++
        if (ch === "}") braceCount--
      }
      if (braceCount < 0) {
        warnings.push(`Line ${i + 1}: Unmatched closing brace`)
        braceCount = 0
      }
    }
    if (braceCount > 0) warnings.push(`Unmatched opening braces: ${braceCount} unclosed`)
    return { warnings }
  }

  private async checkSyntaxBasics(content: string, ext: string): Promise<{ warnings: string[] }> {
    const warnings: string[] = []
    if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx") {
      const lines = content.split("\n")
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.length > 500) warnings.push(`Line ${i + 1}: Very long line (${line.length} chars)`)
        if (line.endsWith("&&") || line.endsWith("||")) {
          warnings.push(`Line ${i + 1}: Possible trailing operator`)
        }
      }
    }
    return { warnings }
  }

  private enforceCloneLimit() {
    if (this.activeClones.size >= this.config.maxClones) {
      const oldest = Array.from(this.activeClones.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt)[0]
      if (oldest) {
        rm(oldest[1].path, { recursive: true, force: true }).catch(() => {})
        this.activeClones.delete(oldest[0])
      }
    }
  }

  async shutdown() {
    for (const [, clone] of this.activeClones) {
      await rm(clone.path, { recursive: true, force: true }).catch(() => {})
    }
    this.activeClones.clear()
    await rm(this.config.shadowRoot, { recursive: true, force: true }).catch(() => {})
    this.active = false
  }
}

let counterState = 0
function deterministicCounter(): string {
  counterState++
  return counterState.toString(36).padStart(4, "0")
}

function generateRepairProposal(filePath: string, errorMsg: string, ext: string): RepairProposal | null {
  if (ext !== ".ts" && ext !== ".tsx" && ext !== ".js" && ext !== ".jsx") return null
  if (errorMsg.includes("not found") || errorMsg.includes("Cannot find module")) {
    const moduleMatch = errorMsg.match(/Cannot find module ['"]([^'"]+)['"]/)
    if (moduleMatch) {
      const moduleName = moduleMatch[1]
      return {
        filePath,
        originalError: errorMsg,
        proposedFix: `Install missing module: bun install ${moduleName}`,
        confidence: 0.7,
        diff: `+ import ... from '${moduleName}'`,
      }
    }
  }
  if (errorMsg.includes("undefined is not assignable") || errorMsg.includes("not assignable")) {
    const typeMatch = errorMsg.match(/type ['"]([^'"]+)['"]/)
    const variable = errorMsg.match(/['"](\w+)['"]/)
    if (typeMatch && variable) {
      return {
        filePath,
        originalError: errorMsg,
        proposedFix: `Add type annotation or null check for '${variable[1]}'`,
        confidence: 0.5,
        diff: `+ // TODO: Fix type for ${variable[1]}`,
      }
    }
  }
  if (errorMsg.includes("does not exist on type")) {
    const propMatch = errorMsg.match(/Property ['"]([^'"]+)['"]/)
    const typeMatch = errorMsg.match(/type ['"]([^'"]+)['"]/)
    if (propMatch && typeMatch) {
      return {
        filePath,
        originalError: errorMsg,
        proposedFix: `Property '${propMatch[1]}' missing on type '${typeMatch[1]}' — add optional chaining or type assertion`,
        confidence: 0.6,
        diff: `+ ${propMatch[1]}?: unknown`,
      }
    }
  }
  if (errorMsg.includes("Unexpected token")) {
    const lineMatch = errorMsg.match(/position (\d+)/)
    return {
      filePath,
      originalError: errorMsg,
      proposedFix: `Syntax error detected — check bracket matching and string escaping`,
      confidence: 0.4,
      diff: `// Fix syntax at ${lineMatch ? `position ${lineMatch[1]}` : "detected position"}`,
    }
  }
  if (errorMsg.includes("already declared") || errorMsg.includes("redeclaration")) {
    const nameMatch = errorMsg.match(/['"](\w+)['"]/)
    if (nameMatch) {
      return {
        filePath,
        originalError: errorMsg,
        proposedFix: `Variable '${nameMatch[1]}' redeclared — rename or use block scoping`,
        confidence: 0.6,
        diff: `- const ${nameMatch[1]} = ...\n+ const ${nameMatch[1]}_v2 = ...`,
      }
    }
  }
  return {
    filePath,
    originalError: errorMsg,
    proposedFix: "Manual review required — no automated fix available",
    confidence: 0.1,
    diff: "",
  }
}
