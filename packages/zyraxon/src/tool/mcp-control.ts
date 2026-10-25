// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * AGENT-CALLABLE MCP CONTROL TOOLS
 *
 * The MCP Hub panel lets a human browse the catalog and press Connect. These three
 * tools give the model the same reach from inside a session:
 *
 * - mcp_catalog    which apps exist and what each one needs before it can be used
 * - mcp_status     which servers are live right now, and the real error for the dead ones
 * - mcp_connect    bring one online, running the same OAuth handshake the UI runs
 * - mcp_disconnect take one offline and forget its credentials
 *
 * Every auth kind is reachable from here. OAuth opens the consent page and holds until the
 * person approves it. A token app has its key page opened in the browser too: the model
 * brings the URL up, the person creates the key, and the model takes it and connects — no
 * manual trip through the Hub popup required.
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
import { activateServer, activatedServers, deactivateServer } from "@/mcp/activation"
import { allSeedApps, type AppEntry } from "../../../../MCP Hub/catalog/seed"
import { fillEndpoint } from "../../../../MCP Hub/lib/endpoint"

type Metadata = { [key: string]: unknown }

/** How long a person realistically needs to read a consent page and press Allow. */
const AUTH_WINDOW = "4 minutes"

/** Remote servers get this per-request budget; a cold hosted server needs room to negotiate. */
const REMOTE_TIMEOUT_MS = 30_000

const AUTH_MEANING = {
  oauth: "browser sign-in. The server opens the consent page itself and waits for the user to approve it.",
  none: "no sign-in at all.",
  token: "an API key. This tool opens the page where the key is created and takes the key from the user.",
  local: "runs on this machine and is declared by ZYRAXON's own config.",
  instance: "needs your own address. The endpoint holds a placeholder, and this tool asks for the host before connecting.",
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
- token: an API key; mcp_connect opens the page where the key is created and takes the key
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

Connected and injected are reported apart. A server can be running without this session
carrying its tools: only servers this session connected appear in the tool list, so a server
under connectedButNotInjected needs mcp_connect before its tools can be called.

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
- token: call once without the token. That opens the page where the key is created in the user's
  browser and returns the steps. Ask the user for the key, then call this again on the same app
  with token set to exactly what they gave you, and the connection is made in one step. Never
  invent a key, never guess one, and never claim the app is connected before this returns
  connected: true.
- local: these are declared by ZYRAXON's own config, so this only wakes one that is declared.

The server is written to ZYRAXON's config, so it stays connected after a restart.

Returns the resulting status with the live tool count on success, or the server's real error on
failure. An unknown app name comes back with close matches to retry with. Use mcp_disconnect to
take a server offline again and forget its credentials.`

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
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const status = yield* mcp.status()
          const tools = Object.keys(yield* mcp.tools())
          const names = Object.keys(status).sort()
          const selected = params.server?.trim()
          const listed = selected ? names.filter((name) => name === selected) : names
          // A server can be up without this session carrying its tools, so the two
          // facts are reported apart: `connected` is the process, `injected` is whether
          // the tools are in this session's list right now.
          const activated = activatedServers(ctx.sessionID)
          const entries = yield* Effect.forEach(listed, (name) => describe(mcp, name, status[name], tools))
          const connected = entries.filter((entry) => entry.status === "connected")
          const injected = connected.filter((entry) => activated.has(entry.server))
          const injectable = connected.filter((entry) => !activated.has(entry.server))
          return {
            title: `${connected.length}/${entries.length} MCP servers connected, ${injected.length} in this session`,
            metadata: {
              total: names.length,
              connected: connected.length,
              injected: injected.length,
              tools: injected.reduce((sum, entry) => sum + entry.toolCount, 0),
            },
            output: JSON.stringify(
              {
                ...(listed.length === 0 ? { error: `No MCP server named "${selected ?? params.server}" is configured.` } : {}),
                total: entries.length,
                connected: connected.map((entry) => entry.server),
                notConnected: entries.filter((entry) => entry.status !== "connected").map((entry) => entry.server),
                injectedInThisSession: injected.map((entry) => entry.server),
                connectedButNotInjected: injectable.map((entry) => entry.server),
                toolsAvailable: injected.reduce((sum, entry) => sum + entry.toolCount, 0),
                servers: entries,
                next:
                  injectable.length > 0
                    ? "A server listed under connectedButNotInjected is running but its tools are not in this session. Call mcp_connect on it to bring its tools in."
                    : "Use mcp_catalog to find an app that is not configured yet, then mcp_connect to connect it.",
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
  token: Schema.optional(Schema.String).annotate({
    description:
      "API key for a token app. Omit it on the first call - that opens the page where the key is created in the user's browser. Then call again with token set to exactly the key the user gave you.",
  }),
  clientId: Schema.optional(Schema.String).annotate({
    description:
      "OAuth client ID for a vendor that only issues clients from its own developer console (Slack, Figma, MongoDB, Stripe and about a dozen others). Omit it on the first call: that opens the vendor's console, lists the exact steps, and asks the user for the ID. Then call again with clientId set to exactly what they gave you.",
  }),
  clientSecret: Schema.optional(Schema.String).annotate({
    description:
      "OAuth client secret, when the vendor's console showed one next to the client ID. Most of these apps work with the ID alone.",
  }),
  address: Schema.optional(Schema.String).annotate({
    description:
      "The host or full URL for an `instance` app, whose endpoint holds a {placeholder}. Omit it on the first call: that returns the template and the variable name to fill. Then call again with address set to the user's own host, e.g. `myteam.example.com`.",
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
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const apps = allSeedApps()
          const wanted = params.app.trim()
          const app = apps.find(
            (item) => item.id === wanted.toLowerCase() || item.name.toLowerCase() === wanted.toLowerCase(),
          )
          if (!app) return unknownApp(apps, wanted)

          const existing = (yield* mcp.status())[app.id]
          if (existing?.status === "connected") return yield* report(mcp, app, existing, "Already connected.", ctx.sessionID)
          if (app.kind === "token") return yield* tokenFlow(mcp, config, app, params.token?.trim(), ctx.sessionID)
          if (app.kind === "local") return yield* local(mcp, app, ctx.sessionID)
          if (app.kind === "instance") return yield* instanceFlow(mcp, config, app, params.address?.trim(), ctx.sessionID)

          const clientId = params.clientId?.trim()
          const clientSecret = params.clientSecret?.trim()

          // A vendor that only issues clients from its own console needs one before any
          // sign-in link exists, because there is no client to ask for consent with. The
          // console is opened, the exact steps are handed over, and the second call
          // finishes the job — the same two-call shape a key app already uses.
          if (!clientId && !app.clientId && needsClientId(app)) return yield* needsClientIdFlow(mcp, app)

          const entry = serverEntry(app, undefined, clientId ?? app.clientId, clientSecret)
          const global = yield* config.getGlobal()
          yield* config.updateGlobal({ ...global, mcp: { ...global.mcp, [app.id]: entry } })
          const added = (yield* mcp.add(app.id, entry)).status
          const first = isStatus(added) ? added : added[app.id]

          // A remote OAuth server answers the very first request with 401, and some
          // transports report that as a plain failure instead of `needs_auth`. Falling
          // out there means the browser never opens and the tool answers "undefined
          // error", which is what made every standards-compliant server look broken. So
          // an OAuth app with no stored token is sent to the browser even when the probe
          // failed, and a server that is genuinely unreachable still says so:
          // `authenticate` reports the transport error it hit. A server that already
          // holds a token must not re-prompt — a bad token there is reported as the
          // failure it is.
          const signedIn = yield* mcp.hasStoredTokens(app.id)
          if (first.status === "connected") return yield* report(mcp, app, first, undefined, ctx.sessionID)
          if (first.status === "failed" && signedIn) return yield* report(mcp, app, first, undefined, ctx.sessionID)
          if (first.status === "disabled") return yield* report(mcp, app, first, undefined, ctx.sessionID)

          // The server owns the browser: it opens the consent page and this call blocks
          // until the user answers it, exactly as the Hub's connect button does.
          const exit = yield* mcp.authenticate(app.id).pipe(Effect.timeout(AUTH_WINDOW), Effect.exit)
          if (Exit.isSuccess(exit)) return yield* report(mcp, app, exit.value, "Signed in through the browser.", ctx.sessionID)
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

/**
 * The token path, in two calls.
 *
 * Without a key the page that issues one is opened in the person's browser — they are
 * already looking at it when the model asks — and the answer says exactly what to do next.
 * With a key the server is written to config with it and connected immediately, so handing
 * over a key ends with a working server rather than another round of instructions.
 */
const tokenFlow = Effect.fn("McpControl.tokenFlow")(function* (
  mcp: MCP.Interface,
  config: Config.Interface,
  app: AppEntry,
  token: string | undefined,
  sessionID: string,
) {
  if (!token) {
    if (app.tokenUrl) yield* mcp.openUrl(app.tokenUrl).pipe(Effect.ignore)
    return needsToken(app)
  }

  const entry = serverEntry(app, token)
  const global = yield* config.getGlobal()
  yield* config.updateGlobal({ ...global, mcp: { ...global.mcp, [app.id]: entry } })
  const added = (yield* mcp.add(app.id, entry)).status
  const first = isStatus(added) ? added : added[app.id]
  if (first.status === "connected") return yield* report(mcp, app, first, "Connected with the key you provided.", sessionID)
  if (first.status === "failed") return yield* report(mcp, app, first, undefined, sessionID)

  // Declared but not yet live: wake it and read back what actually happened.
  const exit = yield* mcp.connect(app.id).pipe(Effect.timeout(REMOTE_TIMEOUT_MS), Effect.exit)
  if (Exit.isFailure(exit)) {
    if (Cause.hasInterruptsOnly(exit.cause)) return yield* Effect.interrupt
    return yield* report(mcp, app, { status: "failed", error: squash(exit) })
  }
  const status = (yield* mcp.status())[app.id] ?? first
  return yield* report(
    mcp,
    app,
    status,
    status.status === "connected" ? "Connected with the key you provided." : undefined,
    sessionID,
  )
})

function needsToken(app: AppEntry) {
  return {
    title: `${app.name} needs an API key`,
    metadata: { app: app.id, connected: false, requiresUserAction: true, openedKeyPage: !!app.tokenUrl },
    output: JSON.stringify(
      {
        app: app.id,
        name: app.name,
        connected: false,
        needsUserAction: true,
        why: `${app.name} takes an API key rather than a browser sign-in, so the key has to come from the user.`,
        openedInBrowser: app.tokenUrl ?? null,
        steps: [
          `The page where the key is created has been opened in the user's browser${app.tokenUrl ? ` (${app.tokenUrl})` : ""}.`,
          app.scope
            ? `Ask the user to create a key with these scopes: ${app.scope}.`
            : "Ask the user to create a key.",
          "Ask them to send the key to you here.",
          "Then call mcp_connect again on this app with token set to exactly the key they gave you.",
          "Do not claim the app is connected until that call returns connected: true.",
        ],
        next: "Ask the user for the key now, then retry with the token parameter.",
      },
      null,
      2,
    ),
  }
}

/**
 * The two-call flow for a server that runs at the user's own address.
 *
 * The registry records endpoints like `https://{your-host}/mcp` for the servers a person
 * hosts themselves. The first call returns the template and the variable to fill, because
 * there is nothing to connect to yet and asking for the address is the whole answer; the
 * second call writes the completed URL and connects. Without this the agent had no way to
 * reach those rows at all — they fell through to the OAuth branch and failed.
 */
const instanceFlow = Effect.fn("McpControl.instanceFlow")(function* (
  mcp: MCP.Interface,
  config: Config.Interface,
  app: AppEntry,
  address: string | undefined,
  sessionID: string,
) {
  const template = app.urlTemplate ?? app.url ?? ""
  const variable = template.match(/\{([^}]+)\}/)?.[1] ?? "your-host"

  if (!address) {
    return {
      title: `${app.name} needs your own address`,
      metadata: { app: app.id, connected: false, needsUserAction: true, template },
      output: JSON.stringify(
        {
          app: app.id,
          name: app.name,
          connected: false,
          needsUserAction: true,
          why: `${app.name} runs at an address only you know, so the endpoint is a template rather than a fixed URL.`,
          endpointTemplate: template,
          fill: variable,
          example: template.replace(/\{[^}]+\}/g, "myteam.example.com"),
          steps: [
            `Ask the user for the host their instance runs on, which fills \`${variable}\` in \`${template}\`.`,
            "Then call mcp_connect again on this app with address set to exactly what they gave you.",
            "Do not claim the app is connected until that call returns connected: true.",
          ],
          next: "Ask the user for their host, then retry with the address parameter.",
        },
        null,
        2,
      ),
    }
  }

  const entry = serverEntry(app, undefined, undefined, undefined, address)
  const global = yield* config.getGlobal()
  yield* config.updateGlobal({ ...global, mcp: { ...global.mcp, [app.id]: entry } })
  const added = (yield* mcp.add(app.id, entry)).status
  const first = isStatus(added) ? added : added[app.id]
  return yield* report(mcp, app, first ?? { status: "failed", error: "the server did not answer" }, undefined, sessionID)
})

const local = Effect.fn("McpControl.local")(function* (mcp: MCP.Interface, app: AppEntry, sessionID: string) {
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
  return yield* report(mcp, app, status, undefined, sessionID)
})

function serverEntry(app: AppEntry, token?: string, clientId?: string, clientSecret?: string, address?: string): ConfigMCPV1.Info {
  // An instance app's endpoint is a template. The host the user gave fills the placeholder,
  // and the config gets a real URL rather than `https://{your-host}/mcp`, which no transport
  // can open. A bare host is accepted and given a scheme so `myteam.example.com` works too.
  if (app.kind === "instance") {
    const template = app.urlTemplate ?? app.url
    if (!template) throw new Error(`MCP app "${app.id}" is an instance app with no endpoint template`)
    const host = (address ?? "").trim()
    if (!host) throw new Error(`MCP app "${app.id}" needs the user's own address before it can be reached`)
    return { type: "remote", url: fillEndpoint(template, host), enabled: true, timeout: REMOTE_TIMEOUT_MS } as const
  }
  if (!app.url) throw new Error(`MCP app "${app.id}" has no endpoint in the catalog`)
  const base = { type: "remote", url: app.url, enabled: true, timeout: REMOTE_TIMEOUT_MS } as const
  // A key rides as a plain header: the server never sees an OAuth dance, it just wants
  // the credential on every request. Bearer is what every catalogued key app expects.
  if (token) return { ...base, headers: { Authorization: `Bearer ${token}` } }
  if (app.kind !== "oauth") return base
  // The catalogued endpoints matter as much as the scope. Without them the client has to
  // discover the sign-in details itself, and the vendors that publish no discovery
  // document — Slack, Box, MongoDB, Zoom, Figma and the rest — then failed before a
  // browser could open. These are the endpoints each vendor states, so the handshake can
  // be built without guessing and without a round trip that returns nothing.
  //
  // The client ID is what makes the handshake possible at all for a vendor that issues
  // clients only from its own console, and when it is absent for a server that supports
  // self-registration the server is left to register one itself.
  return {
    ...base,
    oauth: {
      ...(app.oauth ? { authorizationUrl: app.oauth.authorizationUrl, tokenUrl: app.oauth.tokenUrl } : {}),
      ...(clientId ? { clientId } : {}),
      ...(clientSecret ? { clientSecret } : {}),
      ...(app.scope ? { scope: app.scope } : {}),
    },
  }
}

/**
 * Whether this app can only be reached with a client the vendor itself issued.
 *
 * The catalogued steps are the marker: an app that has them is one whose developer
 * console has to be visited, and everything else either self-registers or needs nothing.
 */
function needsClientId(app: AppEntry) {
  return app.kind === "oauth" && !app.clientId && !!app.consoleUrl
}

/**
 * The first half of a console-issued client: open the vendor's page and hand over the
 * exact steps, so the model asks for one specific value instead of "a client ID".
 *
 * Opening the console rather than describing it is what makes this one step for the user:
 * they are already looking at the form when the model asks, which is the same reason the
 * token flow opens the page that issues a key.
 */
const needsClientIdFlow = Effect.fn("McpControl.needsClientIdFlow")(function* (mcp: MCP.Interface, app: AppEntry) {
  if (app.consoleUrl) yield* mcp.openUrl(app.consoleUrl).pipe(Effect.ignore)
  return {
    title: `${app.name} needs an OAuth client ID`,
    metadata: {
      app: app.id,
      connected: false,
      requiresUserAction: true,
      openedConsole: !!app.consoleUrl,
    },
    output: JSON.stringify(
      {
        app: app.id,
        name: app.name,
        connected: false,
        needsUserAction: true,
        why:
          app.note ??
          `${app.name} only accepts OAuth clients that were created in its own developer console, so a client ID has to come from the account holder. Everything else about this connection already works.`,
        consoleOpened: app.consoleUrl ?? null,
        redirectUri: "http://127.0.0.1:19876/oauth/callback",
        scopes: app.scope ?? null,
        steps: app.steps ?? [
          `Open ${app.consoleUrl ?? "the vendor's developer console"} and create an OAuth app.`,
          "Set its redirect URL to http://127.0.0.1:19876/oauth/callback.",
          "Copy the client ID it shows.",
          "Then call mcp_connect again on this app with clientId set to exactly that value.",
        ],
        next: "Ask the user for the client ID now, then retry with the clientId parameter.",
      },
      null,
      2,
    ),
  }
})

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
  sessionID?: string,
) {
  const names = serverTools(Object.keys(yield* mcp.tools()), app.id)
  const connected = status.status === "connected"
  // Connecting is what puts a server's tools into this session's tool list. Doing it
  // here rather than at the call sites means every path that ends connected — OAuth,
  // key, local, or already up — activates it exactly once, and a path that fails
  // leaves the session's tool list untouched.
  if (connected && sessionID) activateServer(sessionID, app.id)
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

// --- mcp_disconnect ---

const DisconnectParameters = Schema.Struct({
  app: Schema.String.annotate({
    description: 'App name or id from mcp_catalog, e.g. "notion", "Notion", "sentry"',
  }),
})

const DISCONNECT_DESCRIPTION = `Take an MCP server offline and forget its stored credentials.

WHEN: the user asks to disconnect, revoke, or stop using an app, or a connected server is acting
up and they want it gone. This stops the live connection, throws away its token or key, and marks
it disabled in config so it does not come back on the next start.

Forgetting the credentials is the point: reconnecting afterwards runs a fresh browser sign-in (or
asks for a new key) rather than quietly reusing the credential this call discarded.

Returns what was disconnected, or the server's real error if it did not go down.`

export const McpDisconnectTool = Tool.define<typeof DisconnectParameters, Metadata, MCP.Service | Config.Service>(
  "mcp_disconnect",
  Effect.gen(function* () {
    const mcp = yield* MCP.Service
    const config = yield* Config.Service
    return {
      description: DISCONNECT_DESCRIPTION,
      parameters: DisconnectParameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const wanted = params.app.trim()
          const app = allSeedApps().find(
            (item) => item.id === wanted.toLowerCase() || item.name.toLowerCase() === wanted.toLowerCase(),
          )
          const name = app?.id ?? wanted
          const before = (yield* mcp.status())[name]
          if (!before) {
            return {
              title: `No MCP server "${wanted}"`,
              metadata: { app: name, disconnected: false },
              output: JSON.stringify(
                {
                  error: `No MCP server named "${wanted}" is configured.`,
                  next: "Call mcp_status to see what is configured, or mcp_catalog to find the app id.",
                },
                null,
                2,
              ),
            }
          }

          const exit = yield* mcp.disconnect(name).pipe(Effect.exit)
          if (Exit.isFailure(exit)) {
            if (Cause.hasInterruptsOnly(exit.cause)) return yield* Effect.interrupt
            return {
              title: `${name} did not disconnect`,
              metadata: { app: name, disconnected: false, error: squash(exit) },
              output: JSON.stringify({ app: name, disconnected: false, error: squash(exit) }, null, 2),
            }
          }

          // Credentials go after the transport is down, so a failure here still leaves the
          // server off, and a success means the next connect cannot reuse the old key.
          yield* mcp.removeAuth(name)

          // Take the server's tools back out of this session too. A disconnect that left
          // them injected would keep the model calling tools whose server is gone.
          deactivateServer(ctx.sessionID, name)

          const global = yield* config.getGlobal()
          const declared = global.mcp?.[name]
          yield* config.updateGlobal({
            ...global,
            mcp: { ...global.mcp, [name]: { ...(declared ?? {}), enabled: false } },
          })

          return {
            title: `${app?.name ?? name} disconnected`,
            metadata: { app: name, disconnected: true, credentialsForgotten: true },
            output: JSON.stringify(
              {
                app: name,
                name: app?.name ?? name,
                disconnected: true,
                credentialsForgotten: true,
                wasStatus: before.status,
                next: "Connecting again runs a fresh sign-in, so the user has to approve it or supply a new key.",
              },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

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