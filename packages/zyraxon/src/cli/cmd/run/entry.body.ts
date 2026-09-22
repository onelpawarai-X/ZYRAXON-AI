import { toolEntryBody } from "./tool"
import type { RunEntryBody, StreamCommit } from "./types"

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"]
const AUDIO_EXTS = [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".wma"]
const VIDEO_EXTS = [".mp4", ".webm", ".mkv", ".avi", ".mov", ".flv"]

function detectMediaInText(text: string): RunEntryBody | null {
  const urlMatch = text.match(/(https?:\/\/[^\s<>"]+\.(png|jpg|jpeg|gif|bmp|webp|mp3|wav|flac|ogg|m4a|mp4|webm|mkv))/i)
  if (urlMatch) {
    const ext = "." + urlMatch[2].toLowerCase()
    if (IMAGE_EXTS.includes(ext)) return { type: "image", url: urlMatch[1], mime: `image/${urlMatch[2].toLowerCase()}` }
    if (AUDIO_EXTS.includes(ext)) return { type: "audio", url: urlMatch[1], mime: `audio/${urlMatch[2].toLowerCase()}` }
    if (VIDEO_EXTS.includes(ext)) return { type: "video", url: urlMatch[1], mime: `video/${urlMatch[2].toLowerCase()}` }
  }

  const pathMatch = text.match(/(?:file:\/\/|[A-Z]:\\[\w\\. -]+|(?:\/[\w. -]+)+)\.(png|jpg|jpeg|gif|bmp|webp|mp3|wav|flac|ogg|m4a|mp4|webm|mkv)\b/i)
  if (pathMatch) {
    const ext = "." + pathMatch[2].toLowerCase()
    const filePath = pathMatch[0]
    if (IMAGE_EXTS.includes(ext)) return { type: "image", url: filePath, mime: `image/${pathMatch[2].toLowerCase()}`, filename: filePath }
    if (AUDIO_EXTS.includes(ext)) return { type: "audio", url: filePath, mime: `audio/${pathMatch[2].toLowerCase()}`, filename: filePath }
    if (VIDEO_EXTS.includes(ext)) return { type: "video", url: filePath, mime: `video/${pathMatch[2].toLowerCase()}`, filename: filePath }
  }

  return null
}

export type EntryFlags = {
  startOnNewLine: boolean
  trailingNewline: boolean
}

export const RUN_ENTRY_NONE: RunEntryBody = {
  type: "none",
}

export function cleanRunText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

function textBody(content: string): RunEntryBody {
  if (!content) {
    return RUN_ENTRY_NONE
  }

  return {
    type: "text",
    content,
  }
}

function codeBody(content: string, filetype?: string): RunEntryBody {
  if (!content) {
    return RUN_ENTRY_NONE
  }

  return {
    type: "code",
    content,
    filetype,
  }
}

function markdownBody(content: string): RunEntryBody {
  if (!content) {
    return RUN_ENTRY_NONE
  }

  return {
    type: "markdown",
    content,
  }
}

function userBody(raw: string): RunEntryBody {
  if (!raw.trim()) {
    return RUN_ENTRY_NONE
  }

  const lead = raw.match(/^\n+/)?.[0] ?? ""
  const body = lead ? raw.slice(lead.length) : raw
  return textBody(`${lead}› ${body}`)
}

function reasoningBody(raw: string): RunEntryBody {
  const clean = raw.replace(/\[REDACTED\]/g, "")
  if (!clean) {
    return RUN_ENTRY_NONE
  }

  const lead = clean.match(/^\n+/)?.[0] ?? ""
  const body = lead ? clean.slice(lead.length) : clean
  const mark = "Thinking:"
  if (body.startsWith(mark)) {
    return codeBody(`${lead}_Thinking:_ ${body.slice(mark.length).trimStart()}`, "markdown")
  }

  return codeBody(clean, "markdown")
}

function systemBody(raw: string, phase: StreamCommit["phase"]): RunEntryBody {
  return textBody(phase === "progress" ? raw : raw.trim())
}

export function entryFlags(commit: StreamCommit): EntryFlags {
  if (commit.summary) {
    return {
      startOnNewLine: true,
      trailingNewline: false,
    }
  }

  if (commit.kind === "user") {
    return {
      startOnNewLine: true,
      trailingNewline: false,
    }
  }

  if (commit.kind === "tool") {
    if (commit.phase === "progress") {
      return {
        startOnNewLine: false,
        trailingNewline: false,
      }
    }

    return {
      startOnNewLine: true,
      trailingNewline: true,
    }
  }

  if (commit.kind === "assistant" || commit.kind === "reasoning") {
    if (commit.phase === "progress") {
      return {
        startOnNewLine: false,
        trailingNewline: false,
      }
    }

    return {
      startOnNewLine: true,
      trailingNewline: true,
    }
  }

  if (commit.kind === "error") {
    return {
      startOnNewLine: true,
      trailingNewline: false,
    }
  }

  return {
    startOnNewLine: true,
    trailingNewline: true,
  }
}

export function entryDone(commit: StreamCommit): boolean {
  if (commit.kind === "assistant" || commit.kind === "reasoning") {
    return commit.phase === "final"
  }

  if (commit.kind === "tool") {
    return commit.phase === "final" || (commit.phase === "progress" && commit.toolState === "completed")
  }

  return true
}

export function entryCanStream(commit: StreamCommit, body: RunEntryBody): boolean {
  if (commit.phase !== "progress") {
    return false
  }

  if (body.type === "none") {
    return false
  }

  if (commit.kind === "tool") {
    return commit.toolState !== "completed"
  }

  return commit.kind === "assistant" || commit.kind === "reasoning"
}

export function entryBody(commit: StreamCommit): RunEntryBody {
  if (commit.summary) {
    return RUN_ENTRY_NONE
  }

  const raw = cleanRunText(commit.text)

  if (commit.kind === "user") {
    return userBody(raw)
  }

  if (commit.kind === "tool") {
    return toolEntryBody(commit, raw) ?? RUN_ENTRY_NONE
  }

  if (commit.kind === "assistant") {
    if (commit.phase === "start") {
      return RUN_ENTRY_NONE
    }

    if (commit.phase === "final") {
      return commit.interrupted ? textBody("assistant interrupted") : RUN_ENTRY_NONE
    }

    const media = detectMediaInText(raw)
    if (media) return media

    return markdownBody(raw)
  }

  if (commit.kind === "reasoning") {
    if (commit.phase === "start") {
      return RUN_ENTRY_NONE
    }

    if (commit.phase === "final") {
      return commit.interrupted ? textBody("reasoning interrupted") : RUN_ENTRY_NONE
    }

    return reasoningBody(raw)
  }

  return systemBody(raw, commit.phase)
}
