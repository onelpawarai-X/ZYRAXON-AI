import * as monaco from "monaco-editor"

export interface AIAssistantConfig {
  provider: "opencode"
  baseUrl: string
  apiKey?: string
}

export interface GenerateOptions {
  prompt: string
  language: string
  existingCode: string
  fileName?: string
  instruction?: "fix" | "generate" | "explain" | "improve"
  modelId?: string
}

export interface StreamCallbacks {
  onToken: (token: string, fullCode: string) => void
  onComplete: (fullCode: string) => void
  onError: (error: Error) => void
  onStart: () => void
}

const SYSTEM_PROMPT = `You are ZYRAXON AI, an expert code assistant built into a professional code editor.

YOUR ONLY JOB: Generate, fix, or improve code. You are NOT a chatbot. You do NOT ask questions.

CRITICAL RULES:
1. ONLY output code — no explanations, no markdown, no code fences, no comments about what you did
2. NEVER ask clarifying questions — just do the best you can with what's given
3. NEVER respond in any language other than what the user writes in. If user writes in Bengali, respond with code comments in Bengali. If user writes in English, respond in English.
4. Match existing code style and conventions exactly
5. Preserve imports, structure, and existing logic unless the user explicitly says to remove something
6. If fixing bugs: keep original intent, fix the bug
7. If improving: make minimal but effective changes for performance, readability, error handling
8. If generating from scratch: write complete, working, production-quality code
9. Output ONLY the final code. NOTHING else. Not even a newline before or after.`

const INSTRUCTION_PROMPTS: Record<string, string> = {
  generate: "Generate complete, working code based on this instruction. Output ONLY the code.",
  fix: "Analyze the code and fix ALL bugs, errors, and issues. Keep the original functionality. Output the corrected code ONLY.",
  explain: "Explain what this code does in detail, line by line.",
  improve: "Improve this code: better performance, readability, error handling. Output the improved code ONLY.",
}

export class MonacoAIAssistant {
  private abortController: AbortController | null = null
  private isGenerating = false
  private config: AIAssistantConfig
  private urlPromise: Promise<string | null> | null = null
  private cachedModel: string | null = null
  private resolvedUrl: string | null = null
  private urlResolutionAttempts = 0

  constructor(config?: Partial<AIAssistantConfig>) {
    this.config = {
      provider: "opencode",
      baseUrl: config?.baseUrl || "http://127.0.0.1:3000/v1",
      apiKey: config?.apiKey,
    }
    if (typeof window !== "undefined" && (window as any).api?.getDefaultServerUrl) {
      this.urlPromise = (window as any).api.getDefaultServerUrl() as Promise<string | null>
      this.urlPromise.then((url: string | null) => {
        if (url) {
          this.resolvedUrl = url
          this.config.baseUrl = url + "/v1"
          console.log("[MonacoAI] Server URL set to:", this.config.baseUrl)
        }
      }).catch((err: unknown) => {
        console.error("[MonacoAI] Failed to get server URL:", err)
      })
    }
  }

  private async resolveBaseUrl(): Promise<string> {
    // Try to get from IPC with retry — server may not be ready yet
    if (typeof window !== "undefined" && (window as any).api?.getDefaultServerUrl) {
      for (let i = 0; i < 20; i++) {
        try {
          const url = await (window as any).api.getDefaultServerUrl() as Promise<string | null>
          if (url) {
            this.resolvedUrl = url
            this.config.baseUrl = url + "/v1"
            console.log("[MonacoAI] Resolved server URL (attempt " + (i + 1) + "):", this.config.baseUrl)
            return this.config.baseUrl
          }
        } catch {
          // ignore
        }
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    // Try stored URL
    if (this.resolvedUrl) {
      this.config.baseUrl = this.resolvedUrl + "/v1"
      return this.config.baseUrl
    }

    // Fallback: try common ports
    const fallbackPorts = [3000, 3001, 4000, 5000, 8080, 8888]
    for (const port of fallbackPorts) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/global/health`, {
          method: "GET",
          signal: AbortSignal.timeout(1000),
        })
        if (res.ok) {
          this.resolvedUrl = `http://127.0.0.1:${port}`
          this.config.baseUrl = `http://127.0.0.1:${port}/v1`
          console.log("[MonacoAI] Found server on port", port)
          return this.config.baseUrl
        }
      } catch {
        // ignore
      }
    }

    console.warn("[MonacoAI] Using default baseUrl:", this.config.baseUrl)
    return this.config.baseUrl
  }

  /** Fetch available free models — deduplicated, curated list */
  async listAvailableModels(): Promise<Array<{ id: string; name: string }>> {
    const baseUrl = await this.resolveBaseUrl()
    const url = `${baseUrl}/models`
    console.log("[MonacoAI] Listing models from:", url)
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      throw new Error(`Cannot list models: HTTP ${res.status} ${errText}`)
    }
    const data = await res.json() as { data?: Array<{ id: string; owned_by?: string; name?: string }> }
    const allModels = data?.data ?? []
    console.log("[MonacoAI] All models from provider:", allModels.length)

    // Deduplicate by ID, prioritize opencode-prefixed models
    const seen = new Set<string>()
    const unique: Array<{ id: string; name: string; priority: number }> = []
    for (const m of allModels) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      // Priority: opencode/ > openrouter/ > others
      const priority = m.id.startsWith("opencode/") ? 2 : m.id.startsWith("openrouter/") ? 1 : 0
      const name = m.name || m.id.split("/").pop() || m.id
      unique.push({ id: m.id, name, priority })
    }

    // Sort: opencode first, then openrouter, then others
    unique.sort((a, b) => b.priority - a.priority)

    const list = unique.slice(0, 40).map(m => ({ id: m.id, name: m.name }))
    console.log("[MonacoAI] Filtered models:", list.length, "from", allModels.length, "total")
    return list
  }

  private async resolveFreeModel(options?: { preferredModel?: string }): Promise<string> {
    if (options?.preferredModel && options.preferredModel !== "auto") {
      console.log("[MonacoAI] Using user-selected model:", options.preferredModel)
      return options.preferredModel
    }
    if (this.cachedModel) {
      console.log("[MonacoAI] Using cached model:", this.cachedModel)
      return this.cachedModel
    }
    const baseUrl = await this.resolveBaseUrl()
    const url = `${baseUrl}/models`
    console.log("[MonacoAI] Auto: fetching models:", url)
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      throw new Error(`Cannot fetch models: HTTP ${res.status} ${errText}`)
    }
    const data = await res.json() as { data?: Array<{ id: string; owned_by?: string }> }
    const allModels = data?.data ?? []
    if (allModels.length === 0) throw new Error("No models available from backend. Check server is running.")

    // Deduplicate — prefer opencode-prefixed models
    const seen = new Set<string>()
    const opencodeModels: string[] = []
    for (const m of allModels) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      if (m.id.startsWith("opencode/") || m.id.startsWith("openrouter/")) {
        opencodeModels.push(m.id)
      }
    }
    const pool = opencodeModels.length > 0 ? opencodeModels : allModels.map(m => m.id)
    const modelId = pool[0]!
    console.log("[MonacoAI] Auto-selected model:", modelId)
    this.cachedModel = modelId
    return modelId
  }

  async generateCode(
    options: GenerateOptions,
    callbacks: StreamCallbacks
  ): Promise<void> {
    if (this.isGenerating) {
      this.cancel()
      await new Promise((r) => setTimeout(r, 100))
    }

    this.isGenerating = true
    this.abortController = new AbortController()

    const instruction = options.instruction || "generate"
    const userMessage = this.buildUserMessage(options, instruction)

    callbacks.onStart()

    try {
      const baseUrl = await this.resolveBaseUrl()
      console.log("[MonacoAI] Base URL:", baseUrl)
      const modelId = await this.resolveFreeModel({ preferredModel: options.modelId })
      console.log("[MonacoAI] Sending chat completion to:", `${baseUrl}/chat/completions`, "model:", modelId)

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          stream: true,
          max_tokens: 4096,
          temperature: 0.3,
        }),
        signal: this.abortController.signal,
      })

      console.log("[MonacoAI] Response status:", response.status, response.statusText)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[MonacoAI] API error:", response.status, errorText)
        // If 404, the server might not have this endpoint
        if (response.status === 404) {
          throw new Error("Server does not support AI generation. The backend server may need to be updated.")
        }
        throw new Error(`API Error ${response.status}: ${errorText}`)
      }

      await this.processStream(response, callbacks)
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("[MonacoAI] Generation aborted")
        callbacks.onComplete("")
        return
      }
      console.error("[MonacoAI] Generation error:", error)
      callbacks.onError(error)
    } finally {
      this.isGenerating = false
      this.abortController = null
    }
  }

  private async processStream(
    response: Response,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""
    let fullCode = ""
    let lineCount = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith("data: ")) continue
        const data = trimmed.slice(6)
        if (data === "[DONE]") {
          console.log("[MonacoAI] Stream complete, code length:", fullCode.length)
          callbacks.onComplete(fullCode)
          return
        }

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta
          if (delta?.content) {
            fullCode += delta.content
            lineCount++
            if (lineCount % 10 === 0) {
              console.log("[MonacoAI] Streaming... tokens:", lineCount, "code length:", fullCode.length)
            }
            callbacks.onToken(delta.content, fullCode)
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    console.log("[MonacoAI] Stream ended (no [DONE]), code length:", fullCode.length)
    callbacks.onComplete(fullCode)
  }

  private buildUserMessage(
    options: GenerateOptions,
    instruction: string
  ): string {
    const parts: string[] = []

    if (options.existingCode) {
      parts.push(`EXISTING CODE:\n\`\`\`${options.language}\n${options.existingCode}\n\`\`\``)
    }

    if (options.fileName) {
      parts.push(`FILE: ${options.fileName}`)
    }

    parts.push(`INSTRUCTION: ${INSTRUCTION_PROMPTS[instruction] || INSTRUCTION_PROMPTS.generate}`)
    parts.push(`USER REQUEST: ${options.prompt}`)

    return parts.join("\n\n")
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  getIsGenerating(): boolean {
    return this.isGenerating
  }

  updateConfig(config: Partial<AIAssistantConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.baseUrl) this.cachedModel = null
  }
}

// ═══════════════════════════════════════════════════════════════
// MONACO DECORATIONS — Scanning Animation
// ═══════════════════════════════════════════════════════════════

export class ScanningAnimator {
  private decorationCollection: monaco.editor.IEditorDecorationsCollection | null = null
  private animationTimer: ReturnType<typeof setInterval> | null = null
  private currentStep = 0

  start(editor: monaco.editor.IStandaloneCodeEditor, startLine: number, endLine: number): void {
    this.stop()

    const lines: number[] = []
    for (let i = startLine; i <= endLine; i++) {
      lines.push(i)
    }

      const decorations: monaco.editor.IModelDeltaDecoration[] = lines.map((line) => ({
      range: new monaco.Range(line, 1, line, Number.MAX_SAFE_INTEGER),
      options: {
        isWholeLine: true,
        className: "monaco-ai-scanning",
        overviewRuler: {
          color: "#00ff88",
          position: monaco.editor.OverviewRulerLane.Full,
        },
        minimap: { color: "#00ff88", position: monaco.editor.MinimapPosition.Inline },
      },
    }))

    this.decorationCollection = editor.createDecorationsCollection(decorations)
    this.currentStep = 0

    this.animationTimer = setInterval(() => {
      this.currentStep = (this.currentStep + 1) % 4
      this.updateAnimation(editor, lines)
    }, 200)
  }

  private updateAnimation(editor: monaco.editor.IStandaloneCodeEditor, lines: number[]): void {
    const phase = this.currentStep
    const decorations: monaco.editor.IModelDeltaDecoration[] = lines.map((line, index) => {
      const offset = (index + phase) % 4
      const opacity = offset === 0 ? 1 : offset === 1 ? 0.6 : offset === 2 ? 0.3 : 0.1

      return {
        range: new monaco.Range(line, 1, line, Number.MAX_SAFE_INTEGER),
        options: {
          isWholeLine: true,
          className: `monaco-ai-scanning monaco-ai-scanning-phase-${phase}`,
          overviewRuler: {
            color: `rgba(0, 255, 136, ${opacity})`,
            position: monaco.editor.OverviewRulerLane.Full,
          },
          minimap: { color: `rgba(0, 255, 136, ${opacity})`, position: monaco.editor.MinimapPosition.Inline },
        },
      }
    })

    this.decorationCollection?.clear()
    this.decorationCollection = editor.createDecorationsCollection(decorations)
  }

  stop(): void {
    if (this.animationTimer) {
      clearInterval(this.animationTimer)
      this.animationTimer = null
    }
    this.decorationCollection?.clear()
    this.decorationCollection = null
  }
}

// ═══════════════════════════════════════════════════════════════
// CSS STYLES — Injected into document
// ═══════════════════════════════════════════════════════════════

let stylesInjected = false

export function injectAIAssistantStyles(): void {
  if (stylesInjected) return
  stylesInjected = true

  const style = document.createElement("style")
  style.textContent = `
    .monaco-ai-scanning {
      background: linear-gradient(90deg,
        rgba(0, 255, 136, 0.05) 0%,
        rgba(0, 255, 136, 0.15) 50%,
        rgba(0, 255, 136, 0.05) 100%);
      animation: monaco-ai-scan-pulse 1.5s ease-in-out infinite;
      border-left: 2px solid rgba(0, 255, 136, 0.4);
    }

    .monaco-ai-scanning-phase-0 {
      background: linear-gradient(90deg,
        rgba(0, 255, 136, 0.12) 0%,
        rgba(0, 255, 136, 0.25) 50%,
        rgba(0, 255, 136, 0.12) 100%);
    }

    .monaco-ai-scanning-phase-1 {
      background: linear-gradient(90deg,
        rgba(0, 200, 255, 0.10) 0%,
        rgba(0, 200, 255, 0.20) 50%,
        rgba(0, 200, 255, 0.10) 100%);
    }

    .monaco-ai-scanning-phase-2 {
      background: linear-gradient(90deg,
        rgba(100, 0, 255, 0.08) 0%,
        rgba(100, 0, 255, 0.18) 50%,
        rgba(100, 0, 255, 0.08) 100%);
    }

    .monaco-ai-scanning-phase-3 {
      background: linear-gradient(90deg,
        rgba(255, 0, 136, 0.06) 0%,
        rgba(255, 0, 136, 0.15) 50%,
        rgba(255, 0, 136, 0.06) 100%);
    }

    .monaco-ai-token-appear {
      animation: monaco-ai-token-fade-in 0.15s ease-out;
    }

    @keyframes monaco-ai-scan-pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }

    @keyframes monaco-ai-token-fade-in {
      from {
        opacity: 0;
        transform: translateY(2px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .monaco-ai-inline-decoration {
      background: rgba(0, 255, 136, 0.1);
      border-bottom: 1px dashed rgba(0, 255, 136, 0.3);
    }

    @keyframes monaco-ai-overlay-pulse {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }

    /* AI Button Glow Animation */
    .monaco-ai-btn-glow {
      animation: monaco-ai-btn-glow 2s ease-in-out infinite;
    }

    @keyframes monaco-ai-btn-glow {
      0%, 100% { box-shadow: 0 0 10px rgba(0, 255, 136, 0.3); }
      50% { box-shadow: 0 0 25px rgba(0, 255, 136, 0.6); }
    }

    /* Streaming Token Animation */
    .monaco-ai-streaming {
      animation: monaco-ai-streaming-blink 0.8s ease-in-out infinite;
    }

    @keyframes monaco-ai-streaming-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    /* ═══ FLOATING AI INSTRUCTION LINE ═══ */

    .monaco-ai-instruction-line {
      cursor: pointer;
      position: relative;
    }

    .monaco-ai-instruction-line::before {
      content: "⚡";
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      margin-left: 2px;
      border-radius: 4px;
      background: linear-gradient(135deg, #00ff88, #00ccff);
      color: #000;
      box-shadow: 0 0 8px rgba(0, 255, 136, 0.4);
      animation: monaco-ai-float-pulse 2s ease-in-out infinite;
    }

    .monaco-ai-instruction-line:hover::before {
      transform: scale(1.2);
      box-shadow: 0 0 15px rgba(0, 255, 136, 0.6);
    }

    @keyframes monaco-ai-float-pulse {
      0%, 100% { box-shadow: 0 0 8px rgba(0, 255, 136, 0.4); }
      50% { box-shadow: 0 0 15px rgba(0, 255, 136, 0.7); }
    }

    /* Instruction comment highlight */
    .monaco-ai-instruction-comment {
      color: #00ff88 !important;
      font-weight: 500;
      font-style: italic;
      border-bottom: 1px dashed rgba(0, 255, 136, 0.3);
    }

    .monaco-ai-instruction-inline {
      color: #00ff88 !important;
      font-weight: 600;
      background: rgba(0, 255, 136, 0.08);
      padding: 1px 4px;
      border-radius: 3px;
    }

    /* Status bar slide up */
    @keyframes monaco-ai-status-slide-up {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `
  document.head.appendChild(style)
}

// ═══════════════════════════════════════════════════════════════
// INSTRUCTION DETECTOR — Scans code for AI instruction patterns
// ═══════════════════════════════════════════════════════════════

export interface DetectedInstruction {
  line: number
  instruction: string
  type: "fix" | "generate" | "improve" | "explain"
  isComment: boolean
  rawText: string
}

// Keywords that trigger AI instruction detection
const INSTRUCTION_KEYWORDS: Record<string, Array<{ pattern: RegExp; type: DetectedInstruction["type"] }>> = {
  // English keywords
  en: [
    { pattern: /\bfix\s+(this|the|all|bug|error|issue|problem|it)\b/i, type: "fix" },
    { pattern: /\bcreate\s+(a|an|the|this|new|function|class|component|file)\b/i, type: "generate" },
    { pattern: /\bgenerate\s+(code|function|class|component|file)\b/i, type: "generate" },
    { pattern: /\bwrite\s+(a|an|the|this|new|function|class|code)\b/i, type: "generate" },
    { pattern: /\badd\s+(error\s+handling|validation|support)\b/i, type: "improve" },
    { pattern: /\bimprove\s+(this|the|code|performance|readability)\b/i, type: "improve" },
    { pattern: /\boptimize\s+(this|the|code|for|performance)\b/i, type: "improve" },
    { pattern: /\bexplain\s+(this|the|code|how|what)\b/i, type: "explain" },
    { pattern: /\brefactor\s+(this|the|code|function)\b/i, type: "improve" },
    { pattern: /\bmake\s+(this|it|better|work|functioning)\b/i, type: "improve" },
  ],
  // Bengali keywords
  bn: [
    { pattern: /ফিক্স\s+কর[োও]/i, type: "fix" },
    { pattern: /ঠিক\s+কর[োও]/i, type: "fix" },
    { pattern: /সমাধান\s+কর[োও]/i, type: "fix" },
    { pattern: /তৈরি\s+কর[োও]/i, type: "generate" },
    { pattern: /বানাও/i, type: "generate" },
    { pattern: /লেখ[োও]/i, type: "generate" },
    { pattern: /ভালো\s+কর[োও]/i, type: "improve" },
    { pattern: /উন্নত\s+কর[োও]/i, type: "improve" },
    { pattern: /অপ্টিমাইজ\s+কর[োও]/i, type: "improve" },
    { pattern: /ব্যাখ্যা\s+কর[োও]/i, type: "explain" },
  ],
  // Arabic keywords
  ar: [
    { pattern: / исправь|صحح/i, type: "fix" },
    { pattern: /أنشئ|اكتب|创作/i, type: "generate" },
    { pattern: /حسّن|verbesserung/i, type: "improve" },
    { pattern: /اشرح|erkläre/i, type: "explain" },
  ],
  // Japanese keywords
  ja: [
    { pattern: /修正|直し|バグ修正/i, type: "fix" },
    { pattern: /作成|作って|書いて/i, type: "generate" },
    { pattern: /改善|最適化/i, type: "improve" },
    { pattern: /説明/i, type: "explain" },
  ],
  // Chinese keywords
  zh: [
    { pattern: /修复|修正|修改/i, type: "fix" },
    { pattern: /创建|生成|写一个/i, type: "generate" },
    { pattern: /优化|改进|改善/i, type: "improve" },
    { pattern: /解释|说明/i, type: "explain" },
  ],
  // Russian keywords
  ru: [
    { pattern: /исправь|фиксируй/i, type: "fix" },
    { pattern: /создай|напиши/i, type: "generate" },
    { pattern: /улучши|оптимизируй/i, type: "improve" },
    { pattern: /объясни/i, type: "explain" },
  ],
  // Korean keywords
  ko: [
    { pattern: /수정|고쳐|버그수정/i, type: "fix" },
    { pattern: /만들어|생성|작성/i, type: "generate" },
    { pattern: /개선|최적화/i, type: "improve" },
    { pattern: /설명/i, type: "explain" },
  ],
  // Hindi keywords
  hi: [
    { pattern: /ठीक\s+कर[ोओ]/i, type: "fix" },
    { pattern: /बनाओ|लिख[ोओ]/i, type: "generate" },
    { pattern: /सुधार[ोओ]|बेहतर\s+बनाओ/i, type: "improve" },
    { pattern: /समझाओ/i, type: "explain" },
  ],
}

// Comment patterns (//, #, /*, --, etc.)
const COMMENT_PATTERNS = [
  /^\s*\/\//,    // JavaScript/TypeScript single-line comment
  /^\s*#/,       // Python/Ruby/Shell comment
  /^\s*--/,      // SQL comment
  /^\s*\/\*/,    // C-style block comment start
  /^\s*<!--/,    // HTML comment
]

function isCommentLine(line: string): boolean {
  return COMMENT_PATTERNS.some((p) => p.test(line))
}

/**
 * Detect AI instruction patterns in code
 * Scans for natural language instructions in comments or standalone lines
 */
export function detectInstructions(code: string): DetectedInstruction[] {
  const instructions: DetectedInstruction[] = []
  const lines = code.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) continue

    const isComment = isCommentLine(line)
    if (!isComment) continue

    for (const [, keywords] of Object.entries(INSTRUCTION_KEYWORDS)) {
      for (const { pattern, type } of keywords) {
        if (pattern.test(trimmed)) {
          const instruction = trimmed.replace(/^(\s*\/\s*\/\s*|\s*#\s*|\s*--\s*)/, "").trim()

          instructions.push({
            line: i + 1,
            instruction,
            type,
            isComment,
            rawText: line,
          })
          break
        }
      }
    }
  }

  return instructions
}
