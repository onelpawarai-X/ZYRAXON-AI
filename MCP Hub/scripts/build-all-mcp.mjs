// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Write `MCP Hub/ALL MCP.md` — every server in the product, in one file.
 *
 *   bun run "MCP Hub/scripts/build-all-mcp.mjs"
 *
 * The panel is the place to connect a server; this is the place to look one up. It holds
 * both catalogs — the 108 curated apps and the 8,094 verified rows — with the fields that
 * decide how a card behaves: where the endpoint is, what it asks for, how far the proof
 * went and what the verifier observed.
 *
 * The file is generated, never hand-edited. Re-run this after any change to `catalog/` and
 * the same input gives the same bytes, so a diff on it is a real change in the catalog.
 *
 * Reading is done from the text of the generated modules rather than by importing them,
 * the same way `verify-verified.mjs` does it: the index is one 1.6 MB array literal, and
 * importing it would pull the TypeScript loader in for no gain. `seed.ts` is imported
 * normally because it is hand-written TypeScript with real exports.
 */

import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { allSeedApps, tierOf } from "../catalog/seed.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const CATALOG = join(ROOT, "catalog")
const OUT = join(ROOT, "ALL MCP.md")

/**
 * Take a JSON literal out of a generated module.
 *
 * The walk respects string literals, so a brace inside a description cannot end the
 * literal early — which is exactly what a plain regex would get wrong.
 */
function literalIn(text, marker, open, close) {
  const at = text.indexOf(marker)
  if (at === -1) throw new Error(`marker not found: ${marker}`)
  const start = text.indexOf(open, at + marker.length)
  if (start === -1) throw new Error(`opening ${open} not found after ${marker}`)
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === "\\") escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return JSON.parse(text.slice(start, i + 1))
    }
  }
  throw new Error(`unterminated literal after ${marker}`)
}

const indexText = await readFile(join(CATALOG, "verified-index.ts"), "utf8")
const detailText = await readFile(join(CATALOG, "connect-detail.ts"), "utf8")

const rows = literalIn(indexText, "export const verifiedRows: VerifiedRow[] = ", "[", "]")
const details = literalIn(detailText, "export const connectDetails: Record<string, ConnectDetail> = ", "{", "}")
const declared = Number(indexText.match(/export const verifiedRowCount = (\d+)/)?.[1])
const seed = allSeedApps()

if (declared !== rows.length) {
  throw new Error(`verified-index says ${declared} rows but holds ${rows.length}`)
}

/** The prose a reader gets for each connect kind, so a table cell is never a bare token. */
const CONNECT_MEANING = {
  no_auth: "Nothing. Press Connect and the tools are live.",
  oauth_browser: "A sign-in page opens in the browser.",
  api_key: "A key or a start command plus a client id.",
  url_input: "Your own address, which only you have.",
  unknown: "Not established by the verifier.",
}

const INSTALL_MEANING = {
  remote_http: "Remote HTTP endpoint",
  npx: "Local process, npm package",
  uvx: "Local process, PyPI package",
  docker: "Local container image",
  mcpb: "Local MCP bundle",
  nuget: "Local .NET package",
  unknown: "Not established",
}

const VERIFICATION_MEANING = {
  full: "initialize, tools/list and a read-only tools/call all answered",
  tools_list: "initialize and tools/list answered",
  auth_discovery: "a 401 was followed by a working discovery document",
  launched: "the package resolved, started and then asked for its key",
  declared: "the endpoint is reachable but needs a value from the user",
  unknown: "no proof was recorded",
}

/** A markdown table cell: a pipe or a newline in a name would break the row. */
const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim()

const byConnect = {}
const byInstall = {}
const byCategory = {}
const byVerification = {}
for (const row of rows) {
  byConnect[row[4]] = (byConnect[row[4]] ?? 0) + 1
  byInstall[row[3]] = (byInstall[row[3]] ?? 0) + 1
  byCategory[row[2]] = (byCategory[row[2]] ?? 0) + 1
  byVerification[row[5]] = (byVerification[row[5]] ?? 0) + 1
}

const withTools = rows.filter((row) => row[6] > 0)
const totalTools = rows.reduce((sum, row) => sum + row[6], 0)

const table = (headers, body) =>
  [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")

const out = []

out.push("# ALL MCP — every server in ZYRAXON")
out.push("")
out.push("<!-- Generated by scripts/build-all-mcp.mjs. Do not edit by hand. -->")
out.push("")
out.push(
  `Every MCP server this product can connect, in one file. **${(rows.length + seed.length).toLocaleString("en-US")} servers in total** — ${rows.length.toLocaleString("en-US")} verified from the public registry and ${seed.length} curated by hand.`,
)
out.push("")
out.push("The two catalogs answer different questions and both ship:")
out.push("")
out.push(
  `- **Verified** (${rows.length.toLocaleString("en-US")}) — produced by three generator scripts from a registry snapshot and two live passes. Each row answered a real MCP handshake or was measured to a stated depth, so a card here can be pressed and connected.`,
)
out.push(
  `- **Curated** (${seed.length}) — hand-written entries with a description, setup steps and a guide. They cover the apps most people actually want first, and a handful of them overlap the verified list by name.`,
)
out.push("")
out.push("## What the numbers are")
out.push("")
out.push(
  table(
    ["Measure", "Count"],
    [
      ["Verified servers", rows.length.toLocaleString("en-US")],
      ["Curated apps", String(seed.length)],
      ["Total entries", (rows.length + seed.length).toLocaleString("en-US")],
      ["Distinct names", new Set([...rows.map((r) => r[1].toLowerCase()), ...seed.map((a) => a.name.toLowerCase())]).size.toLocaleString("en-US")],
      ["Categories in the verified catalog", String(Object.keys(byCategory).length)],
      ["Verified servers with at least one tool", withTools.length.toLocaleString("en-US")],
      ["Tools observed across the verified catalog", totalTools.toLocaleString("en-US")],
    ],
  ),
)
out.push("")
out.push("### How a server is connected")
out.push("")
out.push(
  table(
    ["Connect kind", "Servers", "What the user does"],
    Object.entries(byConnect)
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => [kind, count.toLocaleString("en-US"), CONNECT_MEANING[kind] ?? ""]),
  ),
)
out.push("")
out.push("### How a server is installed")
out.push("")
out.push(
  table(
    ["Install kind", "Servers", "What it means"],
    Object.entries(byInstall)
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => [kind, count.toLocaleString("en-US"), INSTALL_MEANING[kind] ?? ""]),
  ),
)
out.push("")
out.push("### How far the proof went")
out.push("")
out.push(
  table(
    ["Verification", "Servers", "What was proven"],
    Object.entries(byVerification)
      .sort((a, b) => b[1] - a[1])
      .map(([level, count]) => [level, count.toLocaleString("en-US"), VERIFICATION_MEANING[level] ?? ""]),
  ),
)
out.push("")
out.push("### Servers per category")
out.push("")
out.push(
  table(
    ["Category", "Servers"],
    Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category, count]) => [category, count.toLocaleString("en-US")]),
  ),
)
out.push("")

// ---- curated apps -------------------------------------------------------
out.push("## Curated apps")
out.push("")
out.push(
  `${seed.length} hand-written entries. Each one carries a description, the steps to connect it and a guide; the tier decides the order they appear in the panel.`,
)
out.push("")

const TIER_ORDER = ["browser", "key", "open", "local"]
const TIER_TITLE = {
  browser: "Browser sign-in",
  key: "Needs a token",
  open: "Open — no sign-in",
  local: "Runs on this machine",
}

for (const tier of TIER_ORDER) {
  const apps = seed.filter((app) => tierOf(app) === tier)
  if (!apps.length) continue
  out.push(`### ${TIER_TITLE[tier]} (${apps.length})`)
  out.push("")
  for (const app of apps) {
    out.push(`#### ${app.name}`)
    out.push("")
    out.push(`- **id** — \`${app.id}\``)
    out.push(`- **Category** — ${app.category}`)
    out.push(`- **Kind** — \`${app.kind}\``)
    if (app.url) out.push(`- **Endpoint** — ${app.url}`)
    if (app.urlTemplate) out.push(`- **Endpoint template** — \`${app.urlTemplate}\``)
    if (app.command) {
      const { command, args } = app.command
      out.push(`- **Start command** — \`${[command, ...(args ?? [])].join(" ")}\``)
    }
    if (app.tokenUrl) out.push(`- **Where to get a token** — ${app.tokenUrl}`)
    if (app.consoleUrl) out.push(`- **Developer console** — ${app.consoleUrl}`)
    if (app.needsClientId) out.push("- **Needs a client id** — yes")
    if (app.oauth) out.push(`- **OAuth endpoints** — authorization \`${app.oauth.authorizationUrl}\`, token \`${app.oauth.tokenUrl}\``)
    if (app.scope) out.push(`- **Default scope** — \`${app.scope}\``)
    if (app.auth) out.push(`- **Credential header** — \`${app.auth}\``)
    if (app.via) out.push(`- **Operated by** — ${app.via}`)
    out.push("")
    out.push(app.description)
    if (app.note) {
      out.push("")
      out.push(`> ${app.note}`)
    }
    if (app.steps?.length) {
      out.push("")
      out.push("How to connect it:")
      out.push("")
      app.steps.forEach((step, index) => out.push(`${index + 1}. ${step}`))
    }
    out.push("")
  }
}

// ---- verified servers ---------------------------------------------------
out.push("## Verified servers")
out.push("")
out.push(
  `${rows.length.toLocaleString("en-US")} servers, in the order the registry lists them. Every row below was reached by the verifier; the depth it reached is the \`verified\` column.`,
)
out.push("")

const detailRows = rows.filter((row) => details[row[0]])
out.push(
  `${detailRows.length.toLocaleString("en-US")} of them ask for something before they will run — an environment variable, a value in the endpoint, or a browser sign-in that this machine has to register. Their full requirements follow the table.`,
)
out.push("")
out.push(
  table(
    ["Name", "id", "Category", "Install", "Connect", "Verified", "Tools", "Endpoint / package"],
    rows.map((row) => {
      const [id, name, category, installKind, connectKind, verification, toolCount, , url, pkgType, pkgId, pkgVersion] = row
      const target = url || (pkgId ? `${pkgType}:${pkgId}${pkgVersion ? `@${pkgVersion}` : ""}` : "")
      return [
        cell(name),
        `\`${cell(id)}\``,
        cell(category),
        cell(installKind),
        cell(connectKind),
        cell(verification),
        String(toolCount),
        target ? `\`${cell(target)}\`` : "",
      ]
    }),
  ),
)
out.push("")

out.push("## What the verified servers ask for")
out.push("")
out.push(
  "Only the rows that require input appear here. A row absent from this list needs nothing typed: press Connect and its tools arrive.",
)
out.push("")

const askedRows = []
for (const [id, detail] of Object.entries(details).sort((a, b) => a[0].localeCompare(b[0]))) {
  const parts = []
  if (detail.env?.length) {
    parts.push(
      detail.env
        .map((env) => `\`${env.name}\`${env.secret ? " (secret)" : ""}${env.description ? ` — ${cell(env.description)}` : ""}`)
        .join("<br>"),
    )
  }
  if (detail.urlTemplate) parts.push(`endpoint template \`${detail.urlTemplate}\``)
  if (detail.selfRegisters === true) parts.push("browser sign-in, client registered automatically")
  if (detail.selfRegisters === false) parts.push("browser sign-in, client id needed")
  if (detail.authKind) parts.push(`sent as \`${detail.authKind}\``)
  if (detail.consoleUrl) parts.push(`console: ${detail.consoleUrl}`)
  if (detail.metadataUrl) parts.push(`discovery: ${detail.metadataUrl}`)
  if (!parts.length) continue
  askedRows.push([`\`${cell(id)}\``, parts.join("<br>")])
}

out.push(table(["id", "What it asks for"], askedRows))
out.push("")

out.push("## How to regenerate this file")
out.push("")
out.push("```")
out.push('bun run "MCP Hub/scripts/build-all-mcp.mjs"')
out.push("```")
out.push("")
out.push(
  "The generator reads `catalog/verified-index.ts`, `catalog/connect-detail.ts` and `catalog/seed.ts` and writes this file. It needs no network and no credentials.",
)
out.push("")

await writeFile(OUT, out.join("\n"), "utf8")

const bytes = Buffer.byteLength(out.join("\n"))
console.log(`wrote ${OUT}`)
console.log(`  verified : ${rows.length}`)
console.log(`  curated  : ${seed.length}`)
console.log(`  total    : ${rows.length + seed.length}`)
console.log(`  details  : ${askedRows.length}`)
console.log(`  size     : ${(bytes / 1024).toFixed(1)} KB`)
