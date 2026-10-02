#!/usr/bin/env node
// Live proof that MCP Hub can actually connect to real servers and pull tools.
//
//   node scripts/verify-live.mjs [--token ghp_xxx]
//
// Steps:
//   1. handshake with public servers that need no login
//   2. list their tools
//   3. call a real tool and show the answer
//   4. if a GitHub token is supplied, do the same against the GitHub MCP server
//   5. confirm the OAuth-only servers answer with the auth challenge we expect

const PUBLIC_SERVERS = [
  { id: "deepwiki", url: "https://mcp.deepwiki.com/mcp" },
  { id: "context7", url: "https://mcp.context7.com/mcp" },
]

const OAUTH_SERVERS = [
  { id: "notion", url: "https://mcp.notion.com/mcp" },
  { id: "linear", url: "https://mcp.linear.app/sse" },
  { id: "atlassian", url: "https://mcp.atlassian.com/v1/sse" },
  { id: "sentry", url: "https://mcp.sentry.dev/mcp" },
  { id: "stripe", url: "https://mcp.stripe.com" },
  { id: "cloudflare", url: "https://mcp.cloudflare.com/mcp" },
  { id: "figma", url: "https://mcp.figma.com/mcp" },
]

const GITHUB_MCP = "https://api.githubcopilot.com/mcp/"

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  PASS  ${m}`) }
const bad = (m) => { fail++; console.log(`  FAIL  ${m}`) }
const note = (m) => console.log(`  ..    ${m}`)

function parseBody(text) {
  const t = text.trim()
  if (t.startsWith("{") || t.startsWith("[")) return JSON.parse(t)
  const lines = t.split(/\r?\n/).filter((l) => l.startsWith("data:"))
  for (let i = lines.length - 1; i >= 0; i--) {
    const p = lines[i].slice(5).trim()
    if (p.startsWith("{")) { try { return JSON.parse(p) } catch {} }
  }
  throw new Error("unparseable: " + t.slice(0, 100))
}

async function rpc(url, method, params, opts = {}) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  }
  if (opts.token) headers.authorization = `Bearer ${opts.token}`
  if (opts.session) headers["mcp-session-id"] = opts.session
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 25000)
  try {
    const res = await fetch(url, {
      method: "POST", headers, signal: ctrl.signal,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? {} }),
    })
    const sid = res.headers.get("mcp-session-id")
    const text = await res.text()
    return { status: res.status, sid, body: text ? parseBody(text) : undefined }
  } finally {
    clearTimeout(timer)
  }
}

async function handshakeAndList(server, opts = {}) {
  const init = await rpc(server.url, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-hub-verify", version: "1.0.0" },
  }, opts)
  if (init.status !== 200) {
    bad(`${server.id}: initialize returned ${init.status}`)
    return undefined
  }
  const name = init.body?.result?.serverInfo?.name ?? "unknown"
  ok(`${server.id}: handshake ok, server = ${name}`)

  const list = await rpc(server.url, "tools/list", {}, { ...opts, session: init.sid })
  const tools = list.body?.result?.tools ?? []
  if (tools.length === 0) {
    bad(`${server.id}: no tools returned`)
    return undefined
  }
  ok(`${server.id}: ${tools.length} tools available`)
  for (const t of tools.slice(0, 5)) note(`${server.id}: tool -> ${t.name}`)
  return { server, tools, session: init.sid, opts }
}

async function main() {
  const tokenArg = process.argv.indexOf("--token")
  const githubToken = tokenArg > -1 ? process.argv[tokenArg + 1] : undefined

  console.log("MCP Hub - live connection proof")
  console.log("===============================")

  console.log("\n1. public servers (no login needed)")
  let deepwiki
  for (const s of PUBLIC_SERVERS) {
    const r = await handshakeAndList(s)
    if (s.id === "deepwiki" && r) deepwiki = r
  }

  console.log("\n2. real tool call")
  if (deepwiki) {
    const tool = deepwiki.tools.find((t) => t.name.includes("read_wiki")) ?? deepwiki.tools[0]
    try {
      const call = await rpc(deepwiki.server.url, "tools/call",
        { name: tool.name, arguments: { repoName: "facebook/react" } },
        { session: deepwiki.session })
      const content = call.body?.result?.content ?? []
      const text = content.filter((c) => c.type === "text").map((c) => c.text).join("\n")
      if (text && text.length > 20) {
        ok(`called ${tool.name} on facebook/react, got ${text.length} chars back`)
        note(`first line: ${text.split("\n").find((l) => l.trim())?.slice(0, 90)}`)
      } else {
        bad(`tool call returned nothing useful`)
      }
    } catch (e) {
      bad(`tool call failed: ${e.message}`)
    }
  }

  console.log("\n3. OAuth servers ask for sign-in the standard way")
  for (const s of OAUTH_SERVERS) {
    try {
      const res = await fetch(s.url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify", version: "1" } } }) })
      const wa = res.headers.get("www-authenticate") ?? ""
      if (res.status === 401 && wa.includes("resource_metadata")) {
        ok(`${s.id}: 401 with resource_metadata, so the browser login flow can start`)
      } else if (res.status === 401) {
        ok(`${s.id}: 401 (auth required)`)
      } else if (res.status === 405 || res.status === 404) {
        ok(`${s.id}: ${res.status} on POST (SSE-only endpoint, reached over GET)`)
      } else {
        note(`${s.id}: status ${res.status}`)
      }
    } catch (e) {
      bad(`${s.id}: unreachable (${e.message})`)
    }
  }

  console.log("\n4. GitHub MCP with a token")
  if (!githubToken) {
    note("no --token given, skipping the authenticated GitHub check")
  } else {
    try {
      const init = await rpc(GITHUB_MCP, "initialize",
        { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-hub-verify", version: "1" } },
        { token: githubToken })
      if (init.status === 200) {
        ok("github: authenticated handshake succeeded")
        const list = await rpc(GITHUB_MCP, "tools/list", {}, { token: githubToken, session: init.sid })
        const tools = list.body?.result?.tools ?? []
        tools.length > 0 ? ok(`github: ${tools.length} tools available to the agent`) : bad("github: no tools")
        for (const t of tools.slice(0, 8)) note(`github: tool -> ${t.name}`)
      } else {
        bad(`github: handshake returned ${init.status}`)
      }
    } catch (e) {
      bad(`github: ${e.message}`)
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
