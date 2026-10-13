// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as AutomationMcpObserve from "./mcp-observe"

import type { Client } from "@modelcontextprotocol/sdk/client/index.js"
import type { RawObservation } from "./types"
import type { WatchSpec } from "./watch-specs"

function at(source: unknown, path: string): unknown {
  if (!path) return source
  let current: unknown = source
  for (const part of path.split(".")) {
    if (current === null || current === undefined) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return undefined
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const parsed = asString(value)
  if (parsed === undefined) return undefined
  const numeric = Number(parsed)
  if (Number.isFinite(numeric)) return numeric
  const date = Date.parse(parsed)
  return Number.isFinite(date) ? date : undefined
}

/**
 * MCP tool results wrap their payload in `content` blocks; hosted servers almost always
 * return a single JSON text block. Decode that shape first, then fall back to the raw object
 * so structured results (or a server that returns an object directly) still work.
 */
export function decodeToolResult(result: unknown): unknown {
  if (result === null || result === undefined) return undefined
  const content = (result as { content?: unknown }).content
  if (Array.isArray(content)) {
    const texts = content
      .map((block) => (block && typeof block === "object" ? asString((block as { text?: unknown }).text) : undefined))
      .filter((text): text is string => typeof text === "string")
    if (texts.length === 1) {
      try {
        return JSON.parse(texts[0]!)
      } catch {
        return { text: texts[0] }
      }
    }
    if (texts.length > 1) {
      return texts.map((text) => {
        try {
          return JSON.parse(text)
        } catch {
          return text
        }
      })
    }
  }
  if ((result as { structuredContent?: unknown }).structuredContent !== undefined) {
    return (result as { structuredContent?: unknown }).structuredContent
  }
  return result
}

/**
 * Turn one tool result into events using a spec. Items that cannot be keyed are dropped
 * rather than stored with a fabricated id, because a bad id would defeat dedupe.
 */
export function toObservations(
  connectorID: string,
  spec: WatchSpec,
  result: unknown,
  accountID?: string,
): RawObservation[] {
  const decoded = decodeToolResult(result)
  const container = spec.itemsPath ? at(decoded, spec.itemsPath) : decoded
  const items: unknown[] = Array.isArray(container)
    ? container
    : Array.isArray((decoded as { items?: unknown })?.items)
      ? ((decoded as { items: unknown[] }).items as unknown[])
      : container && typeof container === "object"
        ? Object.values(container as Record<string, unknown>).find(Array.isArray) ?? []
        : []
  const observations: RawObservation[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const externalID = asString(at(item, spec.map.externalID))
    if (!externalID) continue
    const title = asString(at(item, spec.map.title)) ?? `${spec.label} update`
    const receivedAt = asNumber(at(item, spec.map.receivedAt)) ?? Date.now()
    observations.push({
      externalID,
      kind: asString(at(item, spec.map.kind)) ?? "event",
      title,
      body: spec.map.body ? asString(at(item, spec.map.body)) : undefined,
      url: spec.map.url ? asString(at(item, spec.map.url)) : undefined,
      author: spec.map.author ? asString(at(item, spec.map.author)) : undefined,
      receivedAt,
      metadata: { connectorID, accountID, source: spec.label },
    })
  }
  return observations
}

/** Ask a connected MCP server which of a spec's candidate tools it actually exposes. */
export async function resolveTool(client: Client, candidates: ReadonlyArray<string>): Promise<string | undefined> {
  const listed = await client.listTools()
  const names = listed.tools.map((tool) => tool.name)
  for (const candidate of candidates) {
    if (names.includes(candidate)) return candidate
  }
  return undefined
}

export async function listToolNames(client: Client): Promise<string[]> {
  const listed = await client.listTools()
  return listed.tools.map((tool) => tool.name)
}
