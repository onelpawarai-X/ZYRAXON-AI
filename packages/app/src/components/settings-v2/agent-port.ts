// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Agent portability — moving a custom agent between machines.
 *
 * An agent lives in the global config (`agent.<name>`), which is per-machine, so
 * until now a hand-tuned agent could not leave the computer that made it. This
 * module is the pure half of sharing one: it turns an agent into the text of a
 * `.zyraxon-agent.json` file and reads that text back, with no filesystem or
 * dialog involved so both directions can be tested directly.
 *
 * The file carries a `kind` and `version` so a future change to the shape can be
 * recognised instead of guessed at. Reading stays forgiving on purpose: a file
 * written by hand, or a fragment pasted straight out of a config, is accepted as
 * long as it names an agent.
 */

export type PortedAgent = {
  name: string
  description?: string
  mode: "primary" | "subagent" | "all"
  model?: string
  temperature?: number
  prompt?: string
}

export type PortedFile = {
  name: string
  agent: PortedAgent
}

const FORMAT = "zyraxon-agent"
const VERSION = 1
const MODES: ReadonlyArray<PortedAgent["mode"]> = ["primary", "subagent", "all"]

export function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** The file name an exported agent is offered under. */
export function agentFileName(agent: { name: string }) {
  return `${slugify(agent.name) || "agent"}.zyraxon-agent.json`
}

/** Serialise one agent as the text of a `.zyraxon-agent.json` file. */
export function toAgentFile(agent: PortedAgent) {
  const trimmed: PortedAgent = { name: slugify(agent.name) || agent.name, mode: agent.mode }
  if (agent.description) trimmed.description = agent.description
  if (agent.model) trimmed.model = agent.model
  if (typeof agent.temperature === "number") trimmed.temperature = agent.temperature
  if (agent.prompt) trimmed.prompt = agent.prompt

  return `${JSON.stringify({ kind: FORMAT, version: VERSION, agent: trimmed }, null, 2)}\n`
}

export type ParseResult = { ok: true; file: PortedFile } | { ok: false; error: string }

/**
 * Read the text of a file back into an agent.
 *
 * Accepts the exported wrapper, a bare `{ name, description, mode, prompt }`
 * object, or a one-entry `{ "<name>": { ... } }` config fragment, because those
 * are the three things a person actually has on hand when they want to import.
 */
export function parseAgentFile(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file is not valid JSON." }
  }
  if (!isRecord(raw)) return { ok: false, error: "That file does not contain an agent." }

  const wrapped = isRecord(raw.agent) ? raw.agent : raw
  const named = typeof wrapped.name === "string" ? wrapped : asConfigFragment(wrapped)
  if (!named) return { ok: false, error: "That file does not name an agent." }

  const name = slugify(String(named.name))
  if (!name) return { ok: false, error: "That agent has no usable name." }

  const mode = MODES.find((item) => item === named.mode) ?? "all"
  const agent: PortedAgent = { name, mode }
  if (typeof named.description === "string" && named.description.trim()) agent.description = named.description.trim()
  if (typeof named.prompt === "string" && named.prompt.trim()) agent.prompt = named.prompt.trim()
  if (typeof named.model === "string" && named.model.trim()) agent.model = named.model.trim()
  if (typeof named.temperature === "number") agent.temperature = named.temperature

  return { ok: true, file: { name, agent } }
}

/**
 * A config fragment keys the agent by its name instead of carrying a `name`
 * field, so the single entry becomes the agent. More than one entry is refused
 * rather than guessed at.
 */
function asConfigFragment(value: Record<string, unknown>): (Record<string, unknown> & { name: string }) | undefined {
  const keys = Object.keys(value)
  if (keys.length !== 1) return undefined
  const entry = value[keys[0]]
  if (!isRecord(entry)) return undefined
  return { ...entry, name: keys[0] }
}

/**
 * The exact shape the global config stores per agent. Export and import both
 * speak this shape, so a round trip through a file is lossless and the imported
 * entry is byte-for-byte what the CLI would have written.
 */
export type AgentConfigEntry = {
  description?: string
  mode?: "primary" | "subagent" | "all"
  model?: string
  temperature?: number
  prompt?: string
}

/**
 * Turn a parsed file into the config entry to store. The name becomes the key,
 * so it is not repeated inside the entry. Undefined optionals are dropped rather
 * than written as `null`, which keeps the config file clean and means a
 * re-export of an imported agent matches the original file.
 */
export function toConfigEntry(file: PortedFile): AgentConfigEntry {
  const entry: AgentConfigEntry = { mode: file.agent.mode }
  if (file.agent.description !== undefined) entry.description = file.agent.description
  if (file.agent.model !== undefined) entry.model = file.agent.model
  if (file.agent.temperature !== undefined) entry.temperature = file.agent.temperature
  if (file.agent.prompt !== undefined) entry.prompt = file.agent.prompt
  return entry
}

/**
 * Turn a stored config entry back into the portable agent an export writes. This
 * is the inverse of `toConfigEntry`, and the pair is what makes export → import
 * → export stable.
 */
export function fromConfigEntry(name: string, entry: AgentConfigEntry): PortedAgent {
  return {
    name,
    description: entry.description,
    mode: entry.mode ?? "all",
    model: entry.model,
    temperature: entry.temperature,
    prompt: entry.prompt,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Only a drag that carries files should arm the drop target. Dragging selected
 * text or a row around the panel also fires the drag events, and treating those
 * as an import attempt would show the drop hint for something that cannot be
 * dropped.
 */
export function isFileDrag(types: ReadonlyArray<string> | undefined) {
  return Array.isArray(types) && types.includes("Files")
}

/**
 * Save an agent to the user's downloads. The browser has no "save file" call, so
 * the file is handed over as a Blob behind an object URL and a synthetic link
 * click; the URL is released straight after, because the download has already
 * captured the bytes and holding it would leak for the life of the document.
 *
 * The document is a parameter so this can be driven by a test without a real
 * browser, and it is the only DOM the export path touches.
 */
export function downloadAgentFile(agent: PortedAgent, doc: Document = document) {
  const fileName = agentFileName(agent)
  const url = URL.createObjectURL(new Blob([toAgentFile(agent)], { type: "application/json" }))
  const anchor = doc.createElement("a")
  anchor.href = url
  anchor.download = fileName
  doc.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return fileName
}

/**
 * A drag crossing the panel fires `dragenter` on the way in and on every child
 * element it passes over, and a matching `dragleave` on each. Counting the
 * enters against the leaves is what keeps the highlight from flickering off
 * while the pointer is still inside; `leave` reports whether the drag has truly
 * left so the caller only clears the highlight on the last one.
 */
export function createDragTracker() {
  let depth = 0
  return {
    enter() {
      depth += 1
      return true
    },
    leave() {
      depth = Math.max(0, depth - 1)
      return depth === 0
    },
    reset() {
      depth = 0
    },
    get active() {
      return depth > 0
    },
  }
}
