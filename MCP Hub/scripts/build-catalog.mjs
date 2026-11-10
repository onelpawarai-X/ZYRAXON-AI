#!/usr/bin/env node
// Copyright (c) 2026 onelpawarai. All rights reserved.

// Turn the verification log into the catalog the app reads.
//
//   node "MCP Hub/scripts/build-catalog.mjs"
//
// Inputs, all already on disk:
//   data/verified.jsonl  one line per server that answered, written by verify-servers.mjs
//   data/failed.jsonl    one line per server that did not, with the reason
//
// Outputs:
//   data/catalog.json    the verified servers, in the shape the UI renders
//   data/failed.json     the rejects, grouped by reason so the number means something
//   data/mcp-list.json   the same catalog counted by category and by install/connect kind
//   catalog/servers.ts   the catalog as a typed module, so the panel needs no fetch
//
// The counts written into mcp-list.json are the same counts the README and the panel show.
// They are computed here and nowhere else, which is the only way three places stay equal.

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const DATA = join(ROOT, "data")
const CATALOG = join(ROOT, "catalog")
/** the normalized registry snapshot, used to backfill endpoint and package on older rows */
const SERVERS = join(DATA, "servers.json")

const readJsonl = async (path) => {
  const text = await readFile(path, "utf8").catch(() => "")
  const rows = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      // a torn final line from a killed run; the next run rewrites it
    }
  }
  return rows
}

/**
 * Put a verified server in a category.
 *
 * The registry publishes no category, so one is derived from the words in the server's own
 * name and description. This is a labelling convenience for the filter chips, not a claim
 * about the server, and the fallback is an honest "general" rather than a guess.
 */
const CATEGORY_RULES = [
  ["Developer Tools", /\b(code|git|github|gitlab|repo|review|refactor|lint|test|build|debug|ide|editor|typescript|python|compile)\b/i],
  ["Databases", /\b(database|postgres|postgresql|mysql|sqlite|mongo|redis|sql|clickhouse|duckdb|snowflake|bigquery|supabase|neon)\b/i],
  ["Cloud & Infrastructure", /\b(aws|azure|gcp|google cloud|kubernetes|k8s|docker|terraform|cloudflare|vercel|netlify|serverless|devops|infra)\b/i],
  ["Web & Search", /\b(search|browse|crawl|scrape|serp|web|url|http|fetch|google|bing|brave|exa|tavily)\b/i],
  ["Communication", /\b(slack|discord|telegram|whatsapp|email|gmail|smtp|chat|message|twilio|zoom|meet)\b/i],
  ["Productivity & Docs", /\b(notion|confluence|docs?|wiki|jira|linear|asana|trello|todo|task|calendar|sheets|excel|office|obsidian)\b/i],
  ["Data & Analytics", /\b(analytics|metric|dashboard|chart|graph|visuali|bi\b|etl|pipeline|warehouse|dataset|csv|parquet)\b/i],
  ["AI & ML", /\b(ai\b|llm|model|embedding|vector|rag|prompt|openai|anthropic|hugging|inference|agent|ml\b)\b/i],
  ["Finance & Crypto", /\b(finance|bank|payment|stripe|paypal|invoice|crypto|blockchain|ethereum|bitcoin|wallet|trading|stock)\b/i],
  ["Security", /\b(security|vulnerab|scan|pentest|auth|encrypt|secrets?|sast|threat|malware|firewall)\b/i],
  ["Design & Media", /\b(figma|design|image|photo|video|audio|music|render|canvas|svg|pdf|media|stream)\b/i],
  ["Maps & Travel", /\b(map|geo|location|travel|flight|hotel|weather|route|transit|osm)\b/i],
  ["IoT & Hardware", /\b(iot|sensor|hardware|robot|drone|arduino|raspberry|mqtt|modbus|can bus|serial|embedded)\b/i],
  ["Business & CRM", /\b(crm|salesforce|hubspot|marketing|support|ticket|customer|ecommerce|shopify|commerce)\b/i],
  ["Knowledge & Memory", /\b(memory|knowledge|graph|note|remember|context|rag|wiki)\b/i],
  ["Files & Storage", /\b(file|storage|s3|drive|dropbox|onedrive|bucket|upload|download|archive)\b/i],
]

function categorise(server) {
  const haystack = `${server.title ?? ""} ${server.id} ${server.description ?? ""}`
  for (const [name, pattern] of CATEGORY_RULES) {
    if (pattern.test(haystack)) return name
  }
  return "General"
}

function countBy(rows, key) {
  const out = {}
  for (const row of rows) {
    const k = row[key] ?? "unknown"
    out[k] = (out[k] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]))
}

/**
 * The first web address inside a sentence, if the sentence holds one.
 *
 * Vendor authors write the answer to "where do I get this key" inside the variable's own
 * description — "Your CandleFeed API key. Get a free one at https://candlefeed.ai/signup" —
 * and that address is the most useful thing on the whole Details panel. Trailing sentence
 * punctuation is stripped because the URL is shown as a link, not as prose.
 */
function urlIn(text) {
  if (typeof text !== "string") return undefined
  const match = text.match(/https?:\/\/[^\s'"<>)\]]+/)
  if (!match) return undefined
  return match[0].replace(/[.,;:]+$/, "")
}

/**
 * The page a user goes to in order to create the credential a server asks for.
 *
 * Tried in order of how directly they answer the question: the URL the variable's own
 * description names, then the server's published website, then its source repository. A
 * vendor console is not guessed from a domain — a made-up `/dashboard/api-keys` would send
 * people to a 404, which is worse than sending them to the site's front page.
 */
function credentialUrl(server, description) {
  return urlIn(description) ?? server.website ?? server.repository ?? undefined
}

/**
 * The published page for a package, from its identifier.
 *
 * A local server that publishes no website and no repository still has one real page: the
 * registry it is installed from, whose address is derived from the identifier the verifier
 * already proved it launches. `@anaxer/mcp` is `npmjs.com/package/@anaxer/mcp`; that is the
 * canonical page for the package, not a guessed console path, so linking it is honest.
 */
function packagePage(pkg) {
  if (!pkg?.identifier) return undefined
  const id = pkg.identifier
  if (pkg.registry_type === "npm") return `https://www.npmjs.com/package/${id}`
  if (pkg.registry_type === "pypi") return `https://pypi.org/project/${id}`
  if (pkg.registry_type === "oci") {
    // `docker.io/castbuild/name:tag` → `hub.docker.com/r/castbuild/name`
    const withoutTag = id.split(":")[0].replace(/^(docker\.io|index\.docker\.io|ghcr\.io)\//, "")
    return withoutTag.includes("/") ? `https://hub.docker.com/r/${withoutTag}` : undefined
  }
  return undefined
}

async function main() {
  await mkdir(CATALOG, { recursive: true })

  const verified = await readJsonl(join(DATA, "verified.jsonl"))
  const failed = await readJsonl(join(DATA, "failed.jsonl"))

  /**
   * The normalized registry, keyed by id.
   *
   * Verification rows written before the verifier started recording `url` and `package`
   * have neither, and a card without an endpoint cannot connect anything. The registry
   * snapshot on disk already holds both, so they are joined back in here. This keeps an
   * older log usable instead of forcing a re-verify of thousands of servers to add two
   * fields.
   */
  const registry = new Map()
  const registryRaw = await readFile(SERVERS, "utf8").catch(() => "")
  if (registryRaw) {
    for (const server of JSON.parse(registryRaw).servers ?? []) registry.set(server.id, server)
  }

  const packageOf = (server) => {
    for (const type of ["npm", "pypi", "oci", "mcpb", "nuget"]) {
      const found = (server.packages ?? []).find((p) => p.registryType === type)
      if (found) return { registry_type: type, identifier: found.identifier, version: found.version }
    }
    return undefined
  }

  // One row per server id. A server verified twice in two runs keeps its latest transcript.
  const byId = new Map()
  for (const row of verified) {
    const previous = byId.get(row.id)
    if (!previous || (row.last_verified ?? "") > (previous.last_verified ?? "")) byId.set(row.id, row)
  }

  /**
   * Drop the servers a live re-check found dead.
   *
   * A row is a promise about a server on somebody else's domain, and domains rot: a 404 in
   * a card the user pressed is the whole Hub looking broken. `recheck-live.mjs` writes one
   * line per server that no longer answers, and this is where that verdict is applied — so
   * the removal is a reviewable diff against the previous catalog rather than something the
   * probe did on its own.
   */
  const dead = new Set()
  const deadRaw = await readFile(join(DATA, "dead.jsonl"), "utf8").catch(() => "")
  for (const line of deadRaw.split("\n")) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      // A `url_input` row has no URL to probe — the endpoint is a template the user completes —
      // so a verdict about it is a verdict about the probe, not about the server. An earlier
      // re-check recorded all of them as dead for exactly that reason; they are ignored here so
      // a bad probe can never delete a working row.
      if (row.id && row.connect_kind !== "url_input") dead.add(row.id)
    } catch {
      // a torn final line from a killed run; the next re-check rewrites it
    }
  }

  /**
   * The registration verdict per browser-sign-in server, from its own pass.
   *
   * The verifier reads the first discovery document it finds, which is nearly always the
   * protected-resource document — and that one names the issuer, not the registration
   * endpoint. The endpoint lives one hop further, in the issuer's own metadata, so reading
   * only the first document found a registration endpoint on 34 of 3,108 servers. The pass
   * that writes this file follows the hop and attempts the registration for real, so its
   * answer is the one the card should repeat.
   */
  const registration = new Map()
  const registrationRaw = await readFile(join(DATA, "oauth-registration.jsonl"), "utf8").catch(() => "")
  for (const line of registrationRaw.split("\n")) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      if (row.id) registration.set(row.id, row.selfRegisters === true)
    } catch {
      // a torn final line from a killed run
    }
  }

  const servers = [...byId.values()]
    .filter((row) => !dead.has(row.id))
    .map((row) => {
      const source = registry.get(row.id)
      return {
        id: row.id,
        name: row.title?.trim() || row.id,
        description: row.description ?? "",
        category: categorise(row),
        install_kind: row.install_kind,
        connect_kind: row.connect_kind,
        verification: row.verification ?? "unknown",
        needs_login: Boolean(row.needs_login),
        // recorded by the verifier when it ran; otherwise taken from the registry snapshot
        url: row.url ?? source?.remotes?.[0]?.url,
        package: row.package ?? (source ? packageOf(source) : undefined),
        repository: row.repository ?? source?.repository,
        website: row.website ?? source?.website,
        version: row.version ?? source?.version,
        last_verified: row.last_verified,
        tool_count: row.tool_count ?? 0,
        tool_names: row.tool_names,
        env_schema: row.env_schema,
        auth: row.auth,
      }
    })
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

  // Failure reasons, grouped so "why did 400 servers fail" is one line and not 400.
  const reasonGroups = {}
  for (const row of failed) {
    const key = `${row.install_kind}: ${(row.reason ?? "unknown").replace(/\d+/g, "N").slice(0, 90)}`
    reasonGroups[key] = (reasonGroups[key] ?? 0) + 1
  }

  const summary = {
    generated: new Date().toISOString(),
    verified: servers.length,
    failed: failed.length,
    attempted: servers.length + failed.length,
    pass_rate: servers.length + failed.length ? Number((servers.length / (servers.length + failed.length)).toFixed(4)) : 0,
    by_install_kind: countBy(servers, "install_kind"),
    by_connect_kind: countBy(servers, "connect_kind"),
    by_verification: countBy(servers, "verification"),
    by_category: countBy(servers, "category"),
    tools_total: servers.reduce((n, s) => n + (s.tool_count ?? 0), 0),
    failure_reasons: Object.fromEntries(Object.entries(reasonGroups).sort((a, b) => b[1] - a[1])),
  }

  await writeFile(join(DATA, "catalog.json"), JSON.stringify({ summary, servers }, null, 2))
  await writeFile(join(DATA, "failed.json"), JSON.stringify({ summary: { failed: failed.length, by_reason: summary.failure_reasons }, failed }, null, 2))

  // The list file the hub shows: how many of each category, install kind and connect kind.
  await writeFile(
    join(DATA, "mcp-list.json"),
    JSON.stringify(
      {
        generated: summary.generated,
        total: servers.length,
        categories: summary.by_category,
        install_kinds: summary.by_install_kind,
        connect_kinds: summary.by_connect_kind,
        verification_levels: summary.by_verification,
        tools_total: summary.tools_total,
      },
      null,
      2,
    ),
  )

  /**
   * A compact index, for the panel's list.
   *
   * The full catalog carries every tool name and env field of all ${servers.length} servers,
   * which is what the verifier recorded and what a report needs — but as a TypeScript
   * literal of that size the compiler gives up ("union type too complex to represent"),
   * and none of it is needed to draw a card.
   *
   * So the panel loads this instead: the same servers, the same order, plus the two short
   * fields a card needs to actually connect (the endpoint and the package). Descriptions
   * and env schemas stay in data/catalog.json for reports and are not shipped to the app.
   */
  const index = servers.map((s) => [
    s.id,
    s.name,
    s.category,
    s.install_kind,
    s.connect_kind,
    s.verification,
    s.tool_count,
    s.needs_login ? 1 : 0,
    s.url ?? "",
    s.package?.registry_type ?? "",
    s.package?.identifier ?? "",
    s.package?.version ?? "",
    // The two places a person can go to learn what a server is and where to get its
    // credentials. Carried on the row because they are the whole answer for the 7,651
    // servers that need nothing typed but still deserve a "where do I sign up" link.
    //
    // A local package that published neither still has its registry page, which is derived
    // from the identifier the verifier already started it from, so the row is never left
    // with no link at all. The page is put in `website` because that is the "learn about
    // this server" slot, and `repository` stays empty rather than pointing at a package.
    s.website ?? packagePage(s.package) ?? "",
    s.repository ?? "",
  ])
  const indexTs = `// Copyright (c) 2026 onelpawarai. All rights reserved.

// Generated by scripts/build-catalog.mjs — do not edit by hand.
//
// ${servers.length} verified servers as compact rows, for the panel's list. Row shape:
// [id, name, category, install_kind, connect_kind, verification, tool_count, needs_login,
//  url, package_registry_type, package_identifier, package_version, website, repository]

import type { ConnectKind, InstallKind, VerificationLevel } from "./verified-types"

export type VerifiedRow = [
  string,
  string,
  string,
  InstallKind,
  ConnectKind,
  VerificationLevel,
  number,
  0 | 1,
  string,
  string,
  string,
  string,
  string,
  string,
]

export const verifiedRowCount = ${servers.length}
export const verifiedRows: VerifiedRow[] = ${JSON.stringify(index)}
`
  await writeFile(join(CATALOG, "verified-index.ts"), indexTs)

  /**
   * The connect details, for the rows that need something typed in.
   *
   * The compact index carries the endpoint and the launch command, which is everything a
   * press-and-go card needs. It does not carry what a card needs when the server asks for a
   * value first — which environment variables a local package reads, whether a browser app
   * can register its own client, or the instance URL a remote template is missing. Those
   * live in the full catalog, which is far too large to ship as a module.
   *
   * So they are written out again here, but only for the rows that have something to say:
   * a sparse map keyed by id. A row absent from it needs nothing typed, which is the common
   * case and the reason this file stays small instead of repeating "nothing" several
   * thousand times.
   */
  const details = {}
  for (const s of servers) {
    const entry = {}
    // Environment variables a local package reads. One form box per variable, so the form
    // is exactly as long as the server's own requirements and never longer.
    if (Array.isArray(s.env_schema) && s.env_schema.length > 0) {
      entry.env = s.env_schema.map((e) => ({
        name: e.name,
        ...(e.description ? { description: e.description } : {}),
        ...(e.isSecret ? { secret: true } : {}),
        // The page that issues this variable. Taken from the description when the vendor
        // wrote one there, and otherwise from the server's own site, so a user always has
        // somewhere real to go rather than a guessed console path.
        ...(credentialUrl(s, e.description) ? { url: credentialUrl(s, e.description) } : {}),
      }))
    }
    // The remote endpoint still carries a `{placeholder}`, so the user must supply the host.
    if (s.url && /\{[^}]+\}/.test(s.url)) entry.urlTemplate = s.url
    // A browser sign-in whose server registers its own client needs nothing from the user;
    // one that does not needs a client ID created in the vendor's console.
    //
    // The verdict comes from the registration pass, not from the verifier's discovery: the
    // verifier stops at the protected-resource document, which names the issuer and not the
    // registration endpoint, so its answer under-reports self-registration by an order of
    // magnitude. When the pass has not run for a server, the presence of the endpoint in the
    // verifier's own record is used as a weaker fallback rather than guessing either way.
    if (s.connect_kind === "oauth_browser") {
      const known = registration.get(s.id)
      entry.selfRegisters = known ?? Boolean(s.auth?.registration_endpoint)
      if (s.auth?.metadata_url) entry.metadataUrl = s.auth.metadata_url
    }
    // The header a pasted key travels in, for the vendors that reject the default Bearer.
    if (s.connect_kind === "api_key" && s.auth?.kind) entry.authKind = s.auth.kind
    /**
     * Where the user goes to make the credential this row asks for.
     *
     * Only written for a row that actually asks for something — a client ID for a browser app
     * that will not self-register, or a key for an api_key server. A row that needs nothing
     * carries no link here, because its Details already shows the server's own site from the
     * index and a second, identical link would only be noise.
     */
    const asksForCredential =
      entry.env?.length > 0 ||
      entry.urlTemplate ||
      (s.connect_kind === "oauth_browser" && entry.selfRegisters === false) ||
      s.connect_kind === "api_key"
    if (asksForCredential) {
      /**
       * The page that issues this credential, in order of how directly it answers the question.
       *
       * The vendor's own site first, then its source repository, and then — for a browser app
       * only — the origin of the authorization server the sign-in was proven against. That
       * third one matters for the 39 rows that publish neither a website nor a repository:
       * `https://auth.propick.ae` is the host that runs their accounts, so its front page is
       * the honest place to send someone, and it is a host the server itself named rather than
       * one guessed from the server's name.
       */
      const authOrigin = (() => {
        const issuer = s.auth?.authorization_servers?.[0]
        if (!issuer) return undefined
        try {
          return new URL(issuer).origin
        } catch {
          return undefined
        }
      })()
      /**
       * The last resort: the host the endpoint itself answers on.
       *
       * A handful of rows publish no website, no repository and no authorization server, so
       * there is nothing recorded to link to — but the server does answer somewhere, and that
       * host is a real page run by whoever operates the server. It is the honest floor: not a
       * guessed console path, just the site the user is already talking to. A template endpoint
       * has no host to take, so it is skipped rather than producing `https://{your-host}`.
       */
      const endpointOrigin = (() => {
        if (!s.url || /\{[^}]+\}/.test(s.url)) return undefined
        try {
          return new URL(s.url).origin
        } catch {
          return undefined
        }
      })()
      const page =
        s.website ??
        s.repository ??
        packagePage(s.package) ??
        (s.connect_kind === "oauth_browser" ? authOrigin : undefined) ??
        endpointOrigin
      if (page) entry.consoleUrl = page
    }
    if (Object.keys(entry).length > 0) details[s.id] = entry
  }

  const detailTs = `// Copyright (c) 2026 onelpawarai. All rights reserved.

// Generated by scripts/build-catalog.mjs — do not edit by hand.
//
// What the panel needs to connect a row that asks for a value before it will run, keyed by
// server id. A row absent from this map needs nothing typed: press Connect and its tools
// arrive. Keeping it sparse is what stops ${Object.keys(details).length} short entries from
// becoming ${servers.length} mostly-empty ones.

export interface ConnectDetail {
  /** environment variables a local package reads before it will start */
  env?: { name: string; description?: string; secret?: boolean; url?: string }[]
  /** a remote endpoint still holding a {placeholder} the user must fill */
  urlTemplate?: string
  /** for a browser sign-in: whether the server registers its own client, so nothing is asked */
  selfRegisters?: boolean
  /** the discovery document a browser sign-in was proven against, shown on Details */
  metadataUrl?: string
  /** the header a pasted key travels in, when it is not the default Bearer */
  authKind?: string
  /** the page that issues the client ID or key this row asks for */
  consoleUrl?: string
}

export const connectDetails: Record<string, ConnectDetail> = ${JSON.stringify(details)}
`
  await writeFile(join(CATALOG, "connect-detail.ts"), detailTs)

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
}

main().catch((error) => {
  process.stderr.write(`build-catalog failed: ${error?.message ?? error}\n`)
  process.exit(1)
})
