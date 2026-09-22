import { readFile } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const SECRET_PATTERNS: Array<{ pattern: RegExp; name: string; severity: "critical" | "high" | "medium" }> = [
  { pattern: /sk-[A-Za-z0-9]{32,}/g, name: "OpenAI API Key", severity: "critical" },
  { pattern: /ghp_[A-Za-z0-9]{36,}/g, name: "GitHub PAT", severity: "critical" },
  { pattern: /gho_[A-Za-z0-9]{36,}/g, name: "GitHub OAuth Token", severity: "critical" },
  { pattern: /ghu_[A-Za-z0-9]{36,}/g, name: "GitHub User Token", severity: "critical" },
  { pattern: /ghs_[A-Za-z0-9]{36,}/g, name: "GitHub Server Token", severity: "critical" },
  { pattern: /ghr_[A-Za-z0-9]{36,}/g, name: "GitHub Refresh Token", severity: "critical" },
  { pattern: /xox[bpsar]-[A-Za-z0-9]{10,}/g, name: "Slack Token", severity: "critical" },
  { pattern: /AKIA[0-9A-Z]{16}/g, name: "AWS Access Key", severity: "critical" },
  { pattern: /AIza[0-9A-Za-z_-]{35}/g, name: "Google API Key", severity: "critical" },
  { pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, name: "SendGrid Key", severity: "critical" },
  { pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, name: "JWT Token", severity: "high" },
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, name: "Private Key", severity: "critical" },
  { pattern: /(?:gh|gl|gb)_[A-Za-z0-9]{20,}/g, name: "Git Platform Token", severity: "critical" },
  { pattern: /(?:facebook|fb|twitter|instagram)_token['"]?\s*[:=]\s*['"][A-Za-z0-9_\-\.]{10,}['"]/gi, name: "Social Media Token", severity: "high" },
  { pattern: /(?:api[_-]?key|apikey|secret|token|password|passwd|credential|auth)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{16,}['"]?/gi, name: "Generic Secret", severity: "high" },
]

const CONTEXTUAL_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\b(?:password|secret|key|token)\s*[:=]\s*'[^']+'/gi, name: "Quoted Secret (single)" },
  { pattern: /\b(?:password|secret|key|token)\s*[:=]\s*"[^"]+"/gi, name: "Quoted Secret (double)" },
  { pattern: /process\.env\.\w+/g, name: "Env Var Reference" },
  { pattern: /\b(?:AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|AZURE_CLIENT_SECRET|GCP_SERVICE_ACCOUNT_KEY)\b/gi, name: "Cloud Credential Variable" },
]

const SENSITIVE_FILE_PATTERNS = [
  /\.env$/i, /\.env\.\w+$/i, /credentials\.json$/i, /service-account\.json$/i,
  /id_rsa$/i, /id_ed25519$/i, /deploy-key$/i, /tokens\.txt$/i,
  /secrets\.json$/i, /passwords\.txt$/i, /\.pem$/i, /\.p12$/i, /\.pfx$/i,
]

function deterministicHash(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export interface RedactionResult {
  sanitized: string
  redactions: Array<{ type: string; severity: string; original: string; replaced: string }>
  totalRedactions: number
  entropyBefore: number
  entropyAfter: number
}

export class SecretRedactEngine {
  private active = false
  private envVars: Map<string, string> = new Map()
  private knownSecrets: Set<string> = new Set()
  private envLoaded = false

  constructor(private dataDir?: string) {}

  init() {
    this.active = true
    this.loadEnvVars()
  }

  private loadEnvVars() {
    const envFiles = [".env", ".env.local", ".env.development", ".env.production"]
    for (const file of envFiles) {
      const filePath = this.dataDir ? join(this.dataDir, file) : file
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, "utf-8")
          for (const line of content.split("\n")) {
            const match = line.match(/^(\w+)=["']?(.+)["']?$/)
            if (match) {
              const key = match[1].toLowerCase()
              const value = match[2].trim()
              this.envVars.set(key, value)
              if (value.length > 8) this.knownSecrets.add(value)
            }
          }
        } catch {}
      }
    }
    for (const [key, value] of Object.entries(process.env)) {
      if (value && value.length > 8) {
        this.knownSecrets.add(value)
      }
    }
    this.envLoaded = true
  }

  sanitizeContext(context: unknown): unknown {
    if (!this.active) return context
    const str = JSON.stringify(context)
    const result = this.sanitizeString(str)
    try {
      return JSON.parse(result.sanitized)
    } catch {
      return result.sanitized
    }
  }

  sanitizeString(input: string): RedactionResult {
    if (!this.active) {
      return {
        sanitized: input,
        redactions: [],
        totalRedactions: 0,
        entropyBefore: shannonEntropy(input),
        entropyAfter: shannonEntropy(input),
      }
    }
    const entropyBefore = shannonEntropy(input)
    const redactions: RedactionResult["redactions"] = []
    let result = input
    for (const { pattern, name, severity } of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags)
      let match
      while ((match = regex.exec(result)) !== null) {
        const original = match[0]
        const placeholder = `[REDACTED:${deterministicHash(original).toString(36)}]`
        redactions.push({ type: name, severity, original: original.slice(0, 20) + "...", replaced: placeholder })
        result = result.slice(0, match.index) + placeholder + result.slice(match.index + original.length)
        regex.lastIndex = match.index + placeholder.length
      }
    }
    for (const { pattern, name } of CONTEXTUAL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags)
      let match
      while ((match = regex.exec(result)) !== null) {
        const original = match[0]
        const placeholder = `[CTX_REDACTED:${deterministicHash(original).toString(36)}]`
        redactions.push({ type: name, severity: "medium", original: original.slice(0, 20) + "...", replaced: placeholder })
        result = result.slice(0, match.index) + placeholder + result.slice(match.index + original.length)
        regex.lastIndex = match.index + placeholder.length
      }
    }
    for (const secret of this.knownSecrets) {
      if (secret.length > 8 && result.includes(secret)) {
        const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const regex = new RegExp(escaped, "g")
        const placeholder = `[ENV_REDACTED:${deterministicHash(secret).toString(36)}]`
        const count = (result.match(regex) ?? []).length
        for (let i = 0; i < count; i++) {
          redactions.push({ type: "Known Secret", severity: "critical", original: secret.slice(0, 10) + "...", replaced: placeholder })
        }
        result = result.replace(regex, placeholder)
      }
    }
    if (redactions.length > 0 && containsApiKeyPattern(result)) {
      const aggressiveRedactions = aggressiveScan(result)
      redactions.push(...aggressiveRedactions)
      for (const r of aggressiveRedactions) {
        result = result.replace(r.original, r.replaced)
      }
    }
    const entropyAfter = shannonEntropy(result)
    return { sanitized: result, redactions, totalRedactions: redactions.length, entropyBefore, entropyAfter }
  }

  sanitizeForLLM(input: string): string {
    return this.sanitizeString(input).sanitized
  }

  detectSensitiveFile(filename: string): boolean {
    return SENSITIVE_FILE_PATTERNS.some((p) => p.test(filename))
  }

  scanFile(content: string, filename: string): Array<{ finding: string; severity: "low" | "high" | "critical"; line?: number }> {
    const findings: Array<{ finding: string; severity: "low" | "high" | "critical"; line?: number }> = []
    if (this.detectSensitiveFile(filename)) {
      findings.push({ finding: `Sensitive file detected: ${filename}`, severity: "critical" })
    }
    const lines = content.split("\n")
    for (let i = 0; i < lines.length; i++) {
      for (const { pattern, name, severity } of SECRET_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags)
        if (regex.test(lines[i])) {
          findings.push({ finding: `${name} found at line ${i + 1}`, severity, line: i + 1 })
        }
      }
    }
    return findings
  }

  getRedactionStats(): { knownSecrets: number; envVars: number; patterns: number } {
    return {
      knownSecrets: this.knownSecrets.size,
      envVars: this.envVars.size,
      patterns: SECRET_PATTERNS.length + CONTEXTUAL_PATTERNS.length,
    }
  }

  shutdown() {
    this.active = false
  }
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

function containsApiKeyPattern(input: string): boolean {
  return SECRET_PATTERNS.some((p) => {
    const regex = new RegExp(p.pattern.source, p.pattern.flags)
    return regex.test(input)
  })
}

function aggressiveScan(input: string): Array<{ type: string; severity: string; original: string; replaced: string }> {
  const findings: Array<{ type: string; severity: string; original: string; replaced: string }> = []
  const longTokens = input.match(/[A-Za-z0-9_\-]{24,}/g) ?? []
  for (const token of longTokens) {
    if (token.length >= 24 && !isCommonWord(token)) {
      const placeholder = `[KEY_REDACTED:${deterministicHash(token).toString(36)}]`
      findings.push({ type: "Long Token", severity: "high", original: token.slice(0, 15) + "...", replaced: placeholder })
    }
  }
  return findings
}

function isCommonWord(word: string): boolean {
  const common = new Set([
    "function", "return", "import", "export", "default", "const", "let", "var",
    "string", "number", "boolean", "undefined", "null", "true", "false",
    "class", "extends", "implements", "interface", "type", "enum",
    "async", "await", "promise", "reject", "resolve",
    "console", "error", "warning", "message", "description",
  ])
  return common.has(word.toLowerCase())
}
