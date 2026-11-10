// Copyright (c) 2026 onelpawarai. All rights reserved.

import { onMount } from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"
import type { PromptInputV2Attachment, PromptInputV2Prompt } from "./types"

const accepted = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  // Providers that advertise `audio` and `video` in their model's input list can
  // read these directly. They were missing here, so a model that showed
  // "audio, video" in its capabilities still refused the file at the picker.
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/m4a",
  "audio/amr",
  "audio/3gpp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
  "video/mpeg",
  "video/ogg",
  "video/3gpp",
  "video/x-flv",
  "audio/*",
  "video/*",
  "text/*",
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
  ".c",
  ".cc",
  ".cjs",
  ".conf",
  ".cpp",
  ".css",
  ".csv",
  ".cts",
  ".env",
  ".go",
  ".gql",
  ".graphql",
  ".h",
  ".hh",
  ".hpp",
  ".htm",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".py",
  ".rb",
  ".rs",
  ".sass",
  ".scss",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
]

type PromptTarget = {
  current: () => PromptInputV2Prompt
  cursor: () => number | undefined
  set: (prompt: PromptInputV2Prompt, cursor?: number) => void
}

export type PromptInputV2AttachmentConfig = {
  picker?: (
    options: { defaultPath?: string; multiple?: boolean; accept?: string[] },
    onFile: (file: File) => Promise<unknown>,
  ) => Promise<void>
  directory: () => string
  isDialogActive: () => boolean
  warn: () => void
  onError: (error: unknown) => void
  readClipboardImage?: () => Promise<File | null>
  getPathForFile?: (file: File) => string
}

export function createPromptInputV2Attachments(
  input: PromptInputV2AttachmentConfig & {
    capture: () => PromptTarget
    editor: () => HTMLElement | undefined
    focusEditor: () => void
    addPart: (part: PromptInputV2Prompt[number]) => boolean
    setDraggingType: (type: "image" | "@mention" | null) => void
  },
) {
  const capture = () => {
    const prompt = input.capture()
    const editor = input.editor()
    if (!editor) return
    return { prompt, cursor: prompt.cursor() ?? cursorPosition(editor) }
  }
  const add = async (file: File, toast = true, target = capture()) => {
    if (!target) return false
    const mime = await attachmentMime(file)
    if (!mime) {
      if (toast) input.warn()
      return false
    }
    const url = await dataUrl(file, mime)
    if (!url) return false
    const attachment: PromptInputV2Attachment = {
      // The renderer branches on this. Hardcoding "image" made every attachment
      // draw an <img>, so an mp4 or mp3 was accepted and then displayed as a
      // broken image, and the composer had no way to show it as media.
      type: mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "image",
      id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2),
      filename: file.name,
      sourcePath: input.getPathForFile?.(file) || undefined,
      mime,
      dataUrl: url,
    }
    target.prompt.set([...target.prompt.current(), attachment], target.cursor)
    return true
  }
  const addAttachments = async (files: File[], toast = true, target = capture()) => {
    const found = await files.reduce(async (result, file) => {
      const previous = await result
      return (await add(file, false, target)) || previous
    }, Promise.resolve(false))
    if (!found && files.length > 0 && toast) input.warn()
    return found
  }
  const handlePaste = async (event: ClipboardEvent) => {
    const clipboardData = event.clipboardData
    if (!clipboardData) return
    const target = capture()
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    const files = Array.from(clipboardData.items).flatMap((item) => {
      if (item.kind !== "file") return []
      const file = item.getAsFile()
      return file ? [file] : []
    })
    if (files.length > 0) {
      await addAttachments(files, true, target)
      return
    }
    const plainText = clipboardData.getData("text/plain") ?? ""
    if (input.readClipboardImage && !plainText) {
      const file = await input.readClipboardImage()
      if (file && (await add(file, true, target))) return
    }
    if (!plainText) return
    const text = plainText.includes("\r") ? plainText.replace(/\r\n?/g, "\n") : plainText
    const put = () => {
      if (input.addPart({ type: "text", content: text, start: 0, end: 0 })) return true
      input.focusEditor()
      return input.addPart({ type: "text", content: text, start: 0, end: 0 })
    }
    if (text.includes("\n") || largePaste(text)) {
      put()
      return
    }
    if (typeof document.execCommand === "function" && document.execCommand("insertText", false, text)) return
    put()
  }
  const handleDrop = async (event: DragEvent) => {
    if (input.isDialogActive()) return
    event.preventDefault()
    input.setDraggingType(null)
    const plainText = event.dataTransfer?.getData("text/plain")
    if (plainText?.startsWith("file:")) {
      const path = plainText.slice("file:".length)
      input.focusEditor()
      input.addPart({ type: "file", path, content: `@${path}`, start: 0, end: 0 })
      return
    }
    const files = event.dataTransfer?.files
    if (files) await addAttachments(Array.from(files))
  }

  onMount(() => {
    makeEventListener(document, "dragover", (event) => {
      if (input.isDialogActive()) return
      event.preventDefault()
      if (event.dataTransfer?.types.includes("Files")) input.setDraggingType("image")
      else if (event.dataTransfer?.types.includes("text/plain")) input.setDraggingType("@mention")
    })
    makeEventListener(document, "dragleave", (event) => {
      if (!input.isDialogActive() && !event.relatedTarget) input.setDraggingType(null)
    })
    makeEventListener(document, "drop", handleDrop)
  })

  return {
    addAttachments,
    handlePaste,
    handleDrop,
    pick(fallback: () => void) {
      if (!input.picker) {
        fallback()
        return
      }
      void input
        .picker({ defaultPath: input.directory(), multiple: true, accept: accepted }, (file) => add(file))
        .catch(input.onError)
    },
  }
}

function dataUrl(file: File, mime: string) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.addEventListener("error", () => resolve(""))
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : ""
      const index = value.indexOf(",")
      resolve(index === -1 ? value : `data:${mime};base64,${value.slice(index + 1)}`)
    })
    reader.readAsDataURL(file)
  })
}

const imageMimes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])
const imageExtensions = new Map([
  ["gif", "image/gif"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
])

/**
 * Audio and video pass through with their real MIME type.
 *
 * Anything that is not text has to be reported truthfully, because the model
 * decides what to do with it from this string: `read` cannot parse an mp3, so a
 * clip mislabelled as text/plain looks readable and comes back as mojibake.
 */
const audioExtensions = new Map([
  ["aac", "audio/aac"],
  ["aiff", "audio/aiff"],
  ["amr", "audio/amr"],
  ["flac", "audio/flac"],
  ["m4a", "audio/mp4"],
  ["mid", "audio/midi"],
  ["midi", "audio/midi"],
  ["mp3", "audio/mpeg"],
  ["oga", "audio/ogg"],
  ["ogg", "audio/ogg"],
  ["opus", "audio/opus"],
  ["wav", "audio/wav"],
  ["weba", "audio/webm"],
])
const videoExtensions = new Map([
  ["3gp", "video/3gpp"],
  ["avi", "video/x-msvideo"],
  ["flv", "video/x-flv"],
  ["m4v", "video/mp4"],
  ["mkv", "video/x-matroska"],
  ["mov", "video/quicktime"],
  ["mp4", "video/mp4"],
  ["mpeg", "video/mpeg"],
  ["mpg", "video/mpeg"],
  ["ogv", "video/ogg"],
  ["webm", "video/webm"],
])

const mediaMimes = new Set([
  ...audioExtensions.values(),
  ...videoExtensions.values(),
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/m4a",
  "audio/amr",
  "audio/3gpp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
  "video/mpeg",
  "video/ogg",
  "video/3gpp",
  "video/x-flv",
])

const textMimes = new Set([
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
])

async function attachmentMime(file: File) {
  const type = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? ""
  if (imageMimes.has(type) || type === "application/pdf") return type
  const index = file.name.lastIndexOf(".")
  const suffix = index === -1 ? "" : file.name.slice(index + 1).toLowerCase()
  // A media file with no usable type still has an extension, and Windows hands
  // plenty of them over as application/octet-stream. The byte sniff below would
  // reject those outright, so resolve the extension first.
  const byExtension =
    imageExtensions.get(suffix) ??
    (suffix === "pdf" ? "application/pdf" : undefined) ??
    audioExtensions.get(suffix) ??
    videoExtensions.get(suffix)
  if ((!type || type === "application/octet-stream") && byExtension) return byExtension
  if (type.startsWith("audio/") || type.startsWith("video/")) return type
  if (mediaMimes.has(type)) return type
  if (type.startsWith("text/") || textMimes.has(type) || type.endsWith("+json") || type.endsWith("+xml")) {
    return "text/plain"
  }
  const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer())
  if (bytes.some((byte) => byte === 0)) return
  const control = bytes.filter((byte) => byte < 9 || (byte > 13 && byte < 32)).length
  if (bytes.length > 0 && control / bytes.length > 0.3) return
  return "text/plain"
}

function cursorPosition(editor: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer)) return 0
  const before = range.cloneRange()
  before.selectNodeContents(editor)
  before.setEnd(range.startContainer, range.startOffset)
  return before.toString().replace(/\u200B/g, "").length
}

function largePaste(text: string) {
  if (text.length >= 8000) return true
  return text.split("\n").length - 1 >= 120
}
