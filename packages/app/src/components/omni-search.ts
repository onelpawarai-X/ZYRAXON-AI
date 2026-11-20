// Copyright (c) 2026 onelpawarai. All rights reserved.
// ZYRAXON Omniscient Search — symbols, content matches, web and ask entries
// that plug into the existing command palette entries.

import { getDirectory, getFilename } from "@zyraxon-ai/core/util/path"
import type { CommandPaletteEntry } from "@/components/command-palette"

export function uriToPath(uri: string) {
  if (!uri.startsWith("file://")) return uri
  try {
    let path = decodeURIComponent(uri.slice("file://".length))
    // Windows drive letters arrive as /C:/foo — normalize to C:/foo.
    if (/^\/[A-Za-z]:[\\/]/.test(path)) path = path.slice(1)
    return path
  } catch {
    return uri
  }
}

const SYMBOL_KIND: Record<number, string> = {
  5: "class",
  6: "method",
  7: "property",
  9: "constructor",
  10: "enum",
  11: "interface",
  12: "function",
  13: "variable",
  14: "constant",
  23: "struct",
  22: "enum member",
  26: "type parameter",
}

export type ServerSymbol = {
  name: string
  kind: number
  location: { uri: string; range: { start: { line: number } } }
}

export type ServerTextMatch = {
  path?: string
  lines?: { text?: string } | string
  line_number?: number
  line?: number
  absolute_offset?: number
}

export type FindClient = {
  find: {
    symbols: (args: { query: string }, options?: { signal?: AbortSignal }) => Promise<{ data?: ServerSymbol[] }>
    text: (args: { pattern: string }, options?: { signal?: AbortSignal }) => Promise<{ data?: unknown }>
  }
}

export async function fetchOmniSymbols(
  client: FindClient,
  query: string,
  category: string,
  limit = 6,
  signal?: AbortSignal,
): Promise<CommandPaletteEntry[]> {
  try {
    const result = await client.find.symbols({ query }, { signal })
    return (result.data ?? []).slice(0, limit).map((symbol) => {
      const path = uriToPath(symbol.location.uri)
      const kind = SYMBOL_KIND[symbol.kind] ?? "symbol"
      return {
        id: `symbol:${symbol.location.uri}:${symbol.location.range.start.line}`,
        type: "symbol" as const,
        title: symbol.name,
        description: `${kind} · ${getDirectory(path)}`,
        category,
        path,
      }
    })
  } catch {
    return []
  }
}

export async function fetchOmniTextMatches(
  client: FindClient,
  query: string,
  category: string,
  limit = 4,
  signal?: AbortSignal,
): Promise<CommandPaletteEntry[]> {
  try {
    const result = await client.find.text({ pattern: query }, { signal })
    const raw = Array.isArray(result.data) ? (result.data as ServerTextMatch[]) : []
    const entries: CommandPaletteEntry[] = []
    for (const match of raw) {
      const entry = toTextEntry(match, category)
      if (!entry) continue
      entries.push(entry)
      if (entries.length >= limit) break
    }
    return entries
  } catch {
    return []
  }
}

function toTextEntry(match: ServerTextMatch, category: string): CommandPaletteEntry | undefined {
  const path = typeof match.path === "string" && match.path.length > 0 ? match.path : undefined
  if (!path) return undefined
  const line =
    typeof match.line_number === "number" ? match.line_number : typeof match.line === "number" ? match.line : undefined
  const raw = typeof match.lines === "string" ? match.lines : match.lines?.text
  const snippet = raw?.split("\n")[0]?.trim().slice(0, 160) || undefined
  return {
    id: `text:${path}:${line ?? 0}:${snippet ?? ""}`.slice(0, 240),
    type: "text",
    title: `${getFilename(path)}${line ? `:${line}` : ""}`,
    description: snippet,
    category,
    path,
  }
}
