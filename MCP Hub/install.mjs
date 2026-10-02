#!/usr/bin/env node
// One-command install for MCP Hub.
//
//   node "MCP Hub/install.mjs"
//
// Writes the plugin entry into the user's own ZYRAXON config so the
// "MCP Connect" button appears on the home page. No source file in the
// repository is modified - only the user's config, which is exactly what the
// config-based route is for.

import { readFile, writeFile, mkdir, access } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const CONFIG_DIR = join(homedir(), ".config", "zyraxon")
const CONFIG_FILE = join(CONFIG_DIR, "zyraxon.jsonc")
const GLOBAL_AGENTS = join(CONFIG_DIR, "AGENTS.md")

/** strip // comments and trailing commas so JSON.parse can read a jsonc file */
function parseJsonc(text) {
  const noComments = text.replace(/^\s*\/\/.*$/gm, "")
  const noTrailing = noComments.replace(/,(\s*[}\]])/g, "$1")
  return JSON.parse(noTrailing)
}

function pluginPath() {
  // file URL so the loader treats it as a local plugin
  const abs = resolve(HERE, "plugin.ts")
  return "file://" + abs.split("/").map(encodeURIComponent).join("/")
}

async function readConfig() {
  try {
    await access(CONFIG_FILE)
    return parseJsonc(await readFile(CONFIG_FILE, "utf8"))
  } catch {
    return {}
  }
}

async function main() {
  console.log("MCP Hub installer")
  console.log("=================")

  await mkdir(CONFIG_DIR, { recursive: true })
  const config = await readConfig()
  const entry = pluginPath()

  config.plugin = Array.isArray(config.plugin) ? config.plugin : []
  if (!config.plugin.includes(entry)) {
    config.plugin.push(entry)
    console.log(`registered plugin: ${entry}`)
  } else {
    console.log("plugin already registered")
  }

  // keep a written record next to the config so the agent knows the feature exists
  const note = [
    "",
    "## MCP Hub",
    "",
    "MCP Connect is installed. The home page shows an MCP Connect button that",
    "lists every connectable app; clicking one opens that app's own consent page",
    "in the browser, and after Allow the token is stored and its tools are handed",
    "to the agent at runtime.",
    "",
    `Plugin entry: ${entry}`,
    "Catalog: 17 curated apps, plus 9,580 servers from the official MCP registry.",
    "",
  ].join("\n")
  try {
    const existing = await readFile(GLOBAL_AGENTS, "utf8")
    if (!existing.includes("## MCP Hub")) await writeFile(GLOBAL_AGENTS, existing + note)
  } catch {
    await writeFile(GLOBAL_AGENTS, note.trimStart())
  }

  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n")
  console.log(`wrote ${CONFIG_FILE}`)
  console.log(`wrote ${GLOBAL_AGENTS}`)
  console.log("\nRestart ZYRAXON and the MCP Connect button will be on the home page.")
}

main()
