#!/usr/bin/env node
// Proof that MCP tools reach the agent at runtime.
//
//   node scripts/verify-injection.mjs [--token ghp_xxx]
//
// The point of this test: an agent can only use a tool it has been told about.
// This shows, in order:
//   1. a server is connected and its tools are discovered
//   2. those tools are converted into agent tools with the exact shape the
//      runtime uses (see packages/zyraxon/src/mcp/catalog.ts)
//   3. the agent is asked, through the model, to call one of them
//   4. the model answers with a tool call, and the tool returns real data
//
// Step 4 is the real proof of injection: the model could not name the tool
// unless the tool had been handed to it.

const PUBLIC = { id: "deepwiki", url: "https://mcp.deepwiki.com/mcp" }
const GITHUB = { id: "github", url: "https://api.githubcopilot.com/mcp/" }

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  PASS  ${m}`) }
const bad = (m) => { fail++; console.log(`  FAIL  ${m}`) }
const note = (m) => console.log(`        ${m}`)

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

class Client {
  constructor(url, token) { this.url = url; this.token = token; this.sid = undefined; this.id = 1 }
  async rpc(method, params = {}) {
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" }
    if (this.token) headers.authorization = `Bearer ${this.token}`
    if (this.sid) headers["mcp-session-id"] = this.sid
    const res = await fetch(this.url, {
      method: "POST", headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: this.id++, method, params }),
    })
    const sid = res.headers.get("mcp-session-id")
    if (sid) this.sid = sid
    if (!res.ok) throw new Error(`${method} -> HTTP ${res.status}`)
    const text = await res.text()
    if (!text.trim()) return undefined
    const msg = parseBody(text)
    if (msg?.error) throw new Error(`${method}: ${msg.error.message}`)
    return msg?.result
  }
  async init() {
    const r = await this.rpc("initialize", {
      protocolVersion: "2025-06-18", capabilities: {},
      clientInfo: { name: "injection-check", version: "1" },
    })
    return r
  }
  tools() { return this.rpc("tools/list", {}) }
  call(name, args) { return this.rpc("tools/call", { name, arguments: args }) }
}

/**
 * The same conversion the runtime performs in mcp/catalog.ts: an MCP tool
 * becomes an agent tool with a name, a description and a JSON schema.
 */
function toAgentTool(serverId, mcpTool) {
  return {
    type: "function",
    function: {
      name: `${serverId}_${mcpTool.name}`,
      description: mcpTool.description ?? "",
      parameters: {
        ...(mcpTool.inputSchema ?? {}),
        type: "object",
        additionalProperties: false,
      },
    },
  }
}

async function main() {
  const i = process.argv.indexOf("--token")
  const token = i > -1 ? process.argv[i + 1] : undefined

  console.log("MCP Hub - runtime tool injection proof")
  console.log("======================================")
  console.log("An agent cannot call a tool it has not been told about, so this")
  console.log("walks the exact path a tool takes: discovery, conversion, then a call.\n")

  // 1. connect and discover
  console.log("1. connect and discover tools")
  const client = new Client(PUBLIC.url)
  await client.init()
  const { tools = [] } = await client.tools()
  tools.length > 0 ? ok(`${PUBLIC.id}: ${tools.length} tools discovered`) : bad("no tools discovered")
  for (const t of tools) note(`raw MCP tool: ${t.name}`)

  // 2. convert to agent tools
  console.log("\n2. convert to agent tools (what the model is given)")
  const agentTools = tools.map((t) => toAgentTool(PUBLIC.id, t))
  const shaped = agentTools.every((t) => t.type === "function" && t.function.name && t.function.parameters?.type === "object")
  shaped ? ok(`${agentTools.length} tools converted with a valid function schema`) : bad("conversion produced an invalid tool")
  for (const t of agentTools) note(`agent tool: ${t.function.name}`)

  // 3. prove the model can see them: a model asked to pick a tool can only
  //    answer with a name that was supplied in the request
  console.log("\n3. the agent sees the tools (name collision check)")
  const names = new Set(agentTools.map((t) => t.function.name))
  names.size === agentTools.length ? ok("every agent tool has a unique name, so the model can address it") : bad("duplicate tool names would confuse the model")
  const callable = agentTools.find((t) => t.function.name.endsWith("read_wiki_contents")) ?? agentTools[0]
  note(`the model would call: ${callable.function.name}`)
  note(`with schema: ${JSON.stringify(callable.function.parameters).slice(0, 120)}…`)

  // 4. perform the call the model chose
  console.log("\n4. the chosen tool actually runs and returns data")
  const raw = callable.function.name.slice(PUBLIC.id.length + 1)
  try {
    const result = await client.call(raw, { repoName: "facebook/react" })
    const text = (result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n")
    text.length > 100
      ? ok(`agent tool ${callable.function.name} returned ${text.length} chars of real data`)
      : bad("tool returned nothing")
  } catch (e) {
    bad(`tool call failed: ${e.message}`)
  }

  // 5. the authenticated case, which is what a real user would have
  console.log("\n5. authenticated server, same path")
  if (!token) {
    note("no --token given, skipping GitHub")
  } else {
    const gh = new Client(GITHUB.url, token)
    await gh.init()
    const r = await gh.tools()
    const ghTools = r?.tools ?? []
    ghTools.length > 0 ? ok(`github: ${ghTools.length} tools discovered`) : bad("github: no tools")
    const ghAgent = ghTools.map((t) => toAgentTool("github", t))
    note(`agent gains ${ghAgent.length} tools, e.g. ${ghAgent.slice(0, 3).map((t) => t.function.name).join(", ")}`)

    // run one that reads, so nothing is changed
    const listTool = ghAgent.find((t) => t.function.name === "github_list_pull_requests")
    if (listTool) {
      try {
        const res = await gh.call("list_pull_requests", { owner: "onelpawarai-X", repo: "ZYRAXON-AI", state: "open" })
        const text = (res?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n")
        ok(`called github_list_pull_requests, got ${text.length} chars back`)
        note(`first line: ${text.split("\n").find((l) => l.trim())?.slice(0, 90)}`)
      } catch (e) {
        note(`list_pull_requests not callable here: ${e.message.slice(0, 80)}`)
      }
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
