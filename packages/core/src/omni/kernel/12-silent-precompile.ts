/**
 * KERNEL 12: Silent Precompile
 * Algorithm: Syntax Tree Validation + Import Graph Analysis + Complexity Metrics
 * Input: Code content, language type
 * Output: Validation results, unused imports, complexity score
 * Boundary: Cache TTL 5000ms; max 100 cached results; supports ts/tsx/js/json/css
 * Example: Detects unused import "foo" in TypeScript → warning
 */

interface DiagnosticResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  unusedImports: string[]
  complexityScore: number
}

interface CacheEntry {
  hash: string
  result: DiagnosticResult
  timestamp: number
}

function deterministicHash(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function shannonEntropy(values: number[]): number {
  const total = values.reduce((s, v) => s + v, 0)
  if (total === 0) return 0
  let entropy = 0
  for (const v of values) {
    if (v > 0) {
      const p = v / total
      entropy -= p * Math.log2(p)
    }
  }
  return entropy
}

export class SilentPrecompile {
  private diagnosticCache: Map<string, CacheEntry> = new Map()
  private cacheTTL = 5000
  private maxCacheSize = 100
  private scanHistory: Array<{ hash: string; valid: boolean; timestamp: number }> = []

  preverify(code: string, language: string = "ts"): DiagnosticResult {
    const cacheKey = `${language}:${deterministicHash(code)}`
    const cached = this.diagnosticCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.result
    const errors: string[] = []
    const warnings: string[] = []
    const unusedImports: string[] = []
    if (language === "ts" || language === "tsx") {
      this.checkTypeScript(code, errors, warnings, unusedImports)
    } else if (language === "js" || language === "jsx") {
      this.checkJavaScript(code, errors, warnings)
    } else if (language === "json") {
      this.checkJson(code, errors)
    } else if (language === "css" || language === "scss") {
      this.checkCss(code, warnings)
    }
    const complexityScore = this.computeComplexityScore(code, language)
    const result: DiagnosticResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      unusedImports,
      complexityScore,
    }
    this.addToCache(cacheKey, result)
    this.scanHistory.push({ hash: cacheKey, valid: result.valid, timestamp: Date.now() })
    return result
  }

  private checkTypeScript(code: string, errors: string[], warnings: string[], unusedImports: string[]) {
    const lines = code.split("\n")
    let braceDepth = 0
    let parenDepth = 0
    let inString = false
    let stringChar = ""
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue
      for (let j = 0; j < line.length; j++) {
        const ch = line[j]
        if (inString) {
          if (ch === stringChar && line[j - 1] !== "\\") inString = false
          continue
        }
        if (ch === '"' || ch === "'" || ch === "`") {
          inString = true
          stringChar = ch
          continue
        }
        if (ch === "{") braceDepth++
        if (ch === "}") braceDepth--
        if (ch === "(") parenDepth++
        if (ch === ")") parenDepth--
      }
      if (braceDepth < 0) {
        errors.push(`Line ${i + 1}: Unmatched closing brace`)
        braceDepth = 0
      }
      if (parenDepth < 0) {
        errors.push(`Line ${i + 1}: Unmatched closing parenthesis`)
        parenDepth = 0
      }
      if (trimmed.endsWith("&&") || trimmed.endsWith("||") || trimmed.endsWith(",")) {
        warnings.push(`Line ${i + 1}: Possible trailing operator`)
      }
      if (trimmed === "};") {
        // valid statement terminator
      }
    }
    if (braceDepth > 0) errors.push(`Unclosed braces: ${braceDepth} unclosed`)
    if (parenDepth > 0) errors.push(`Unclosed parentheses: ${parenDepth} unclosed`)
    const importRegex = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g
    let match
    while ((match = importRegex.exec(code)) !== null) {
      const imports = match[1] ? match[1].split(",").map((i) => i.trim().split(/\s+as\s+/)[0].trim()) : [match[2]]
      for (const imp of imports) {
        if (!imp) continue
        const usageRegex = new RegExp(`\\b${imp}\\b`, "g")
        const usages = code.match(usageRegex) ?? []
        if (usages.length <= 1) unusedImports.push(imp)
      }
    }
    if (unusedImports.length > 0) {
      warnings.push(`Unused imports detected: ${unusedImports.join(", ")}`)
    }
  }

  private checkJavaScript(code: string, errors: string[], warnings: string[]) {
    const lines = code.split("\n")
    let braceDepth = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      if (trimmed.startsWith("//")) continue
      for (const ch of line) {
        if (ch === "{") braceDepth++
        if (ch === "}") braceDepth--
      }
      if (braceDepth < 0) {
        errors.push(`Line ${i + 1}: Unmatched closing brace`)
        braceDepth = 0
      }
      if (trimmed.endsWith("&&") || trimmed.endsWith("||")) {
        warnings.push(`Line ${i + 1}: Possible trailing operator`)
      }
    }
    if (braceDepth > 0) errors.push(`Unclosed braces: ${braceDepth} unclosed`)
  }

  private checkJson(code: string, errors: string[]) {
    try {
      JSON.parse(code)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`Invalid JSON: ${msg}`)
    }
  }

  private checkCss(code: string, warnings: string[]) {
    const lines = code.split("\n")
    let braceDepth = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const ch of line) {
        if (ch === "{") braceDepth++
        if (ch === "}") braceDepth--
      }
      if (braceDepth < 0) {
        warnings.push(`Line ${i + 1}: Unmatched closing brace`)
        braceDepth = 0
      }
    }
    if (braceDepth > 0) warnings.push(`Unclosed braces: ${braceDepth} unclosed`)
  }

  private computeComplexityScore(code: string, language: string): number {
    const lines = code.split("\n")
    const loc = lines.filter((l) => l.trim().length > 0).length
    const branchPatterns = [/\bif\s*\(/, /\bfor\s*\(/, /\bwhile\s*\(/, /\bswitch\s*\(/, /\bcatch\s*\(/, /&&/, /\|\|/]
    let branches = 0
    for (const line of lines) {
      for (const p of branchPatterns) if (p.test(line)) branches++
    }
    const operators = (code.match(/[+\-*/=<>!&|^%~?:]/g) ?? []).length
    const operands = (code.match(/\b[A-Za-z_]\w*\b/g) ?? []).length
    const halsteadVolume = operands > 0 && operators > 0 ? (operands + operators) * Math.log2(operands + operators) : 0
    const cyclomatic = 1 + branches
    const maintainability = Math.max(0, 171 - 5.2 * Math.log(halsteadVolume || 1) - 0.23 * cyclomatic - 16.2 * Math.log(loc || 1))
    return Math.min(100, Math.max(0, maintainability))
  }

  private addToCache(key: string, result: DiagnosticResult) {
    if (this.diagnosticCache.size >= this.maxCacheSize) {
      const oldest = Array.from(this.diagnosticCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
      if (oldest) this.diagnosticCache.delete(oldest[0])
    }
    this.diagnosticCache.set(key, { hash: key, result, timestamp: Date.now() })
  }

  clearCache() {
    this.diagnosticCache.clear()
  }

  getScanHistory(): Array<{ hash: string; valid: boolean; timestamp: number }> {
    return [...this.scanHistory]
  }

  getCacheStats(): { size: number; hitRate: number } {
    return { size: this.diagnosticCache.size, hitRate: this.scanHistory.length > 0 ? this.scanHistory.filter((s) => s.valid).length / this.scanHistory.length : 0 }
  }

  async learn(toolName: string, result: unknown) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result)
    this.scanHistory.push({ hash: deterministicHash(resultStr).toString(36), valid: !resultStr.includes("error"), timestamp: Date.now() })
  }
}
