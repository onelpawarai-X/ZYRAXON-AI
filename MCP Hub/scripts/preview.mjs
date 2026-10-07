#!/usr/bin/env node
// Open the MCP Connect panel in a real browser, against a stub MCP runtime.
//
//   node "MCP Hub/scripts/preview.mjs"                start the stub and open the panel
//   node "MCP Hub/scripts/preview.mjs" --port 5179    pick a different port
//   node "MCP Hub/scripts/preview.mjs" --no-open      just print the URL
//
// The panel is a Solid component that lives outside the app's own build, so a panel change
// cannot be seen by starting ZYRAXON and waiting. This serves a page that mounts the panel
// directly against an in-process stub runtime, which is the only way to look at it without a
// full desktop build.

import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = pathToFileURL(join(HERE, "..", "plugin.ts")).href

export function parseArgs(argv) {
  const flag = (name) => argv.includes(name)
  const value = (name) => {
    const at = argv.indexOf(name)
    return at === -1 ? undefined : Number(argv[at + 1])
  }
  return { help: flag("--help") || flag("-h"), noOpen: flag("--no-open"), port: value("--port") ?? 5183 }
}

export const USAGE = `Preview the MCP Connect panel.

  --port <n>   port to listen on (default 5183)
  --no-open    print the URL instead of opening a browser
  --help       show this text
`

/**
 * A runtime that answers like the real one, so the panel has something honest to draw.
 *
 * Deliberately mixed: one app waiting for sign-in, two connected with a tool count, one
 * failed, and everything else absent. A stub where everything is connected hides exactly
 * the states that break.
 */
export const STUB_RUNTIME_SOURCE = `(() => {
  const statuses = {
    higgsfield: { status: "needs_auth" },
    "google-drive": { status: "connected", tools: ["search", "read", "create"] },
    github: { status: "connected", tools: ["create_issue", "list_prs", "get_file"] },
    "duckduckgo": { status: "connected", tools: ["search"] },
    slack: { status: "failed", error: "the server refused the connection" },
  }
  return {
    statuses: async () => ({ ...statuses }),
    toolNames: async () => Object.entries(statuses).flatMap(([name, s]) => (s.tools ?? []).map((t) => name + "__" + t)),
    connect: async (name) => { statuses[name] = { status: "connected", tools: ["stub"] } },
    addServer: async (name) => { statuses[name] = { status: "connected", tools: ["stub"] }; return statuses[name] },
    authenticate: async () => {},
    disconnect: async (name) => { delete statuses[name] },
  }
})()`

/**
 * The page that mounts the panel.
 *
 * The stub is inlined as source text because the inline module runs in the browser and
 * cannot import anything from node. The panel is mounted through `jsx` rather than by
 * calling it as a plain function: calling a Solid component directly runs its body outside
 * a reactive owner, so the signals it creates are never disposed and the panel renders once
 * and then stops responding.
 */
export function page() {
  return `<!doctype html>
<html lang="en" data-color-scheme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCP Connect — preview</title>
<style>
  html, body { margin: 0; height: 100%; background: #09090b; font-family: system-ui, sans-serif; }
</style>
</head>
<body>
<div id="root"></div>
<script type="module">
import { render, jsx } from "https://esm.sh/solid-js@1.9.3/web"
import { createMcpHub } from "${PLUGIN}"

const stubRuntime = ${STUB_RUNTIME_SOURCE}
const hub = createMcpHub(stubRuntime)

render(() => jsx(hub.Panel, { runtime: stubRuntime, resolve: hub.resolve }), document.getElementById("root"))
</script>
</body>
</html>`
}

export function openBrowser(url) {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open"
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url]
  spawn(opener, args, { detached: true, stdio: "ignore", shell: process.platform === "win32" }).unref()
}

export async function main(argv) {
  const { help, noOpen, port } = parseArgs(argv)
  if (help) {
    console.log(USAGE)
    return
  }

  const html = page()
  const server = createServer((req, res) => {
    if (req.url === "/favicon.ico") {
      res.writeHead(204).end()
      return
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    res.end(html)
  })

  await new Promise((done) => server.listen(port, done))
  const url = `http://localhost:${port}`

  console.log("MCP Connect preview")
  console.log("===================")
  console.log(`panel:  ${url}`)
  console.log(`plugin: ${PLUGIN}`)
  console.log("\nStop with Ctrl+C.")

  if (!noOpen) openBrowser(url)

  await new Promise(() => {})
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2))
}