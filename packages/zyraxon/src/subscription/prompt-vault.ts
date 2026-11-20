// Copyright (c) 2026 onelpawarai. All rights reserved.

import { readSubState } from "./canonical"

/** The system prompts live on the ZYRAXON server, not in this binary. A static
 *  copy of the installed app therefore carries no prompt text at all: extracting
 *  the bundle, the asar, or the compiled executable yields nothing, because the
 *  text was never shipped. It is fetched over HTTPS when the agent needs it,
 *  gated by the caller's licence code.
 *
 *  Only the fetch result is held, and only in memory. Nothing is written to
 *  disk, so a cache scrape after a run finds no prompt either. */

/** Read per call rather than at import time. Bun's test runner shares one module
 *  cache across every file in a run, so a URL captured at import time is frozen
 *  to whatever the first importer saw — which made the vault test hit the real
 *  server whenever another test loaded this module first. Reading the environment
 *  at the call site keeps the client pointed at whatever the current process
 *  actually configured, and is also what lets a licence change repoint it. */
function vaultUrl(): string {
  return (
    (process.env.ZYRAXON_PROMPT_VAULT_URL || "").trim() ||
    "https://zyraxonai.lovable.app/api/public/agent/prompts"
  )
}

/** Optional shared key. A shipped key is not a secret — it is a speed bump that
 *  stops a random internet caller from reading the catalogue without running the
 *  app. The real gate is the licence code, resolved on the server. */
function sharedKey(): string {
  return (process.env.ZYRAXON_PROMPT_KEY || "").trim()
}

const TIMEOUT_MS = 8_000

/** Marks a string that names a prompt on the server rather than carrying its
 *  text. Format: `@vault:<group>:<key>`. */
export const VAULT_PREFIX = "@vault:"

export type Group = "mode" | "provider" | "reminder" | "utility"

/** The reference an agent or reminder carries instead of prompt text. */
export function ref(group: Group, key: string): string {
  return `${VAULT_PREFIX}${group}:${key}`
}

/** True when a prompt string is a server reference rather than literal text. */
export function isRef(prompt: string | undefined): prompt is string {
  return typeof prompt === "string" && prompt.startsWith(VAULT_PREFIX)
}

/** The group and key a reference points at, or `undefined` when it is literal. */
export function parseRef(prompt: string | undefined): { group: string; key: string } | undefined {
  if (!isRef(prompt)) return undefined
  const rest = prompt.slice(VAULT_PREFIX.length)
  const colon = rest.indexOf(":")
  if (colon <= 0) return undefined
  return { group: rest.slice(0, colon), key: rest.slice(colon + 1) }
}

const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string | undefined>>()

function headers(): Record<string, string> {
  const head: Record<string, string> = { accept: "application/json" }
  const key = sharedKey()
  if (key) head["x-zyraxon-key"] = key
  const code = readSubState().secretCode
  if (code) head["x-zyraxon-code"] = code
  return head
}

async function request(group: string, key: string): Promise<string | undefined> {
  try {
    const url = `${vaultUrl()}?group=${encodeURIComponent(group)}&key=${encodeURIComponent(key)}`
    const response = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return undefined
    const data = (await response.json()) as { prompt?: unknown }
    return typeof data.prompt === "string" && data.prompt ? data.prompt : undefined
  } catch {
    // An unreachable vault is not a licence to invent a prompt. The caller falls
    // back to whatever it can do without the text, and retries on the next turn.
    return undefined
  }
}

/** The prompt for a group/key, from memory when warm. Concurrent callers share
 *  one request. A miss is not cached, so a later turn retries. */
export async function get(group: string, key: string): Promise<string | undefined> {
  const id = `${group}:${key}`
  const known = cache.get(id)
  if (known) return known
  const running = inflight.get(id)
  if (running) return running
  const task = request(group, key).then((text) => {
    if (text) cache.set(id, text)
    inflight.delete(id)
    return text
  })
  inflight.set(id, task)
  return task
}

/** Resolve a string that may be a reference: a reference is fetched, literal
 *  text is returned unchanged. An unresolvable reference yields `undefined`. */
export async function resolve(prompt: string | undefined): Promise<string | undefined> {
  const parsed = parseRef(prompt)
  if (!parsed) return prompt
  return get(parsed.group, parsed.key)
}

/** Best-effort warm of the references this build may need, so the first turn
 *  already has its prompt. A failure is silent and retried on use. */
export async function warm(refs: readonly string[]): Promise<void> {
  await Promise.all(
    refs.map((value) => {
      const parsed = parseRef(value)
      return parsed ? get(parsed.group, parsed.key) : Promise.resolve(undefined)
    }),
  )
}

/** Drop everything. Used by tests and by a licence change, where a different
 *  code must not keep reading prompts it no longer unlocks. */
export function clear(): void {
  cache.clear()
  inflight.clear()
}

export * as PromptVault from "./prompt-vault"
