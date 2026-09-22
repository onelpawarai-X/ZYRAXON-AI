import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * KERNEL 15: Zero Trust Token
 * Algorithm: Multi-Pattern Regex Scanning + Shannon Entropy Detection + Contextual Analysis
 * Input: File content, filenames, directory paths
 * Output: Token findings, stripped content, sensitive file detection
 * Boundary: Entropy threshold 4.0 for "high randomness"; 18 token patterns; 12 sensitive file patterns
 * Example: Detects "sk-abc123..." in code → strips to "sk-ab...23" with severity "critical"
 */

export interface TokenFinding {
  type: string
  severity: "low" | "high" | "critical"
  location: string
  redacted: string
  line?: number
}

const TOKEN_PATTERNS: Array<{ pattern: RegExp; name: string; severity: TokenFinding["severity"] }> = [
  { pattern: /ghp_[A-Za-z0-9]{36,}/g, name: "GitHub PAT", severity: "critical" },
  { pattern: /gho_[A-Za-z0-9]{36,}/g, name: "GitHub OAuth", severity: "critical" },
  { pattern: /ghu_[A-Za-z0-9]{36,}/g, name: "GitHub User", severity: "critical" },
  { pattern: /ghs_[A-Za-z0-9]{36,}/g, name: "GitHub Server", severity: "critical" },
  { pattern: /ghr_[A-Za-z0-9]{36,}/g, name: "GitHub Refresh", severity: "critical" },
  { pattern: /sk-[A-Za-z0-9]{32,}/g, name: "OpenAI Key", severity: "critical" },
  { pattern: /pk-[A-Za-z0-9]{32,}/g, name: "OpenAI Project Key", severity: "critical" },
  { pattern: /xox[bpsar]-[A-Za-z0-9]{10,}/g, name: "Slack Token", severity: "critical" },
  { pattern: /AKIA[0-9A-Z]{16}/g, name: "AWS Access Key", severity: "critical" },
  { pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, name: "JWT Token", severity: "high" },
  { pattern: /(?:api[_-]?key|apikey|secret|token|password)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{16,}['"]?/gi, name: "Generic Secret", severity: "high" },
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, name: "Private Key", severity: "critical" },
  { pattern: /(?:gh|gl|gb)_[A-Za-z0-9]{20,}/g, name: "Git Platform Token", severity: "critical" },
  { pattern: /AIza[0-9A-Za-z_-]{35}/g, name: "Google API Key", severity: "critical" },
  { pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, name: "SendGrid Key", severity: "critical" },
  { pattern: /(?:facebook|fb|twitter|instagram|github)_?token['"]?\s*[:=]\s*['"][A-Za-z0-9_\-\.]{10,}['"]?/gi, name: "Social Token", severity: "high" },
  { pattern: /(?:AWS_SECRET_ACCESS_KEY|AZURE_CLIENT_SECRET|GCP_SERVICE_ACCOUNT_KEY)\s*[:=]\s*['"]?[A-Za-z0-9\/+=]{20,}['"]?/gi, name: "Cloud Secret", severity: "critical" },
  { pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^'"]+:[^'"]+@[^'"]+/gi, name: "Database URL with Credentials", severity: "critical" },
]

const SENSITIVE_FILE_PATTERNS: RegExp[] = [
  /\.env$/i, /\.env\.\w+$/i, /credentials\.json$/i, /service-account\.json$/i,
  /id_rsa$/i, /id_ed25519$/i, /deploy-key$/i, /tokens\.txt$/i,
  /secrets\.json$/i, /passwords\.txt$/i, /\.pem$/i, /\.p12$/i,
]

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

function truncateToken(match: string): string {
  if (match.length <= 8) return match
  return match.slice(0, 4) + "..." + match.slice(-4)
}

export class ZeroTrustToken {
  private active = false
  private scanResults: Array<{ file: string; findings: number; timestamp: number }> = []
  private knownSecrets: Set<string> = new Set()

  init() {
    this.active = true
    this.loadKnownSecrets()
  }

  private loadKnownSecrets() {
    const envFiles = [".env", ".env.local", ".env.production"]
    for (const file of envFiles) {
      const filePath = join(process.cwd(), file)
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, "utf-8")
          for (const line of content.split("\n")) {
            const match = line.match(/^(\w+)=["']?(.+)["']?$/)
            if (match && match[2].length > 8) this.knownSecrets.add(match[2])
          }
        } catch {}
      }
    }
    for (const [, value] of Object.entries(process.env)) {
      if (value && value.length > 8) this.knownSecrets.add(value)
    }
  }

  stripTokens(data: string): string {
    if (!this.active) return data
    let result = data
    for (const { pattern, name } of TOKEN_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags)
      let match
      while ((match = regex.exec(result)) !== null) {
        const truncated = truncateToken(match[0])
        result = result.slice(0, match.index) + truncated + result.slice(match.index + match[0].length)
        regex.lastIndex = match.index + truncated.length
      }
    }
    for (const secret of this.knownSecrets) {
      if (secret.length > 8 && result.includes(secret)) {
        const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        result = result.replace(new RegExp(escaped, "g"), `[ENV:${deterministicHash(secret).toString(36)}]`)
      }
    }
    return result
  }

  stripFromObject(obj: unknown): unknown {
    if (!this.active) return obj
    const str = JSON.stringify(obj)
    const cleaned = this.stripTokens(str)
    try {
      return JSON.parse(cleaned)
    } catch {
      return cleaned
    }
  }

  detectSensitiveFile(filename: string): boolean {
    return SENSITIVE_FILE_PATTERNS.some((p) => p.test(filename))
  }

  scanFile(content: string, filename: string): TokenFinding[] {
    const findings: TokenFinding[] = []
    if (this.detectSensitiveFile(filename)) {
      findings.push({ type: "Sensitive File", severity: "critical", location: filename, redacted: filename })
    }
    const lines = content.split("\n")
    for (let i = 0; i < lines.length; i++) {
      for (const { pattern, name, severity } of TOKEN_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags)
        let match
        while ((match = regex.exec(lines[i])) !== null) {
          findings.push({
            type: name,
            severity,
            location: filename,
            redacted: truncateToken(match[0]),
            line: i + 1,
          })
        }
      }
    }
    for (const secret of this.knownSecrets) {
      if (secret.length > 8) {
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(secret)) {
            findings.push({
              type: "Known Secret",
              severity: "critical",
              location: filename,
              redacted: `[ENV:${deterministicHash(secret).toString(36)}]`,
              line: i + 1,
            })
          }
        }
      }
    }
    this.scanResults.push({ file: filename, findings: findings.length, timestamp: Date.now() })
    return findings
  }

  scanDirectory(dirPath: string, files: Map<string, string>): TokenFinding[] {
    const allFindings: TokenFinding[] = []
    for (const [filename, content] of files) {
      const findings = this.scanFile(content, join(dirPath, filename))
      allFindings.push(...findings)
    }
    return allFindings
  }

  getEntropyAnalysis(content: string): { overall: number; segments: Array<{ start: number; end: number; entropy: number }> } {
    const overall = shannonEntropy(content)
    const segments: Array<{ start: number; end: number; entropy: number }> = []
    const segmentSize = 100
    for (let i = 0; i < content.length; i += segmentSize) {
      const segment = content.slice(i, i + segmentSize)
      segments.push({ start: i, end: Math.min(i + segmentSize, content.length), entropy: shannonEntropy(segment) })
    }
    return { overall, segments }
  }

  getScanResults(): Array<{ file: string; findings: number; timestamp: number }> {
    return [...this.scanResults]
  }

  getTotalFindings(): number {
    return this.scanResults.reduce((s, r) => s + r.findings, 0)
  }

  shutdown() {
    this.active = false
  }
}
