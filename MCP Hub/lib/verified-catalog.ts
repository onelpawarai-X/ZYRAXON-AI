// Copyright (c) 2026 onelpawarai. All rights reserved.

// The verified catalog, for the panel.
//
// Every row in here answered a real MCP handshake — the verifier ran `initialize` and
// `tools/list` against it, or followed its 401 to a working discovery document, and only
// then wrote it down. That is what separates this list from the registry's own: the
// registry publishes what publishers claim, and this publishes what answered.
//
// The panel draws one row per server from a compact index, which carries the endpoint and
// the launch command as well as the display fields. Nothing here is fetched at runtime.

import type { AppEntry } from "../catalog/seed"
import type { VerifiedRow } from "../catalog/verified-index"
import type { ConnectDetail } from "../catalog/connect-detail"
import type { ConnectKind } from "../catalog/verified-types"

/**
 * What the user has to do, in the order they do it.
 *
 * This is the sentence the card exists to show. "OAuth" tells a user nothing; "your
 * browser opens, you press Allow, it connects itself" tells them what will happen and
 * whether they need anything in hand. The steps are derived from the connect kind that
 * was actually observed, not from what the server's metadata claims.
 */
export interface ConnectStep {
  /** what happens, in plain words */
  what: string
  /** what the user must have ready before starting, if anything */
  needs?: string
  /** true when a browser window is part of this flow */
  browser: boolean
}

export const CONNECT_STEPS: Record<ConnectKind, ConnectStep> = {
  no_auth: {
    what: "Press Connect. Nothing else is asked for — no sign-in, no key.",
    browser: false,
  },
  oauth_browser: {
    what: "Press Connect, your browser opens the provider's own sign-in page, you press Allow, and it connects itself.",
    needs: "A browser signed in to the provider's account",
    browser: true,
  },
  api_key: {
    what: "Press Connect and paste the key this server asks for. It is stored locally and sent straight to the server.",
    needs: "An API key from the provider's dashboard",
    browser: false,
  },
  url_input: {
    what: "Press Connect and enter the address of your own instance. The server needs a value only you have.",
    needs: "Your own instance URL",
    browser: false,
  },
  unknown: {
    what: "Press Connect. This server did not say what it needs, so the first attempt is also the test.",
    browser: false,
  },
}

/** The step for a connect kind, defaulting to the honest "we do not know" wording. */
export function connectStepFor(kind: ConnectKind): ConnectStep {
  return CONNECT_STEPS[kind] ?? CONNECT_STEPS.unknown
}

/**
 * How strong the proof behind a row is, said plainly.
 *
 * A card that says "verified" without qualification claims the same thing for a server
 * whose tools were listed and called and for one that merely answered a 401 with a
 * discovery document. The two are not the same, so the level is shown.
 */
export const VERIFICATION_LABELS: Record<string, string> = {
  full: "Tools listed and called",
  tools_list: "Tools listed",
  auth_discovery: "Sign-in confirmed",
  launched: "Started, then asked for a key",
  declared: "Reachable, needs your value",
  unknown: "Answered",
}

/** One server, as the panel works with it. */
export interface VerifiedHit {
  id: string
  name: string
  category: string
  install_kind: VerifiedRow[3]
  connect_kind: ConnectKind
  verification: string
  tool_count: number
  needs_login: boolean
  /** the endpoint a remote server answered on */
  url: string
  /** the package a local server launches from, or undefined for a remote */
  package?: { registry_type: string; identifier: string; version?: string }
  /** the server's own site, when the registry publishes one */
  website: string
  /** its source repository, when the registry publishes one */
  repository: string
}

const rowToHit = (row: VerifiedRow): VerifiedHit => ({
  id: row[0],
  name: row[1],
  category: row[2],
  install_kind: row[3],
  connect_kind: row[4],
  verification: row[5],
  tool_count: row[6],
  needs_login: row[7] === 1,
  url: row[8],
  package: row[9] ? { registry_type: row[9], identifier: row[10], version: row[11] || undefined } : undefined,
  website: row[12] ?? "",
  repository: row[13] ?? "",
})

let cached: VerifiedRow[] | undefined

/**
 * Load the compact index once and keep it.
 *
 * The import is dynamic so the rows are a separate chunk: the panel opens for the curated
 * apps without paying for a catalog most visits never scroll to.
 */
export async function loadVerifiedRows(): Promise<VerifiedRow[]> {
  if (cached) return cached
  const module = await import("../catalog/verified-index")
  cached = module.verifiedRows
  return cached
}

let cachedDetails: Record<string, ConnectDetail> | undefined

/**
 * Load the sparse connect-detail map once and keep it.
 *
 * Only the rows that ask for a value appear in it, so this is a small module beside the
 * index rather than a field repeated on every row. A row that is absent needs nothing typed,
 * which is the press-and-go majority.
 */
export async function loadConnectDetails(): Promise<Record<string, ConnectDetail>> {
  if (cachedDetails) return cachedDetails
  const module = await import("../catalog/connect-detail")
  cachedDetails = module.connectDetails
  return cachedDetails
}

/** The connect detail for one server, or undefined when it needs nothing typed. */
export async function connectDetailFor(id: string): Promise<ConnectDetail | undefined> {
  return (await loadConnectDetails())[id]
}

/**
 * Search the verified catalog.
 *
 * Name first, because that is what somebody typing "postgres" is looking for, then the id
 * so a full registry name still matches. Rows with more tools sort ahead of rows with
 * fewer when both match, on the theory that a server with twenty tools is the one they
 * meant more often than one with a single tool of the same name.
 */
export async function searchVerified(term: string, limit = 40): Promise<VerifiedHit[]> {
  const needle = term.trim().toLowerCase()
  const rows = await loadVerifiedRows()
  if (!needle) {
    return rows
      .slice()
      .sort((a, b) => b[6] - a[6])
      .slice(0, limit)
      .map(rowToHit)
  }

  const starts: VerifiedRow[] = []
  const contains: VerifiedRow[] = []
  for (const row of rows) {
    const name = row[1].toLowerCase()
    if (name.startsWith(needle)) starts.push(row)
    else if (name.includes(needle) || row[0].toLowerCase().includes(needle)) contains.push(row)
    if (starts.length + contains.length >= limit * 6) break
  }

  return [...starts, ...contains]
    .sort((a, b) => b[6] - a[6])
    .slice(0, limit)
    .map(rowToHit)
}

/** How many verified servers are in the catalog, for the header count. */
export async function verifiedCount(): Promise<number> {
  return (await loadVerifiedRows()).length
}

/**
 * Turn a verified hit into the shape the panel's connect flow already speaks.
 *
 * The panel has always connected `AppEntry` values, and that flow — resolve, write the
 * config, start the handshake — is the part that works. Rather than build a second connect
 * path for registry servers, they are expressed as AppEntry so they go through exactly the
 * same one. The connect kind that was observed on the wire decides everything:
 *
 *   no_auth       → "none"      press Connect, the tools are there
 *   oauth_browser → "oauth"     the browser opens; a client ID is asked for only when the
 *                               server proved it will not register one itself
 *   api_key       → "local"     a package that reads its key from the environment, so the
 *                               env form collects it — not the single-token box, which
 *                               would send the key somewhere the package never looks
 *   url_input     → "instance"  the endpoint is a template; the user's own host fills it
 *
 * A local row's launch command is rebuilt from the package the verifier proved, so what
 * runs on the user's machine is the same command that answered the handshake.
 */
export function verifiedHitToApp(hit: VerifiedHit, detail?: ConnectDetail): AppEntry {
  // An endpoint that is still a template is an instance the user supplies, whatever else
  // the row says. Deciding this first is what keeps a `url_input` row out of the browser
  // flow it was previously mapped to.
  const template = detail?.urlTemplate ?? (hit.url && /\{[^}]+\}/.test(hit.url) ? hit.url : undefined)
  if (template) {
    return {
      id: hit.id,
      name: hit.name,
      description: describe(hit),
      category: hit.category || "General",
      kind: "instance",
      urlTemplate: template,
      color: "#6366f1",
      note: "This server runs at your own address. Enter it and ZYRAXON connects to it.",
    }
  }

  // A local package: the launch command is what the verifier started, and any credentials
  // come from the environment variables the package declared.
  if (hit.package) {
    const command = commandFor(hit.package)
    if (command) {
      const env = (detail?.env ?? []).map((entry) => ({
        key: entry.name,
        label: entry.name,
        ...(entry.description ? { placeholder: firstLine(entry.description) } : {}),
        ...(entry.secret ? { secret: true } : {}),
        // Where this particular variable comes from. One link per variable, because the
        // variables of a single server can be issued in different places — an Unraid card
        // wants the address of the user's own server for one box and an API key for the next.
        ...(entry.url ? { url: entry.url } : {}),
      }))
      return {
        id: hit.id,
        name: hit.name,
        description: describe(hit),
        category: hit.category || "General",
        kind: "local",
        command,
        ...(env.length > 0 ? { env } : {}),
        ...(detail?.consoleUrl ? { consoleUrl: detail.consoleUrl } : {}),
        ...(hit.website ? { website: hit.website } : {}),
        ...(hit.repository ? { repository: hit.repository } : {}),
        color: "#6366f1",
        note:
          env.length > 0
            ? "Runs on your machine and reads the credentials below from its environment."
            : "Runs on your machine from its published package. Nothing is asked for.",
      }
    }
  }

  if (hit.connect_kind === "api_key") {
    // A key this server wants but no package to run it from: a pasted token over HTTP.
    return {
      id: hit.id,
      name: hit.name,
      description: describe(hit),
      category: hit.category || "General",
      kind: "token",
      url: hit.url || undefined,
      ...(detail?.consoleUrl ? { tokenUrl: detail.consoleUrl, consoleUrl: detail.consoleUrl } : {}),
      ...(hit.website ? { website: hit.website } : {}),
      ...(hit.repository ? { repository: hit.repository } : {}),
      color: "#6366f1",
      note: "Paste the key this server asks for. It is stored locally and sent straight to the server.",
    }
  }

  const kind = hit.connect_kind === "no_auth" ? "none" : "oauth"
  // A browser app is asked for a client ID only when the verification proved it publishes no
  // registration endpoint. Every other one registers itself, so the press goes straight to
  // the browser with nothing typed in.
  const needsClientId = hit.connect_kind === "oauth_browser" && detail?.selfRegisters === false
  return {
    id: hit.id,
    name: hit.name,
    description: describe(hit),
    category: hit.category || "General",
    kind,
    url: hit.url || undefined,
    ...(needsClientId ? { needsClientId: true } : {}),
    ...(needsClientId && detail?.consoleUrl ? { consoleUrl: detail.consoleUrl } : {}),
    ...(hit.website ? { website: hit.website } : {}),
    ...(hit.repository ? { repository: hit.repository } : {}),
    color: "#6366f1",
    iconDomain: hit.url ? safeHost(hit.url) : undefined,
    note:
      hit.connect_kind === "oauth_browser"
        ? needsClientId
          ? "Sign-in opens in your browser. This vendor issues its own client, so you paste a client ID first."
          : "Sign-in opens in your browser. The endpoint answered a real MCP handshake."
        : "No sign-in and no key. The endpoint answered a real MCP handshake.",
  }
}

/** A one-line description: how many tools, and how far the proof went. */
function describe(hit: VerifiedHit): string {
  const tools = hit.tool_count > 0 ? `${hit.tool_count} tools` : "sign-in required"
  return `${tools} · verified ${hit.verification}`
}

/** The first sentence of a description, for a placeholder that fits in one input. */
function firstLine(text: string): string {
  const cut = text.split(/(?<=[.!?])\s/)[0] ?? text
  return cut.length > 120 ? cut.slice(0, 117) + "…" : cut
}

/** The launch command for a package, matching what the verifier proved works. */
function commandFor(pkg: { registry_type: string; identifier: string; version?: string }): { command: string; args: string[] } | undefined {
  switch (pkg.registry_type) {
    case "npm":
      return { command: "npx", args: ["-y", pkg.version ? `${pkg.identifier}@${pkg.version}` : pkg.identifier] }
    case "pypi":
      return { command: "uvx", args: [pkg.version ? `${pkg.identifier}==${pkg.version}` : pkg.identifier] }
    case "oci":
      return { command: "docker", args: ["run", "-i", "--rm", pkg.identifier] }
    default:
      return undefined
  }
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}
