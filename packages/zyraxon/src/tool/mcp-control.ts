// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * AGENT-CALLABLE MCP CONTROL TOOLS
 *
 * The MCP Hub panel lets a human browse the catalog and press Connect. These three
 * tools give the model the same reach from inside a session:
 *
 * - mcp_catalog  which apps exist and what each one needs before it can be used
 * - mcp_status   which servers are live right now, and the real error for the dead ones
 * - mcp_connect  bring one online, running the same OAuth handshake the UI runs
 *
 * Every status reported here is read from the MCP service itself rather than from any
 * UI state, so what the model is told matches what the panel shows. The catalog is the
 * same seed list the panel renders, so the ids it hands out are the ids mcp_connect takes.
 */

import { ConfigMCPV1 } from "@zyraxon-ai/core/v1/config/mcp"
import { Cause, Effect, Exit, Schema } from "effect"
import { Tool } from "../tool/tool"
import { Config } from "@/config/config"
import { MCP } from "@/mcp"
import { McpCatalog } from "@/mcp/catalog"
import { allSeedApps, type AppEntry } from "../../../../MCP Hub/catalog/seed"

type Metadata = { [key: string]: unknown }

/** How long a person realistically needs to read a consent page and press Allow. */
const AUTH_WINDOW = "4 minutes"

/** Remote servers get this per-request budget; a cold hosted server needs room to negotiate. */
const REMOTE_TIMEOUT_MS = 30_000

const AUTH_MEANING = {
  oauth: "browser sign-in. The server opens the consent page itself and waits for the user to approve it.",
  none: "no sign-in at all.",
  token: "needs an API key the user has to type. You cannot supply it and this tool will not fake it.",
  local: "runs on this machine and is declared by ZYRAXON's own config.",
} as const satisfies Record<AppEntry["kind"], string>

const CATALOG_DESCRIPTION = `List the MCP (Model Context Protocol) apps ZYRAXON can connect to.

CHECK THIS BEFORE YOU SAY YOU CANNOT DO SOMETHING. Most "I cannot reach that service" tasks are one
of these apps away: Notion, Slack, GitHub, Stripe, Sentry, Figma, Gmail, Google Drive, Linear,
Supabase, YouTube and roughly 70 more. The right move is to find the app here, connect it with
mcp_connect, and then use the tools it hands you. Never treat a missing built-in tool as a dead end.

Returns each app's id (the exact value mcp_connect wants), name, category, description, auth kind,
who runs the server, and whether it is already connected.

Auth kind:
- oauth: browser sign-in; the server opens the consent page and waits for the user to approve it
- none: no sign-in at all
- token: needs an API key only the user can create and type
- local: runs on this machine

Narrow the result with search (matches name, id, description and category) and category, so you pull
the few apps you need instead of all ${allSeedApps().length}.`

const STATUS_DESCRIPTION = `Report the live state of every configured MCP (Model Context Protocol) server.

USE THIS TO CHECK BEFORE YOU CLAIM A CAPABILITY OR DEBUG A MISSING TOOL. An MCP server contributes
tools to this session under the name sanitized_server_tool, so a server reported as connected here
is the reason those tools exist. A failed server carries the server's real error message, not a
guess, so quote it rather than paraphrasing it.

Returns, per server: status (connected, failed, needs_auth, needs_client_registration or disabled),
the error text when there is one, the live tool count, the tool names a connected server
contributed, and for a server waiting on sign-in, whether stored credentials are missing or expired.

Pass server to inspect just one.`

const CONNECT_DESCRIPTION = `Connect a catalogued MCP app so the tools it provides become usable in this session.

WHEN: the user asks for something that needs a third-party service (read Notion, post to Slack,
query Stripe, open a Figma file, drive a service API) and that service is not already connected.
Check mcp_status first; if the server is already connected, do not call this.

HOW EACH AUTH KIND IS HANDLED - read this before you call:
- oauth: the real handshake runs here. The server opens the user's browser and this call stays
  open until the user approves the app. Tell the user to approve it in the browser that just
  opened, then carry on with the task they asked for.
- none: connects straight away, no sign-in.
- token: NOT possible from here and this tool will not pretend otherwise. The key must be created
  and typed by the user, so this returns the exact steps and the URL to create the key. Do not ask
  the user to paste a key into the chat, do not claim the app is connected, and do not report the
  task as impossible - ask them to finish it in the MCP Hub connect popup and continue afterwards.
- local: these are declared by ZYRAXON's own config, so this only wakes one that is declared.

The server is written to ZYRAXON's config, so it stays connected after a restart.

Returns the resulting status with the live tool count on success, or the server's real error on
failure. An unknown app name comes back with close matches to retry with.`

// --- mcp_catalog ---

const CatalogParameters = Schema.Struct({
  search: Schema.optional(Schema.String).annotate({
    description: "Match against app name, id, description and category, case-insensitive",
  }),
  category: Schema.optional(Schema.String).annotate({
    description: 'Exact category, e.g. "Communication", "Database", "Developer", "Monitoring", "Search"',
  }),
  kind: Schema.optional(Schema.String).annotate({
    description: "Filter by auth kind: oauth, none, token or local",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Maximum apps to return (default 25)",
  }),
})

export const McpCatalogTool = Tool.define<typeof CatalogParameters, Metadata, MCP.Service>(
  "mcp_catalog",
  Effect.gen(function* () {
    const mcp = yield* MCP.Service
    return {
      description: CATALOG_DESCRIPTION,
      parameters: CatalogParameters,
      execute: (params) =>
        Effect.gen(function* () {
          const apps = allSeedApps()
          const matched = apps.filter((app) => keep(app, params))
          const status = yield* mcp.status()
          const shown = matched.slice(0, params.limit ?? 25)
          return {
            title: `${shown.length} of ${apps.length} MCP apps`,
            metadata: { total: apps.length, matched: matched.length, shown: shown.length },
            output: JSON.stringify(
              {
                total: apps.length,
                matched: matched.length,
                shown: shown.length,
                categories: Array.from(new Set(apps.map((app) => app.category))).sort(),
                apps: shown.map((app) => ({
                  id: app.id,
                  name: app.name,
                  category: app.category,
                  description: app.description,
                  auth: app.kind,
                  authMeaning: AUTH_MEANING[app.kind],
                  via: app.via ?? null,
                  connected: status[app.id]?.status === "connected",
                })),
                next: "Pass an app id to mcp_connect to bring it online.",
              },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

function keep(app: AppEntry, params: Schema.Schema.Type<typeof CatalogParameters>) {
  const needle = params.search?.trim().toLowerCase()
  if (params.category && app.category.toLowerCase() !== params.category.trim().toLowerCase()) return false
  if (params.kind && app.kind !== params.kind.trim().toLowerCase()) return false
  if (!needle) return true
  return (
    app.name.toLowerCase().includes(needle) ||
    app.id.includes(needle) ||
    app.category.toLowerCase().includes(needle) ||
    app.description.toLowerCase().includes(needle)
  )
}

// --- mcp_status ---

const StatusParameters = Schema.Struct({
  server: Schema.optional(Schema.String).annotate({
    description: "Report only this server, by its configured name",
  }),
})

export const McpStatusTool = Tool.define<typeof StatusParameters, Metadata, MCP.Service>(
  "mcp_status",
  Effect.gen(function* () {
    const mcp = yield* MCP.Service
    return {
      description: STATUS_DESCRIPTION,
      parameters: StatusParameters,
      execute: (params) =>
        Effect.gen(function* () {
          const status = yield* mcp.status()
          const tools = Object.keys(yield* mcp.tools())
          const names = Object.keys(status).sort()
          const selected = params.server?.trim()
          const listed = selected ? names.filter((name) => name === selected) : names
          const entries = yield* Effect.forEach(listed, (name) => describe(mcp, name, status[name], tools))
          const connected = entries.filter((entry) => entry.status === "connected")
          return {
            title: `${connected.length}/${entries.length} MCP servers connected`,
            metadata: {
              total: names.length,
              connected: connected.length,
              tools: entries.reduce((sum, entry) => sum + entry.toolCount, 0),
            },
            output: JSON.stringify(
              {
                ...(listed.length === 0 ? { error: `No MCP server named "${selected ?? params.server}" is configured.` } : {}),
                total: entries.length,
                connected: connected.map((entry) => entry.server),
                notConnected: entries.filter((entry) => entry.status !== "connected").map((entry) => entry.server),
                toolsAvailable: entries.reduce((sum, entry) => sum + entry.toolCount, 0),
                servers: entries,
                next: "Use mcp_catalog to find an app that is not configured yet, then mcp_connect to connect it.",
              },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

interface Entry {
  server: string
  status: string
  error?: string
  auth?: string
  toolCount: number
  tools?: string[]
}

const describe = Effect.fn("McpControl.describe")(function* (
  mcp: MCP.Interface,
  name: string,
  status: MCP.Status | undefined,
  tools: string[],
) {
  const current = status ?? { status: "disabled" as const }
  const names = serverTools(tools, name)
  const entry: Entry = {
    server: name,
    status: current.status,
    ...(current.status === "failed" ? { error: readError(current) } : {}),
    toolCount: names.length,
    ...(names.length > 0 ? { tools: names } : {}),
  }
  if (current.status !== "needs_auth") return entry
  return { ...entry, auth: yield* mcp.getAuthStatus(name) }
})

// --- mcp_connect ---

const ConnectParameters = Schema.Struct({
  app: Schema.String.annotate({
    description: 'App name or id from mcp_catalog, e.g. "notion", "Notion", "sentry"',
  }),
})

export const McpConnectTool = Tool.define<typeof ConnectParameters, Metadata, MCP.Service | Config.Service>(
  "mcp_connect",
  Effect.gen(function* () {
    const mcp = yield* MCP.Service
    const config = yield* Config.Service
    return {
      description: CONNECT_DESCRIPTION,
      parameters: ConnectParameters,
      execute: (params) =>
        Effect.gen(function* () {
          const apps = allSeedApps()
          const wanted = params.app.trim()
          const app = apps.find(
            (item) => item.id === wanted.toLowerCase() || item.name.toLowerCase() === wanted.toLowerCase(),
          )
          if (!app) return unknownApp(apps, wanted)

          const existing = (yield* mcp.status())[app.id]
          if (existing?.status === "connected") return yield* report(mcp, app, existing, "Already connected.")
          if (app.kind === "token") return needsUser(app)
          if (app.kind === "local") return yield* local(mcp, app)

          const entry = serverEntry(app)
          const global = yield* config.getGlobal()
          yield* config.updateGlobal({ ...global, mcp: { ...global.mcp, [app.id]: entry } })
          const added = (yield* mcp.add(app.id, entry)).status
          const first = isStatus(added) ? added : added[app.id]
          if (first.status !== "needs_auth") return yield* report(mcp, app, first)

          // The server owns the browser: it opens the consent page and this call blocks
          // until the user answers it, exactly as the Hub's connect button does.
          const exit = yield* mcp.authenticate(app.id).pipe(Effect.timeout(AUTH_WINDOW), Effect.exit)
          if (Exit.isSuccess(exit)) return yield* report(mcp, app, exit.value, "Signed in through the browser.")
          if (Cause.hasInterruptsOnly(exit.cause)) return yield* Effect.interrupt
          return yield* report(mcp, app, { status: "failed", error: squash(exit) })
        }),
    }
  }),
)

function unknownApp(apps: AppEntry[], wanted: string) {
  return {
    title: `Unknown MCP app "${wanted}"`,
    metadata: { app: wanted, connected: false },
    output: JSON.stringify(
      {
        error: `No MCP app named "${wanted}". The catalog has ${apps.length} apps.`,
        closeMatches: closeMatches(apps, wanted),
        next: "Call mcp_catalog with a search term, then retry mcp_connect with the id it returns.",
      },
      null,
      2,
    ),
  }
}

function needsUser(app: AppEntry) {
  return {
    title: `${app.name} needs an API key from the user`,
    metadata: { app: app.id, connected: false, requiresUserAction: true },
    output: JSON.stringify(
      {
        app: app.id,
        name: app.name,
        connected: false,
        needsUserAction: true,
        why: `${app.name} answers 401 and advertises no way to sign in, so it needs a key. You cannot type a key on the user's behalf and you must not ask them to paste one into the chat.`,
        steps: [
          `Open ${app.tokenUrl ?? "the app's developer settings"} and create a token.`,
          app.scope ? `Grant these scopes: ${app.scope}.` : "Grant the scopes the app documents.",
          "Open the MCP Hub connect popup in ZYRAXON, pick this app, and paste the key there.",
          "Then continue the task - the app's tools become usable as soon as it connects.",
        ],
        next: "Tell the user exactly this. Do not report the task as impossible.",
      },
      null,
      2,
    ),
  }
}

const local = Effect.fn("McpControl.local")(function* (mcp: MCP.Interface, app: AppEntry) {
  const exit = yield* mcp.connect(app.id).pipe(Effect.exit)
  if (Exit.isFailure(exit)) {
    if (Cause.hasInterruptsOnly(exit.cause)) return yield* Effect.interrupt
    return yield* report(mcp, app, { status: "failed", error: squash(exit) })
  }
  const status = (yield* mcp.status())[app.id]
  if (!status) {
    return yield* report(mcp, app, {
      status: "failed",
      error: `"${app.id}" is a local server and is not declared in this ZYRAXON's config, so there is nothing to wake. Local servers ship with the app.`,
    })
  }
  return yield* report(mcp, app, status)
})

function serverEntry(app: AppEntry): ConfigMCPV1.Info {
  if (!app.url) throw new Error(`MCP app "${app.id}" has no endpoint in the catalog`)
  const base = { type: "remote", url: app.url, enabled: true, timeout: REMOTE_TIMEOUT_MS } as const
  if (app.kind !== "oauth") return base
  return { ...base, oauth: app.scope ? { scope: app.scope } : {} }
}

// `add` answers with a single status for this server, or the whole map once the
// caller already had one registered, so both shapes have to be read.
function isStatus(value: MCP.Status | Record<string, MCP.Status>): value is MCP.Status {
  return "status" in value
}

const report = Effect.fn("McpControl.report")(function* (
  mcp: MCP.Interface,
  app: AppEntry,
  status: MCP.Status,
  note?: string,
) {
  const names = serverTools(Object.keys(yield* mcp.tools()), app.id)
  const connected = status.status === "connected"
  return {
    title: connected ? `${app.name} connected` : `${app.name} did not connect`,
    metadata: {
      app: app.id,
      connected,
      toolCount: names.length,
      ...(connected ? {} : { error: readError(status) }),
    },
    output: JSON.stringify(
      {
        app: app.id,
        name: app.name,
        category: app.category,
        auth: app.kind,
        connected,
        status: status.status,
        ...(connected ? { toolCount: names.length, tools: names } : { error: readError(status) }),
        ...(note ? { note } : {}),
        next: connected
          ? "Its tools are usable now. Call them by their sanitized_server_tool name."
          : "Report the real error above. Do not retry blindly and do not claim it works.",
      },
      null,
      2,
    ),
  }
})

function serverTools(tools: string[], server: string) {
  const prefix = McpCatalog.sanitize(server) + "_"
  return tools.filter((id) => id.startsWith(prefix))
}

function closeMatches(apps: AppEntry[], wanted: string) {
  const needle = wanted.toLowerCase()
  const term = needle.split(/[\s_-]+/)[0] ?? needle
  return apps
    .map((app) => ({
      app,
      score:
        (app.id.includes(needle) || app.name.toLowerCase().includes(needle) ? 10 : 0) +
        (app.id.startsWith(term) ? 5 : 0) +
        (app.id.split("-")[0].startsWith(term) ? 3 : 0) +
        (app.category.toLowerCase().includes(needle) ? 2 : 0),
    }))
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => ({
      id: entry.app.id,
      name: entry.app.name,
      category: entry.app.category,
      auth: entry.app.kind,
    }))
}

function readError(status: MCP.Status) {
  if ("error" in status && status.error) return status.error
  if (status.status === "needs_auth") return "waiting on the user to sign in"
  if (status.status === "needs_client_registration")
    return "the server does not support dynamic client registration, so a clientId has to be added to its config"
  return `status is ${status.status}`
}

function squash(exit: Exit.Failure<unknown, unknown>) {
  const error = Cause.squash(exit.cause)
  return error instanceof Error ? error.message : String(error)
}