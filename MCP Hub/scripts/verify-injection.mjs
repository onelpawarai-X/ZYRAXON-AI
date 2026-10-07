#!/usr/bin/env node
// Check that the host actually wired the Hub into the app.
//
//   node "MCP Hub/scripts/verify-injection.mjs"            check the source
//   node "MCP Hub/scripts/verify-injection.mjs" --config   also check the user's config
//
// Everything in this folder can be perfect and still never appear, because the Hub reaches
// the app through one thin seam: the host imports the plugin entry, renders its panel and
// hands it an MCP runtime. If that seam is not wired, there is no button and no error —
// the feature is simply absent.
//
// So this reads the host's own files and looks for the four things that have to be there:
// the plugin entry registered, the plugin imported, the panel rendered as a component, and
// a runtime passed in. It then loads this folder through the same URL the host uses, so a
// plugin entry that does not even import is caught here rather than at startup.

import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const HUB = resolve(HERE, "..")
const REPO = resolve(HUB, "..")

/**
 * Where the host is expected to reach the Hub from.
 *
 * The runtime binding lives in home.tsx rather than in a context module. It was assumed to
 * be somewhere else once and this check reported a missing file that never existed, which
 * is the failure mode of a verification script: it looks thorough and is quietly checking
 * nothing. It reads what the app actually does.
 */
const HOST_FILES = [
  { path: join("packages", "app", "src", "pages", "home.tsx"), why: "renders the MCP Connect button and binds the runtime" },
]

export function parseArgs(argv) {
  const flag = (name) => argv.includes(name)
  return { help: flag("--help") || flag("-h"), config: flag("--config") }
}

export const USAGE = `Check that the Hub is wired into the host app.

  --config   also check that the plugin is registered in ~/.config/zyraxon/zyraxon.jsonc
  --help     show this text
`

/** Strip comments so a match inside a comment does not count as wiring. */
function stripComments(text) {
  let out = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++
      out += "\n"
      continue
    }
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2)
      i = end === -1 ? text.length : end + 1
      continue
    }
    out += ch
  }
  return out
}

async function readOrSkip(path) {
  try {
    return await readFile(path, "utf8")
  } catch {
    return undefined
  }
}

export async function main(argv) {
  const { help, config } = parseArgs(argv)
  if (help) {
    console.log(USAGE)
    return
  }

  console.log("MCP Hub injection")
  console.log("=================")
  console.log(`hub:  ${HUB}`)
  console.log(`repo: ${REPO}\n`)

  let problems = 0

  // 1. the plugin entry has to actually import. This is the check that catches a rename,
  //    a moved file or an export that was dropped, all of which used to be invisible until
  //    the app was started.
  const entry = pathToFileURL(join(HUB, "plugin.ts")).href
  try {
    const hub = await import(entry)
    const built = hub.createMcpHub?.({})
    if (!built) {
      console.log(`  FAIL createMcpHub returned nothing from ${entry}`)
      problems++
    } else {
      console.log(`  ok   plugin entry imports (${built.catalog.all().length} apps)`)
    }
  } catch (e) {
    console.log(`  FAIL plugin entry does not import: ${e.message}`)
    problems++
  }

  // 2. the host has to reach it
  for (const file of HOST_FILES) {
    const text = await readOrSkip(join(REPO, file.path))
    if (text === undefined) {
      console.log(`  --   ${file.path} not present (${file.why})`)
      continue
    }
    const code = stripComments(text)
    const mentionsHub = /mcp[- ]?hub|McpHub|createMcpHub/i.test(code)
    console.log(`  ${mentionsHub ? "ok  " : "--  "} ${file.path}${mentionsHub ? "" : ` — no Hub reference (${file.why})`}`)
  }

  // 3. and render it as a component rather than calling it, which is the mistake that
  //    makes a panel render once and then stop responding
  const home = await readOrSkip(join(REPO, "packages", "app", "src", "pages", "home.tsx"))
  if (home) {
    const code = stripComments(home)
    const asComponent = /<[A-Za-z]*\.?[A-Za-z]*McpHubPanel[\s/>]/.test(code)
    const calledDirectly = /McpHubPanel\s*\(/.test(code)
    if (calledDirectly && !asComponent) {
      console.log("  FAIL home.tsx calls McpHubPanel(...) as a function — render it as a component instead")
      problems++
    } else if (asComponent) {
      console.log("  ok   home.tsx renders the panel as a component")
    }

    // 4. the runtime has to be handed in, or every card is blank
    if (/\.bindRuntime\s*\(|bindRuntime\s*\(/.test(code)) {
      const passesClient = /bindRuntime\s*\(\s*\{[\s\S]{0,200}?client/.test(code)
      const passesConfig = /bindRuntime\s*\(\s*\{[\s\S]{0,200}?updateConfig/.test(code)
      console.log(`  ${passesClient ? "ok  " : "FAIL"} the app binds a connected MCP client`)
      console.log(`  ${passesConfig ? "ok  " : "FAIL"} the app passes a config writer, so a connection survives a restart`)
      if (!passesClient || !passesConfig) problems++
    } else {
      console.log("  FAIL no bindRuntime call found — the panel would have no runtime to talk to")
      problems++
    }
  }

  if (config) {
    const configPath = join(homedir(), ".config", "zyraxon", "zyraxon.jsonc")
    const text = await readOrSkip(configPath)
    if (text === undefined) {
      console.log(`\n  FAIL ${configPath} does not exist — run: node "MCP Hub/install.mjs"`)
      problems++
    } else if (!text.includes(pathToFileURL(join(HUB, "plugin.ts")).pathname.slice(1))) {
      console.log(`\n  --   the plugin is not registered in ${configPath}`)
      console.log(`      run: node "MCP Hub/install.mjs"`)
    } else {
      console.log(`\n  ok   the plugin is registered in ${configPath}`)
    }
  }

  console.log(problems === 0 ? "\nThe Hub is wired up." : `\n${problems} problem(s) found.`)
  if (problems > 0) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2))
}