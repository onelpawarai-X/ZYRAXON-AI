import * as monaco from "monaco-editor"

export interface AIAssistantConfig {
  provider: "opencode"
  model: string
  baseUrl: string
  apiKey?: string
}

export interface GenerateOptions {
  prompt: string
  language: string
  existingCode: string
  fileName?: string
  instruction?: "fix" | "generate" | "explain" | "improve"
}

export interface StreamCallbacks {
  onToken: (token: string, fullCode: string) => void
  onComplete: (fullCode: string) => void
  onError: (error: Error) => void
  onStart: () => void
}

const SYSTEM_PROMPT = `You are an expert code assistant integrated into a code editor.
Your job is to generate, fix, improve, or explain code based on user instructions.

RULES:
1. ONLY output the code - no explanations, no markdown, no code fences
2. Match the existing code style and conventions
3. Preserve imports and existing structure
4. Use proper indentation matching the file
5. If fixing bugs, keep the original intent
6. If asked to improve, make minimal but effective changes
7. NEVER add comments unless specifically asked
8. Output ONLY the final code, nothing else`

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

  constructor(config?: Partial<AIAssistantConfig>) {
    this.config = {
      provider: "opencode",
      model: config?.model || "opencode/deepseek-v4-flash-free",
      baseUrl: config?.baseUrl || "https://api.opencode.ai/v1",
      apiKey: config?.apiKey,
    }
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
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
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

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API Error ${response.status}: ${errorText}`)
      }

      await this.processStream(response, callbacks)
    } catch (error: any) {
      if (error.name === "AbortError") {
        callbacks.onComplete("")
        return
      }
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
          callbacks.onComplete(fullCode)
          return
        }

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta
          if (delta?.content) {
            fullCode += delta.content
            callbacks.onToken(delta.content, fullCode)
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

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
