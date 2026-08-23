# Monaco Editor AI Assistant — Setup Guide

## Overview

ZYRAXON's Monaco Editor has a built-in AI Assistant that detects natural language instructions in your code and rewrites the entire codebase live.

## How It Works

### 1. Write an Instruction
Type a comment with an instruction keyword anywhere in your code:

```javascript
// এটা ফিক্স করো
function buggyCode() {
  // ... broken code
}

// Create a login form with validation
// ... existing code

# Optimize this function for performance
```

### 2. AI Detects the Instruction
- A **⚡** icon appears in the glyph margin next to that line
- The instruction text is highlighted in green
- Hover over the ⚡ to see the detected instruction

### 3. Click ⚡ to Execute
- AI reads the instruction + full code context
- Code streams in live (token-by-token)
- Scanning animation shows while AI works
- Click **Stop** to cancel

### 4. Full Code Rewrite
- AI rewrites the ENTIRE code (not just that line)
- Instruction line is automatically removed
- New code appears with live streaming

## Supported Languages

### English
- `// Fix this bug`
- `// Create a login form`
- `// Improve performance`
- `// Explain how this works`

### Bengali (বাংলা)
- `// এটা ফিক্স করো`
- `// তৈরি করো`
- `// ভালো করো`
- `// ব্যাখ্যা করো`

### Arabic (عربي)
- `// أصلح`
- `// أنشئ`
- `// حسّن`
- `// اشرح`

### Japanese (日本語)
- `// 修正して`
- `// 作成して`
- `// 改善して`
- `// 説明して`

### Chinese (中文)
- `// 修复`
- `// 创建`
- `// 优化`
- `// 解释`

### Russian (Русский)
- `// исправь`
- `// создай`
- `// улучши`
- `// объясни`

### Korean (한국어)
- `// 수정해줘`
- `// 만들어줘`
- `// 개선해줘`
- `// 설명해줘`

### Hindi (हिन्दी)
- `// ठीक करो`
- `// बनाओ`
- `// सुधारो`
- `// समझाओ`

## Instruction Types

| Type | Keywords | Behavior |
|------|----------|----------|
| **Fix** | fix, ফিক্স, 修正, 等 | Detects bugs and fixes them |
| **Generate** | create, generate, তৈরি, 创建 | Creates new code from scratch |
| **Improve** | improve, optimize, ভালো, 改善 | Optimizes existing code |
| **Explain** | explain, ব্যাখ্যা, 説明 | Explains what code does |

## Comment Patterns Detected

- `//` — JavaScript/TypeScript single-line
- `#` — Python/Ruby/Shell
- `--` — SQL
- `/*` — C-style block comment
- `<!--` — HTML comment

## Features

### Live Streaming
- Code appears token-by-token
- No waiting for full generation
- See progress in real-time

### Context-Aware
- AI reads full code context
- Understands existing structure
- Preserves imports and conventions

### Multi-Language Prompts
- Write instructions in any language
- AI understands Bengali, English, Arabic, etc.
- Automatic language detection

### Scanning Animation
- Green pulse animation while AI works
- Status bar shows current instruction
- Cancel anytime with Stop button

## Keyboard Shortcuts

- **Ctrl+S** — Save file
- **Ctrl+Z** — Undo
- **Ctrl+Y** — Redo

## Architecture

### Files:
1. `monaco-ai-assistant.ts` — AI service + instruction detector
2. `monaco-editor.tsx` — Editor with floating widgets

### Components:
- **MonacoAIAssistant** — SSE streaming with Opencode provider
- **ScanningAnimator** — Visual scanning effect
- **detectInstructions** — Multi-language instruction detection
- **CodeGuardianScanner** — Real-time error detection

## Provider Configuration

Default model: `opencode/deepseek-v4-flash-free` (free, unlimited)

### Available Free Models:
- `opencode/deepseek-v4-flash-free` (200K)
- `opencode/glm-4.7-free` (204K)
- `opencode/kimi-k2.5-free` (262K)
- `opencode/mimo-v2-pro-free` (1M)

### To change model:
Edit `monaco-editor.tsx`:
```typescript
const aiAssistant = new MonacoAIAssistant({
  model: "opencode/glm-4.7-free",
})
```

## Troubleshooting

### ⚡ icon not appearing
- Check if instruction contains a keyword
- Ensure proper comment syntax
- Try different keyword (fix/create/improve)

### Code not streaming
- Check network connection
- Verify Opencode provider is connected
- Check browser console for errors

### Animation stuck
- Click **Stop** button
- Refresh the editor
- Check for API errors

---

**Last Updated**: August 2026
**Version**: 1.0.0
**Author**: ZYRAXON AI Team
