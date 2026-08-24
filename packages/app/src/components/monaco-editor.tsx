import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js"
import type * as Monaco from "monaco-editor"
import { useTheme } from "@zyraxon-ai/ui/theme/context"
import { CodeGuardianScanner, CodeGuardianAIFeedback, type CodeIssue } from "./code-guardian"
import {
  MonacoAIAssistant,
  ScanningAnimator,
  injectAIAssistantStyles,
  detectInstructions,
  type DetectedInstruction,
  type GenerateOptions,
} from "./monaco-ai-assistant"

let monacoCssLoaded = false
function loadMonacoCss() {
  if (monacoCssLoaded) return
  monacoCssLoaded = true
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = new URL("monaco-editor/min/vs/editor/editor.main.css", import.meta.url).href
  document.head.appendChild(link)
}

let workersConfigured = false
function configureMonacoWorkers() {
  if (workersConfigured) return
  workersConfigured = true
  ;(window as any).MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      const getWorkerModule = (moduleUrl: string) => {
        return new Worker(new URL(moduleUrl, import.meta.url), { type: "module" })
      }
      switch (label) {
        case "json":
          return getWorkerModule("monaco-editor/esm/vs/language/json/json.worker?worker")
        case "css":
        case "scss":
        case "less":
          return getWorkerModule("monaco-editor/esm/vs/language/css/css.worker?worker")
        case "html":
        case "handlebars":
        case "razor":
          return getWorkerModule("monaco-editor/esm/vs/language/html/html.worker?worker")
        case "typescript":
        case "javascript":
          return getWorkerModule("monaco-editor/esm/vs/language/typescript/ts.worker?worker")
        default:
          return getWorkerModule("monaco-editor/esm/vs/editor/editor.worker?worker")
      }
    },
  }
}

export interface MonacoEditorProps {
  value: string
  language?: string
  theme?: string
  readOnly?: boolean
  onChange?: (value: string) => void
  onSave?: (value: string) => void
  path?: string
  height?: string
  class?: string
}

export function MonacoEditor(props: MonacoEditorProps) {
  const theme = useTheme()
  let containerRef: HTMLDivElement | undefined
  let editor: Monaco.editor.IStandaloneCodeEditor | undefined
  let monaco: typeof import("monaco-editor") | undefined
  let isSyncing = false
  let lastSyncedValue: string | undefined
  let userHasEdited = false
  let scanDebounce: ReturnType<typeof setTimeout> | null = null
  let userEditDebounce: ReturnType<typeof setTimeout> | null = null

  // AI State
  const [aiGenerating, setAiGenerating] = createSignal(false)
  const [activeInstruction, setActiveInstruction] = createSignal<DetectedInstruction | null>(null)

  const aiAssistant = new MonacoAIAssistant({ model: "opencode/deepseek-v4-flash-free" })
  const scanner = new ScanningAnimator()
  const guardian = new CodeGuardianScanner()
  const feedback = new CodeGuardianAIFeedback()
  let tokenBuffer = ""
  let streamingDebounce: ReturnType<typeof setTimeout> | null = null
  let widgetDisposable: Monaco.editor.IEditorDecorationsCollection | null = null

  const getTheme = () => {
    if (props.theme) return props.theme
    return theme.mode() === "dark" ? "zyraxon-dark" : "zyraxon-light"
  }

  // ═══════════════════════════════════════════════════════════════
  // DETECT INSTRUCTIONS → SHOW FLOATING BUTTON
  // ═══════════════════════════════════════════════════════════════
  const updateFloatingWidgets = () => {
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (!model) return

    const code = model.getValue()
    const instructions = detectInstructions(code)

    // Clear old widgets
    if (widgetDisposable) {
      widgetDisposable.clear()
    }

    if (instructions.length === 0) return

    // Create decorations (floating ⚡ buttons) next to instruction lines
    const decorations: Monaco.editor.IModelDeltaDecoration[] = instructions.map((inst) => ({
      range: new monaco!.Range(inst.line, 1, inst.line, 1),
      options: {
        isWholeLine: true,
        glyphMarginClassName: "monaco-ai-instruction-line",
        glyphMarginHoverMessage: {
          value: `**⚡ AI Assistant**\n\nInstruction detected: "${inst.instruction}"\n\nClick the ⚡ icon to execute.`,
        },
        // Inline decoration — highlighted instruction text
        inlineClassName: inst.isComment ? "monaco-ai-instruction-comment" : "monaco-ai-instruction-inline",
        overviewRuler: {
          color: "#00ff88",
          position: monaco!.editor.OverviewRulerLane.Right,
        },
      },
    }))

    widgetDisposable = editor.createDecorationsCollection(decorations)

    // Store instructions for click handling
    floatingInstructions = instructions
  }

  let floatingInstructions: DetectedInstruction[] = []

  // ═══════════════════════════════════════════════════════════════
  // HANDLE GLYPH MARGIN CLICK (⚡ button)
  // ═══════════════════════════════════════════════════════════════
  const handleGlyphMarginClick = (e: any) => {
    if (!editor || !monaco) return
    const lineNumber = e.target?.position?.lineNumber
    if (!lineNumber) return

    const instruction = floatingInstructions.find((inst) => inst.line === lineNumber)
    if (!instruction) return

    executeInstruction(instruction)
  }

  // ═══════════════════════════════════════════════════════════════
  // EXECUTE INSTRUCTION — Stream full code rewrite
  // ═══════════════════════════════════════════════════════════════
  const executeInstruction = async (instruction: DetectedInstruction) => {
    if (aiGenerating()) {
      aiAssistant.cancel()
      scanner.stop()
      setAiGenerating(false)
      return
    }

    const currentCode = editor?.getValue() || ""
    const language = props.language || "typescript"
    const model = editor?.getModel()

    setAiGenerating(true)
    setActiveInstruction(instruction)

    // Start scanning animation on the instruction line
    if (model) {
      scanner.start(editor!, instruction.line, model.getLineCount())
    }

    const options: GenerateOptions = {
      prompt: instruction.instruction,
      language,
      existingCode: currentCode,
      fileName: props.path,
      instruction: instruction.type,
    }

    tokenBuffer = ""

    await aiAssistant.generateCode(options, {
      onStart: () => {
        if (!editor) return
        // Clear the instruction line (remove the comment)
        isSyncing = true
        const lines = currentCode.split("\n")
        lines.splice(instruction.line - 1, 1)
        editor.setValue(lines.join("\n"))
        isSyncing = false
      },

      onToken: (token, fullCode) => {
        if (!editor) return
        tokenBuffer = fullCode

        if (streamingDebounce) clearTimeout(streamingDebounce)
        streamingDebounce = setTimeout(() => {
          if (!editor) return
          isSyncing = true
          editor.setValue(tokenBuffer)
          isSyncing = false
          props.onChange?.(tokenBuffer)

          const lineCount = editor.getModel()?.getLineCount() || 0
          editor.revealLine(lineCount)
        }, 30)
      },

      onComplete: (fullCode) => {
        if (!editor) return
        scanner.stop()

        if (streamingDebounce) clearTimeout(streamingDebounce)

        isSyncing = true
        editor.setValue(fullCode || currentCode)
        isSyncing = false
        props.onChange?.(fullCode || currentCode)

        setAiGenerating(false)
        setActiveInstruction(null)

        setTimeout(() => updateFloatingWidgets(), 100)

        if (fullCode) {
          runGuardianScan(fullCode)
          props.onSave?.(fullCode)
        }
      },

      onError: (error) => {
        scanner.stop()
        if (streamingDebounce) clearTimeout(streamingDebounce)
        setAiGenerating(false)
        setActiveInstruction(null)
        // Restore original code on error
        isSyncing = true
        editor?.setValue(currentCode)
        isSyncing = false
      },
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // CODE GUARDIAN
  // ═══════════════════════════════════════════════════════════════
  const runGuardianScan = (code: string) => {
    const model = editor?.getModel()
    if (!model) return
    const filePath = model.uri.path || "untitled"
    const result = guardian.scan(filePath, code)
    const markers: Monaco.editor.IMarkerData[] = result.issues.map((issue: CodeIssue) => ({
      severity: issue.severity === "error" ? monaco!.MarkerSeverity.Error :
                issue.severity === "warning" ? monaco!.MarkerSeverity.Warning :
                monaco!.MarkerSeverity.Info,
      message: issue.message,
      startLineNumber: issue.line,
      startColumn: issue.column,
      endLineNumber: issue.endLine,
      endColumn: issue.endColumn,
      source: `Code Guardian [${issue.ruleId}]`,
      tags: issue.severity === "error" ? [monaco!.MarkerTag.Unnecessary] : undefined,
    }))
    monaco!.editor.setModelMarkers(model, "code-guardian", markers)
    for (const issue of result.issues) {
      if (issue.severity === "error") {
        feedback.signalError(issue, filePath, code)
      }
    }
  }

  const debouncedScan = (code: string) => {
    if (scanDebounce) clearTimeout(scanDebounce)
    scanDebounce = setTimeout(() => runGuardianScan(code), 200)
  }

  // ═══════════════════════════════════════════════════════════════
  // MONACO MOUNT
  // ═══════════════════════════════════════════════════════════════
  onMount(async () => {
    if (!containerRef) return

    loadMonacoCss()
    configureMonacoWorkers()
    injectAIAssistantStyles()
    const monacoModule = await import("monaco-editor")
    monaco = monacoModule

    monaco.editor.defineTheme("zyraxon-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6A9955", fontStyle: "italic" },
        { token: "keyword", foreground: "569CD6" },
        { token: "string", foreground: "CE9178" },
        { token: "number", foreground: "B5CEA8" },
        { token: "type", foreground: "4EC9B0" },
        { token: "function", foreground: "DCDCAA" },
        { token: "variable", foreground: "9CDCFE" },
        { token: "operator", foreground: "D4D4D4" },
      ],
      colors: {
        "editor.background": "#0d1117",
        "editor.foreground": "#c9d1d9",
        "editor.lineHighlightBackground": "#161b2280",
        "editor.selectionBackground": "#264f7860",
        "editorCursor.foreground": "#58a6ff",
        "editorLineNumber.foreground": "#484f58",
        "editorLineNumber.activeForeground": "#c9d1d9",
        "editor.selectionHighlightBackground": "#264f7840",
        "editorIndentGuide.background": "#21262d",
        "editorIndentGuide.activeBackground": "#30363d",
        "editorGutter.background": "#0d1117",
        "minimap.background": "#0d1117",
        "scrollbarSlider.background": "#484f5833",
        "scrollbarSlider.hoverBackground": "#484f5844",
        "scrollbarSlider.activeBackground": "#484f5888",
      },
    })

    monaco.editor.defineTheme("zyraxon-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "008000", fontStyle: "italic" },
        { token: "keyword", foreground: "0000FF" },
        { token: "string", foreground: "A31515" },
        { token: "number", foreground: "098658" },
        { token: "type", foreground: "267F99" },
        { token: "function", foreground: "795E26" },
        { token: "variable", foreground: "001080" },
        { token: "operator", foreground: "000000" },
      ],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#000000",
        "editor.lineHighlightBackground": "#f5f5f5",
        "editor.selectionBackground": "#add6ff",
        "editorCursor.foreground": "#000000",
        "editorLineNumber.foreground": "#237893",
        "editorLineNumber.activeForeground": "#000000",
        "editor.selectionHighlightBackground": "#add6ff40",
        "editorIndentGuide.background": "#d3d3d3",
        "editorIndentGuide.activeBackground": "#939393",
        "editorGutter.background": "#ffffff",
        "minimap.background": "#ffffff",
        "scrollbarSlider.background": "#00000022",
        "scrollbarSlider.hoverBackground": "#00000033",
        "scrollbarSlider.activeBackground": "#00000044",
      },
    })

    containerRef.addEventListener("keydown", (e) => {
      const isEditorShortcut = (e.ctrlKey || e.metaKey) && ["z", "y", "x", "v", "c", "a"].includes(e.key.toLowerCase())
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s"
      const isEditorKey = ["Delete", "Backspace", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key)
      const isRedoAlt = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z"
      if (isEditorShortcut || isSave || isEditorKey || isRedoAlt || e.key.length > 1) return
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) return
      e.stopPropagation()
    }, true)

    editor = monaco.editor.create(containerRef, {
      value: props.value,
      language: props.language || "plaintext",
      theme: getTheme(),
      readOnly: props.readOnly ?? false,
      minimap: { enabled: true },
      fontSize: 14,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: "on",
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      renderLineHighlight: "all",
      bracketPairColorization: { enabled: true },
      padding: { top: 12, bottom: 12 },
      folding: true,
      formatOnPaste: true,
      formatOnType: true,
      copyWithSyntaxHighlighting: true,
      multiCursorModifier: "ctrlCmd",
      wordBasedSuggestions: "allDocuments",
      glyphMargin: true,
      suggest: {
        showMethods: true,
        showFunctions: true,
        showConstructors: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showKeywords: true,
        showWords: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true,
        showTypeParameters: true,
        showSnippets: true,
      },
    })

    // Listen for glyph margin clicks (⚡ buttons)
    editor.onMouseDown((e) => {
      if (e.target.type === monaco!.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const lineNumber = e.target.position?.lineNumber
        if (lineNumber) {
          const instruction = floatingInstructions.find((inst) => inst.line === lineNumber)
          if (instruction) {
            e.event.preventDefault()
            e.event.stopPropagation()
            executeInstruction(instruction)
          }
        }
      }
    })

    editor.onDidChangeModelContent(() => {
      if (isSyncing) return
      userHasEdited = true
      const value = editor?.getValue() || ""
      props.onChange?.(value)
      debouncedScan(value)
      updateFloatingWidgets()
      if (userEditDebounce) clearTimeout(userEditDebounce)
      userEditDebounce = setTimeout(() => { userHasEdited = false }, 1000)
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const value = editor?.getValue() || ""
      props.onSave?.(value)
    })

    editor.focus()

    // Hover provider
    monaco.languages.registerHoverProvider(props.language || "typescript", {
      provideHover: (model: any, position: any) => {
        const line = model.getLineContent(position.lineNumber)
        const result = guardian.scan(model.uri.path || "", line)
        const issue = result.issues.find(
          (i: CodeIssue) => i.line === position.lineNumber && i.column <= position.column && i.endColumn >= position.column
        )
        if (!issue) return null
        return {
          range: new monaco!.Range(issue.line, issue.column, issue.endLine, issue.endColumn),
          contents: [
            { value: `**Code Guardian** — \`${issue.ruleId}\`` },
            { value: issue.message },
            { value: `**Category:** ${issue.category}\n\n**Suggestion:** ${issue.suggestion}` },
          ],
        }
      },
    })

    // Code actions
    monaco.languages.registerCodeActionProvider(props.language || "typescript", {
      provideCodeActions: (model: any, range: any) => {
        const code = model.getValue()
        const result = guardian.scan(model.uri.path || "", code)
        const actions: any[] = []
        for (const issue of result.issues) {
          if (issue.line >= range.startLineNumber && issue.line <= range.endLineNumber) {
            actions.push({
              title: `Fix: ${issue.ruleId}`,
              kind: "quickfix",
              diagnostics: [{
                severity: issue.severity === "error" ? monaco!.MarkerSeverity.Error : monaco!.MarkerSeverity.Warning,
                message: issue.message,
                range: new monaco!.Range(issue.line, issue.column, issue.endLine, issue.endColumn),
              }],
              edit: {
                edits: [{
                  resource: model.uri,
                  edit: {
                    range: new monaco!.Range(issue.line, issue.column, issue.endLine, issue.endColumn),
                    text: issue.suggestion,
                  },
                }],
              },
            })
          }
        }
        return { actions, dispose: () => {} }
      },
    })

    // Initial scan for instructions
    updateFloatingWidgets()
  })

  createEffect(() => {
    if (!editor || !monaco) return
    const mode = theme.mode()
    const newTheme = mode === "dark" ? "zyraxon-dark" : "zyraxon-light"
    monaco.editor.setTheme(newTheme)
  })

  const handleClick = () => {
    editor?.focus()
  }

  createEffect(() => {
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (model && props.language) {
      monaco.editor.setModelLanguage(model, props.language)
    }
  })

  createEffect(() => {
    if (!editor) return
    const newValue = props.value
    if (userHasEdited) return
    const currentValue = editor.getValue()
    if (newValue !== currentValue) {
      isSyncing = true
      lastSyncedValue = newValue
      editor.setValue(newValue)
      isSyncing = false
    }
  })

  onCleanup(() => {
    if (scanDebounce) clearTimeout(scanDebounce)
    if (userEditDebounce) clearTimeout(userEditDebounce)
    if (streamingDebounce) clearTimeout(streamingDebounce)
    scanner.stop()
    widgetDisposable?.clear()
    editor?.dispose()
  })

  return (
    <div class="relative flex flex-col w-full h-full" style={{ "min-height": "300px" }}>
      {/* ═══ EDITOR ═══ */}
      <div
        ref={containerRef}
        class="flex-1 min-h-0"
        style={{ width: "100%" }}
        onClick={handleClick}
      />

      {/* ═══ AI GENERATING STATUS BAR ═══ */}
      <Show when={aiGenerating()}>
        <div
          class="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 px-4 py-2"
          style={{
            "background": "linear-gradient(135deg, rgba(0,255,136,0.15) 0%, rgba(0,204,255,0.15) 100%)",
            "backdrop-filter": "blur(10px)",
            "border-top": "1px solid rgba(0,255,136,0.3)",
            "animation": "monaco-ai-status-slide-up 0.3s ease-out",
          }}
        >
          <div class="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <span class="text-xs font-medium text-[#00ff88]">
            AI is rewriting code...
          </span>
          <Show when={activeInstruction()}>
            <span class="text-xs text-[#aaa]">"{activeInstruction()!.instruction}"</span>
          </Show>
          <button
            class="px-2 py-0.5 text-[10px] font-medium rounded bg-[rgba(255,255,255,0.1)] text-[#ff6b6b] hover:bg-[rgba(255,255,255,0.2)] transition-colors"
            onClick={() => {
              aiAssistant.cancel()
              scanner.stop()
              setAiGenerating(false)
              setActiveInstruction(null)
            }}
          >
            Stop
          </button>
        </div>
      </Show>

      {/* ═══ SCANNING OVERLAY ═══ */}
      <Show when={aiGenerating()}>
        <div
          class="absolute inset-0 pointer-events-none"
          style={{
            "background": "linear-gradient(180deg, rgba(0,255,136,0.02) 0%, transparent 20%, transparent 80%, rgba(0,204,255,0.02) 100%)",
            "animation": "monaco-ai-overlay-pulse 2s ease-in-out infinite",
          }}
        />
      </Show>
    </div>
  )
}

export function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || ""
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    md: "markdown",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    ps1: "powershell",
    bat: "batch",
    dockerfile: "dockerfile",
    toml: "ini",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    txt: "plaintext",
    csv: "plaintext",
  }
  return langMap[ext] || "plaintext"
}
