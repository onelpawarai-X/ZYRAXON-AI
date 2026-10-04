#!/usr/bin/env node
// Standalone preview of the MCP Hub panel.
// Serves the panel markup with the live catalog and registry cache so the UI
// can be inspected without building the whole ZYRAXON app.

import { createServer } from "node:http"
import { readFile } from "node:fs/promises"

const HUB = "/workspace/zyraxon-src/MCP Hub"
const PORT = 12002

function parseApps(src) {
  const apps = []
  const re = /\{\s*id:\s*"([^"]+)"[\s\S]*?name:\s*"([^"]+)"[\s\S]*?description:\s*"([^"]+)"[\s\S]*?category:\s*"([^"]+)"[\s\S]*?kind:\s*"([^"]+)"([\s\S]*?)\}/g
  let m
  while ((m = re.exec(src))) {
    const rest = m[6]
    apps.push({
      id: m[1], name: m[2], description: m[3], category: m[4], kind: m[5],
      url: /url:\s*"([^"]+)"/.exec(rest)?.[1],
      tokenUrl: /tokenUrl:\s*"([^"]+)"/.exec(rest)?.[1],
      color: /color:\s*"([^"]+)"/.exec(rest)?.[1] ?? "#334155",
      zeroSetup: /zeroSetup:\s*true/.test(rest),
    })
  }
  return apps
}

function page(apps, cache) {
  const cards = apps.map((a) => `
    <div class="card">
      <div class="head">
        <div class="logo" style="background:${a.color}">${a.name[0]}</div>
        <div class="meta"><div class="name">${a.name}</div><div class="desc">${a.description}</div></div>
      </div>
      <div class="tags">
        <span class="tag">${a.category}</span>
        ${a.zeroSetup ? '<span class="tag ok">No setup</span>' : ""}
        ${a.kind === "local" ? '<span class="tag local">Local</span>' : ""}
      </div>
      <div class="foot">
        <span class="hint">${a.kind === "oauth" ? "Sign in with the browser" : a.kind === "token" ? "Needs an access token" : "Runs on this machine"}</span>
        <button>Connect</button>
      </div>
    </div>`).join("")

  return `<!doctype html><html><head><meta charset="utf-8"><title>MCP Connect</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#070b18;color:#e6ebf5;font-family:system-ui,-apple-system,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:28px 24px 60px}
h1{font-size:20px;margin:0 0 4px}
.sub{color:#8b95ad;font-size:13px;margin-bottom:20px}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:22px}
.stat{background:rgba(255,255,255,.04);border:1px solid #1e2740;border-radius:10px;padding:10px 14px}
.stat b{display:block;font-size:18px}
.stat span{color:#8b95ad;font-size:11px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.card{background:rgba(255,255,255,.02);border:1px solid #1e2740;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px}
.head{display:flex;gap:12px;align-items:flex-start}
.logo{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;flex:0 0 auto}
.name{font-weight:600;font-size:14px}
.desc{color:#8b95ad;font-size:12px}
.tags{display:flex;gap:6px;flex-wrap:wrap}
.tag{font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.06);color:#b9c3d6}
.tag.ok{background:rgba(16,185,129,.15);color:#6ee7b7}
.tag.local{background:rgba(14,165,233,.15);color:#7dd3fc}
.foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px}
.hint{color:#8b95ad;font-size:12px}
button{background:rgba(255,255,255,.1);border:0;color:#e6ebf5;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer}
button:hover{background:rgba(255,255,255,.16)}
</style></head><body><div class="wrap">
<h1>MCP Connect</h1>
<div class="sub">Every app below signs in once, then its tools go straight to the agent.</div>
<div class="stats">
  <div class="stat"><b>${apps.length}</b><span>MCP servers/apps</span></div>
  <div class="stat"><b>${apps.filter((a) => a.zeroSetup).length}</b><span>need nothing from you</span></div>
  <div class="stat"><b>${cache.count.toLocaleString()}</b><span>servers in the registry cache</span></div>
  <div class="stat"><b>${cache.servers.filter((s) => s.remote).length.toLocaleString()}</b><span>hosted, ready to connect</span></div>
</div>
<div class="grid">${cards}</div>
</div></body></html>`
}

createServer(async (req, res) => {
  const src = await readFile(`${HUB}/catalog/seed.ts`, "utf8")
  const cache = JSON.parse(await readFile(`${HUB}/catalog/registry-cache.json`, "utf8"))
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(page(parseApps(src), cache))
}).listen(PORT, "0.0.0.0", () => console.log(`MCP Hub preview on ${PORT}`))
