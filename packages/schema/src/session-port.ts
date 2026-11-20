// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as SessionPort from "./session-port"

/**
 * A portable snapshot of one session: the session row plus every durable message
 * row it owns. Both are stored exactly as the database holds them so an import
 * can put the conversation back without a schema round trip, which is what makes
 * "the assistant remembers what we said" true rather than approximate.
 */
export const KIND = "zyraxon-session-port" as const
export const VERSION = 1 as const

export interface StoredSession {
  readonly id: string
  readonly project_id: string
  readonly parent_id?: string | null
  readonly title: string
  readonly agent?: string | null
  readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string } | null
  readonly cost: number
  readonly tokens_input: number
  readonly tokens_output: number
  readonly tokens_reasoning: number
  readonly tokens_cache_read: number
  readonly tokens_cache_write: number
  readonly time_created: number
  readonly time_updated: number
  readonly time_archived?: number | null
}

/** The bundle is a JSON document, so message bodies are typed as JSON. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

export interface StoredPart {
  readonly id: string
  readonly time_created: number
  readonly data: Json
}

export interface StoredMessage {
  readonly id: string
  readonly type: string
  readonly seq: number
  readonly time_created: number
  readonly data: Json
  readonly parts: ReadonlyArray<StoredPart>
}

export interface Bundle {
  readonly kind: typeof KIND
  readonly version: typeof VERSION
  readonly exportedAt: number
  readonly session: StoredSession
  readonly messages: ReadonlyArray<StoredMessage>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const asFinite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0)

/** Turn the remembered session row and message rows into the bytes that travel. */
export function buildBundle(input: {
  session: StoredSession
  messages: ReadonlyArray<StoredMessage>
  exportedAt?: number
}): Bundle {
  return {
    kind: KIND,
    version: VERSION,
    exportedAt: input.exportedAt ?? Date.now(),
    session: input.session,
    messages: [...input.messages].sort((a, b) => a.seq - b.seq),
  }
}

export function serializeBundle(bundle: Bundle): string {
  return JSON.stringify(bundle, null, 2)
}

export type ParseResult =
  | { readonly ok: true; readonly bundle: Bundle }
  | { readonly ok: false; readonly reason: string }

/**
 * Read a dropped file without trusting it. The panel is the only entry point, so
 * anything that is not clearly one of our bundles is refused with a reason the
 * toast can show instead of a stack trace.
 */
export function parseBundle(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: "not-json" }
  }
  if (!isRecord(raw)) return { ok: false, reason: "not-object" }
  if (raw.kind !== KIND) return { ok: false, reason: "wrong-kind" }
  if (raw.version !== VERSION) return { ok: false, reason: "wrong-version" }

  const session = raw.session
  if (!isRecord(session) || typeof session.id !== "string" || typeof session.project_id !== "string") {
    return { ok: false, reason: "bad-session" }
  }
  if (!Array.isArray(raw.messages)) return { ok: false, reason: "bad-messages" }

  const messages: StoredMessage[] = []
  for (const item of raw.messages) {
    if (!isRecord(item)) return { ok: false, reason: "bad-message" }
    if (typeof item.id !== "string" || typeof item.type !== "string") return { ok: false, reason: "bad-message" }
    if (!isRecord(item.data)) return { ok: false, reason: "bad-message-data" }
    const parts: StoredPart[] = []
    if (item.parts !== undefined) {
      if (!Array.isArray(item.parts)) return { ok: false, reason: "bad-message-parts" }
      for (const entry of item.parts) {
        if (!isRecord(entry) || typeof entry.id !== "string" || !isRecord(entry.data)) {
          return { ok: false, reason: "bad-part" }
        }
        parts.push({
          id: entry.id,
          time_created: asFinite(entry.time_created),
          data: entry.data as Json,
        })
      }
    }
    messages.push({
      id: item.id,
      type: item.type,
      seq: asFinite(item.seq),
      time_created: asFinite(item.time_created),
      data: item.data as Json,
      parts,
    })
  }

  const stored: StoredSession = {
    id: session.id,
    project_id: session.project_id,
    parent_id: typeof session.parent_id === "string" ? session.parent_id : null,
    title: typeof session.title === "string" ? session.title : "Imported session",
    agent: typeof session.agent === "string" ? session.agent : null,
    model: isRecord(session.model)
      ? {
          id: String(session.model.id),
          providerID: String(session.model.providerID),
          variant: typeof session.model.variant === "string" ? session.model.variant : undefined,
        }
      : null,
    cost: asFinite(session.cost),
    tokens_input: asFinite(session.tokens_input),
    tokens_output: asFinite(session.tokens_output),
    tokens_reasoning: asFinite(session.tokens_reasoning),
    tokens_cache_read: asFinite(session.tokens_cache_read),
    tokens_cache_write: asFinite(session.tokens_cache_write),
    time_created: asFinite(session.time_created),
    time_updated: asFinite(session.time_updated),
    time_archived: typeof session.time_archived === "number" ? session.time_archived : null,
  }

  return {
    ok: true,
    bundle: {
      kind: KIND,
      version: VERSION,
      exportedAt: asFinite(raw.exportedAt),
      session: stored,
      messages,
    },
  }
}

/**
 * Rewrite every string that is one of the ids in `map`. A conversation is
 * restored into a fresh session with fresh message ids, so the ids embedded in
 * parts and tool calls have to follow their rows, otherwise references inside the
 * conversation would point at messages that no longer exist.
 */
export function remapIds(value: unknown, map: Readonly<Record<string, string>>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapIds(item, map))
  if (!isRecord(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = typeof item === "string" && map[item] !== undefined ? map[item] : remapIds(item, map)
  }
  return out
}

/**
 * Convenience for the session id alone: the case the panel and the tests care
 * about most. Everything else goes through `remapIds`.
 */
export function resession(value: unknown, from: string, to: string): unknown {
  return remapIds(value, { [from]: to })
}

export function bundleFileName(session: { id: string; title?: string }): string {
  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
  const name = slugify((session.title ?? "").trim()) || slugify(session.id) || "session"
  return `${name}.zyraxon-session.json`
}
