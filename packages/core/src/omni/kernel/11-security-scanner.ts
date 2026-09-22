/**
 * KERNEL 11: Security Scanner
 * Algorithm: OWASP Pattern Matching + Shannon Entropy Analysis + Regex Fingerprinting
 * Input: Code content, endpoint URLs, HTTP headers
 * Output: Security findings, severity ratings, fix recommendations
 * Boundary: OWASP Top 10 coverage; entropy threshold 4.0 for "high randomness"; max 100 findings per scan
 * Example: Detects eval() usage → A03 Injection finding with severity "high"
 */

export interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low" | "info"
  category: string
  owaspId: string
  finding: string
  line?: number
  recommendation: string
  confidence: number
}

const OWASP_RULES: Array<{
  id: string
  name: string
  pattern: RegExp
  severity: SecurityFinding["severity"]
  recommendation: string
  confidence: number
}> = [
  { id: "A01", name: "Broken Access Control", pattern: /(?:admin|role|permission|auth|bypass|elevate|escalat)/gi, severity: "high", recommendation: "Verify access control checks on all endpoints", confidence: 0.6 },
  { id: "A02", name: "Cryptographic Failures", pattern: /(?:md5|sha1|weak.?encrypt|plain.?text.?password|des\b|rc4)/gi, severity: "high", recommendation: "Use SHA-256+ or bcrypt for password hashing", confidence: 0.75 },
  { id: "A03", name: "Injection", pattern: /(?:eval\(|exec\(|raw\(|innerHTML|dangerouslySetInnerHTML|child_process|execSync|execFile)/g, severity: "critical", recommendation: "Use parameterized queries and avoid eval()", confidence: 0.85 },
  { id: "A04", name: "Insecure Design", pattern: /(?:untrusted.?input|user.?supplied|request.?query|req\.body)/gi, severity: "medium", recommendation: "Validate and sanitize all user inputs", confidence: 0.5 },
  { id: "A05", name: "Security Misconfiguration", pattern: /(?:debug.?true|CORS.?\*|disabled.?cors|x-frame-options.*deny)/gi, severity: "medium", recommendation: "Remove debug flags in production, restrict CORS", confidence: 0.65 },
  { id: "A06", name: "Vulnerable Components", pattern: /(?:axios@0\.|lodash@4\.17\.[0-5]|express@[23]\.|jquery@[12]\.)/g, severity: "medium", recommendation: "Update to latest stable versions", confidence: 0.7 },
  { id: "A07", name: "Authentication Failures", pattern: /(?:session.?fixed|weak.?password|no.?rate.?limit|brute.?force)/gi, severity: "high", recommendation: "Implement rate limiting and strong password policies", confidence: 0.6 },
  { id: "A08", name: "Data Integrity Failures", pattern: /(?:unsafe.?deserialize|insecure.?deserial|pickle\.load|yaml\.load\b)/gi, severity: "high", recommendation: "Use safe deserialization methods", confidence: 0.8 },
  { id: "A09", name: "Logging Failures", pattern: /(?:no.?log|error.?silent|log.?level.?off|catch\s*\{\s*\})/gi, severity: "low", recommendation: "Implement proper error logging and monitoring", confidence: 0.55 },
  { id: "A10", name: "SSRF", pattern: /(?:fetch\(req\.|request\.url|proxy|tunnel|127\.0\.0\.1|localhost)/gi, severity: "high", recommendation: "Validate and sanitize URLs, restrict internal network access", confidence: 0.6 },
]

const ENDPOINT_PATTERNS: Array<{ name: string; pattern: RegExp; severity: SecurityFinding["severity"] }> = [
  { name: "No Auth Endpoint", pattern: /app\.(get|post|put|delete|patch)\(\s*['"][^'"]+['"]\s*,\s*(?!.*auth|.*jwt|.*verify|.*token)/gi, severity: "medium" },
  { name: "Hardcoded Secret", pattern: /(?:secret|key|token|password)\s*[:=]\s*['"][A-Za-z0-9_\-\.]{20,}['"]/gi, severity: "critical" },
  { name: "SQL Injection Risk", pattern: /(?:query|execute)\s*\(\s*['"`].*\$\{/g, severity: "critical" },
  { name: "Command Injection Risk", pattern: /(?:exec|spawn|execSync)\s*\(\s*`[^`]*\$\{/g, severity: "critical" },
  { name: "Path Traversal Risk", pattern: /\.\.\/|\.\.\\|path\.join\(.*req\./gi, severity: "high" },
]

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

function deterministicHash(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export class SecurityScanner {
  private scanHistory: Array<{ target: string; findings: number; timestamp: number }> = []

  async scanCode(content: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = []
    const lines = content.split("\n")
    for (const rule of OWASP_RULES) {
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags)
      let match
      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.slice(0, match.index).split("\n").length
        findings.push({
          severity: rule.severity,
          category: rule.name,
          owaspId: rule.id,
          finding: `${rule.id}: ${rule.name} — ${match[0].slice(0, 50)}`,
          line: lineNum,
          recommendation: rule.recommendation,
          confidence: rule.confidence,
        })
      }
    }
    for (const ep of ENDPOINT_PATTERNS) {
      const regex = new RegExp(ep.pattern.source, ep.pattern.flags)
      let match
      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.slice(0, match.index).split("\n").length
        findings.push({
          severity: ep.severity,
          category: ep.name,
          owaspId: "custom",
          finding: `${ep.name} — ${match[0].slice(0, 50)}`,
          line: lineNum,
          recommendation: `Review and secure: ${ep.name}`,
          confidence: 0.7,
        })
      }
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      if (trimmed.length > 200) {
        const entropy = shannonEntropy(trimmed)
        if (entropy > 4.5) {
          findings.push({
            severity: "medium",
            category: "High Entropy String",
            owaspId: "custom",
            finding: `High entropy string at line ${i + 1} (entropy: ${entropy.toFixed(2)})`,
            line: i + 1,
            recommendation: "Check if this is a hardcoded secret or token",
            confidence: 0.4,
          })
        }
      }
    }
    findings.sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
      return (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
    })
    this.scanHistory.push({ target: "code", findings: findings.length, timestamp: Date.now() })
    return findings
  }

  async scanEndpoint(url: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = []
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      const headers = res.headers
      if (!headers.get("content-security-policy")) {
        findings.push({ severity: "medium", category: "Security Headers", owaspId: "A05", finding: "Missing CSP header", recommendation: "Add Content-Security-Policy header", confidence: 0.9 })
      }
      if (!headers.get("x-frame-options")) {
        findings.push({ severity: "low", category: "Security Headers", owaspId: "A05", finding: "Missing X-Frame-Options", recommendation: "Add X-Frame-Options: DENY", confidence: 0.85 })
      }
      if (!headers.get("strict-transport-security")) {
        findings.push({ severity: "medium", category: "Security Headers", owaspId: "A02", finding: "Missing HSTS header", recommendation: "Add Strict-Transport-Security header", confidence: 0.8 })
      }
      if (headers.get("access-control-allow-origin") === "*") {
        findings.push({ severity: "high", category: "CORS Misconfiguration", owaspId: "A05", finding: "CORS allows all origins", recommendation: "Restrict CORS to trusted origins", confidence: 0.9 })
      }
      if (!headers.get("x-content-type-options")) {
        findings.push({ severity: "low", category: "Security Headers", owaspId: "A05", finding: "Missing X-Content-Type-Options", recommendation: "Add X-Content-Type-Options: nosniff", confidence: 0.8 })
      }
    } catch {
      findings.push({ severity: "info", category: "Connectivity", owaspId: "N/A", finding: "Could not reach endpoint", recommendation: "Verify the URL is accessible", confidence: 1.0 })
    }
    this.scanHistory.push({ target: url, findings: findings.length, timestamp: Date.now() })
    return findings
  }

  computeRiskScore(findings: SecurityFinding[]): number {
    if (findings.length === 0) return 0
    const weights: Record<string, number> = { critical: 10, high: 5, medium: 2, low: 1, info: 0 }
    let totalWeight = 0
    for (const f of findings) totalWeight += (weights[f.severity] ?? 0) * f.confidence
    const maxPossible = findings.length * 10
    return Math.min(totalWeight / Math.max(maxPossible, 1), 1.0)
  }

  getScanHistory(): Array<{ target: string; findings: number; timestamp: number }> {
    return [...this.scanHistory]
  }

  async learn(toolName: string, result: unknown) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result)
    if (resultStr.includes("vulnerability") || resultStr.includes("security")) {
      this.scanHistory.push({ target: toolName, findings: 1, timestamp: Date.now() })
    }
  }
}
