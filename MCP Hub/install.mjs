#!/usr/bin/env node
// One-command install for MCP Hub.
//
//   node "MCP Hub/install.mjs"              install
//   node "MCP Hub/install.mjs" --uninstall  remove it again
//
// Writes the plugin entry into the user's own ZYRAXON config so the "MCP Connect"
// button appears on the home page. No source file in the repository is touched — only
// the user's config, which is exactly what the config-based plugin route is for.
//
// The config is edited as text rather than parsed and re-serialised. `zyraxon.jsonc` is
// full of comments, and the previous version of this installer round-tripped it through
// JSON.stringify, which silently deleted every one of them along with the formatting
// the user had chosen. A file people hand-edit deserves to come back the way it went in.

import { readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))

export const CONFIG_DIR = join(homedir(), ".config", "zyraxon")
export const CONFIG_FILE = join(CONFIG_DIR, "zyraxon.jsonc")
export const GLOBAL_AGENTS = join(CONFIG_DIR, "AGENTS.md")

/**
 * The plugin entry as the loader wants it: a file URL, so it counts as a local plugin.
 *
 * The encoding here is load-bearing on Windows. Percent-encoding the drive letter's colon
 * and losing a slash produced `file://C%3A/Users/...`, which is not a URL anything can
 * resolve — the button simply never appeared, with no error anywhere to point at it.
 */
export function pluginPath(from = HERE) {
  const abs = resolve(from, "plugin.ts").replace(/\\/g, "/")
  const segments = abs.split("/").map((part, index) =>
    index === 0 && /^[a-zA-Z]:$/.test(part) ? part : encodeURIComponent(part),
  )
  const path = segments.join("/")

  // `\\server\share` on Windows is already a host in a URL.
  if (abs.startsWith("//")) return "file:" + path.replace(/^\/+/, "")
  return "file://" + (abs.startsWith("/") ? "" : "/") + path
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Put the entry into an existing `plugin` array, or add the array if there is none. */
export function withPluginEntry(text, entry) {
  if (text.includes(entry)) return text

  const quoted = JSON.stringify(entry)
  const key = /^[ \t]*"plugin"[ \t]*:/m.exec(text)

  if (key) {
    const open = text.indexOf("[", key.index + key[0].length)
    const close = open === -1 ? -1 : text.indexOf("]", open)

    if (open !== -1 && close !== -1) {
      const inside = text.slice(open + 1, close)
      const itemIndent = /^[ \t]*(?=["'])/m.exec(inside)?.[0] ?? "    "

      // No comma here: an array that was empty must not end up with a dangling one.
      if (inside.trim() === "") return `${text.slice(0, open + 1)}\n${itemIndent}${quoted}\n${text.slice(close)}`

      // Append after the final item, and hand the closing bracket its own indent back.
      // Trimming the tail before appending swallowed the bracket's indentation and left
      // `]` sitting in column zero.
      const newline = inside.lastIndexOf("\n")
      const bracketIndent = newline === -1 ? "" : inside.slice(newline + 1)
      return `${text.slice(0, open + 1)}${inside.trimEnd()},\n${itemIndent}${quoted}\n${bracketIndent}${text.slice(close)}`
    }
  }

  const brace = text.indexOf("{")
  if (brace === -1) return `{ "plugin": [${quoted}] }\n`

  const head = text.slice(0, brace + 1)
  const tail = text.slice(brace + 1)
  const indent = /\n([ \t]+)\S/.exec(tail)?.[1] ?? "  "

  // `{}` must not end up with a trailing comma, which is not JSON.
  if (/^\s*\}/.test(tail)) return `${head}\n${indent}"plugin": [${quoted}]\n${tail.trimStart()}`
  return `${head}\n${indent}"plugin": [${quoted}],${tail}`
}

/** Remove the "## MCP Hub" section, wherever it sits and whatever follows it. */
export function stripHubSection(text) {
  const start = text.search(/^## MCP Hub[ \t]*$/m)
  if (start === -1) return text

  const rest = text.slice(start)
  const next = rest.slice(1).search(/^## (?!MCP Hub)/m)

  if (next === -1) return text.slice(0, start).replace(/\s+$/, "")
  return text.slice(0, start).replace(/\s+$/, "\n\n") + rest.slice(next + 1)
}

/** Take the entry back out, and drop the key with it if nothing else is in the array. */
export function withoutPluginEntry(text, entry) {
  if (!text.includes(entry)) return text

  const quoted = escapeForRegExp(JSON.stringify(entry))
  const without = text.replace(new RegExp(`^[ \\t]*${quoted}[ \\t]*,?[ \\t]*\\r?\\n`, "m"), "")
  if (without === text) return text

  // Taking out the last entry leaves the one before it with a dangling comma, and a comma
  // directly before a closing bracket or brace is not valid JSON. jsonc readers shrug at
  // it; JSON.parse refuses the file outright.
  const cleaned = without.replace(/,(\s*[}\]])/g, "$1")

  if (!/"plugin"[ \t]*:[ \t]*\[\s*\]/.test(cleaned)) return cleaned
  // `\s*` and not `[ \t]*` between the brackets: an array left empty by the removal above
  // still spans the line break that used to hold its last item.
  return cleaned.replace(/^[ \t]*"plugin"[ \t]*:[ \t]*\[\s*\][ \t]*,?[ \t]*\r?\n?/m, "")
}

async function readIfPresent(path) {
  try {
    return await readFile(path, "utf8")
  } catch {
    return undefined
  }
}

/**
 * How many apps the catalog holds, counted from the catalog itself.
 *
 * The installer used to write a hardcoded count into the note beside the config, and it
 * was wrong the moment the catalog changed. Counting here means the number cannot go
 * stale.
 */
async function catalogCounts() {
  const seed = (await readIfPresent(join(HERE, "catalog", "seed.ts"))) ?? ""
  const local = (seed.match(/^\s*\{\s*id:\s*"[^"]+"[^\n]*kind:\s*"local"/gm) ?? []).length
  const total = (seed.match(/^\s*\{\s*id:\s*"/gm) ?? []).length
  return { total, remote: total - local, local }
}

/** Keep a written record beside the config, so the agent knows the feature exists. */
async function writeNote(lines) {
  const body = lines.join("\n")
  const existing = await readIfPresent(GLOBAL_AGENTS)

  if (existing === undefined) {
    await writeFile(GLOBAL_AGENTS, body.trimStart(), "utf8")
    return
  }

  // Rewritten rather than skipped when it already exists. Skipping left the previous
  // count sitting in the file forever, which is how "83 apps" outlived 83 apps.
  await writeFile(GLOBAL_AGENTS, stripHubSection(existing) + body, "utf8")
}

export async function install() {
  const entry = pluginPath()

  if (!(await readIfPresent(join(HERE, "plugin.ts")))) {
    console.error(`Cannot install: ${join(HERE, "plugin.ts")} is missing. Run this from inside the MCP Hub folder.`)
    process.exitCode = 1
    return
  }

  const existing = await readIfPresent(CONFIG_FILE)
  const updated = withPluginEntry(existing ?? "{}\n", entry)

  if (existing === updated) console.log("plugin already registered")
  else {
    await writeFile(CONFIG_FILE, updated, "utf8")
    console.log(`registered plugin in ${CONFIG_FILE}`)
  }

  const { total, remote, local } = await catalogCounts()
  await writeNote([
    "",
    "## MCP Hub",
    "",
    "MCP Connect is installed. The home page shows an MCP Connect button that lists every",
    "connectable app in order of what it asks of you: browser sign-in first, then apps",
    "that want an API key, then apps that need nothing at all. Clicking one opens that",
    "app's own consent page in your real browser profile, so you stay signed in, and once",
    "you allow it the tools are handed to the agent at runtime.",
    "",
    `Plugin entry: ${entry}`,
    `Catalog: ${total} apps — ${remote} remote endpoints, ${local} local servers.`,
    "",
  ])

  console.log(`plugin: ${entry}`)
  console.log(`catalog: ${total} apps (${remote} remote, ${local} local)`)
  console.log("Restart ZYRAXON and the MCP Connect button will be on the home page.")
}

export async function uninstall() {
  const entry = pluginPath()
  const existing = await readIfPresent(CONFIG_FILE)

  if (existing) {
    const updated = withoutPluginEntry(existing, entry)
    if (updated === existing) console.log("plugin was not registered")
    else {
      await writeFile(CONFIG_FILE, updated, "utf8")
      console.log(`removed the plugin entry from ${CONFIG_FILE}`)
    }
  }

  const agents = await readIfPresent(GLOBAL_AGENTS)
  if (agents) {
    const updated = stripHubSection(agents)
    if (updated === agents) console.log("no MCP Hub note to remove")
    else {
      await writeFile(GLOBAL_AGENTS, updated.endsWith("\n") ? updated : updated + "\n", "utf8")
      console.log(`removed the MCP Hub note from ${GLOBAL_AGENTS}`)
    }
  }

  console.log("Restart ZYRAXON and the button will be gone.")
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await (process.argv.slice(2).includes("--uninstall") ? uninstall() : install())
}