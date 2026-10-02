# MCP Hub

A connect panel for ZYRAXON. One button on the home page, a list of apps, and
clicking an app signs you in and hands its tools to the agent.

Everything lives in this folder. No existing source file is changed — see
`HOST-INTEGRATION.md`.

## How many apps can be connected

| Layer | Count |
|---|---|
| Curated catalog (hand-picked, ready) | **27** |
| Official MCP registry (local cache) | **9,580** |
| Official MCP registry (live, beyond the cache) | **18,000+** and growing |

8,517 of the cached servers are **hosted**, meaning they connect over a URL with
nothing to install.

## Apps that need nothing from you

Verified live against each server's `WWW-Authenticate` header and its
`/.well-known/oauth-authorization-server` document:

| App | Client ID or secret needed |
|---|---|
| Notion | No |
| Linear | No |
| Atlassian (Jira) | No |
| Sentry | No |
| Stripe | No |
| Cloudflare | No |
| Figma | No |
| GitHub | Yes, once |

These seven run an authorization server that supports dynamic client
registration (RFC 7591), so the Hub registers itself. The user presses Connect,
the browser opens that app's own consent page, the user presses Allow, and the
token comes back to a local callback on port 19876.

## Apps that need a token once

An app can only offer the one-click flow if it runs an authorization server with
dynamic registration. Where it does not, a token is required. The token is
pasted once and then goes straight to the agent.

| App | Where to create the token |
|---|---|
| GitHub | github.com/settings/tokens |
| Supabase | supabase.com/dashboard/account/tokens |
| Neon | console.neon.tech/app/settings/api-keys |
| Vercel | vercel.com/account/tokens |
| Netlify | app.netlify.com/user/applications |
| YouTube Data | console.cloud.google.com/apis/credentials |
| Gmail | console.cloud.google.com/apis/credentials |
| Slack | api.slack.com/apps |
| Discord | discord.com/developers/applications |
| Telegram | core.telegram.org/bots |
| WhatsApp Business | developers.facebook.com/apps |
| Meta Ads | developers.facebook.com/apps |
| LinkedIn | linkedin.com/developers/apps |
| X (Twitter) | developer.x.com/en/portal/dashboard |
| Reddit | reddit.com/prefs/apps |

## Social and communication apps in the registry

Counted from the local cache. None of these have an official hosted MCP server —
Facebook, Google and Meta do not publish one — so they are reached through
community servers in the registry or through the provider's own API.

| App | Servers | Hosted |
|---|---|---|
| YouTube | 26 | 23 |
| LinkedIn | 17 | 13 |
| Reddit | 13 | 12 |
| WhatsApp | 11 | 10 |
| Instagram | 10 | 9 |
| Gmail | 7 | 5 |
| X (Twitter) | 7 | 7 |
| Meta Ads | 5 | 4 |
| Telegram | 5 | 5 |
| Slack | 4 | 2 |
| Discord | 4 | 3 |

## Local servers

ZYRAXON already ships four MCP servers that run on this machine. They appear in
the panel next to the remote apps.

| Server | What it does |
|---|---|
| Jarvis Browser | Headless browser control |
| Nuphus Desktop | Desktop control |
| Touchpoint | Screen touch and input |
| Desktop Commander | Files, processes and shell |

## Folder layout

```
MCP Hub/
  plugin.ts                 host entry point — the only file ZYRAXON imports
  catalog/
    seed.ts                 27 curated apps
    registry-cache.json     9,580 servers from the official registry
  lib/
    client.ts               dependency-free MCP client (Streamable HTTP)
    registry.ts             live registry client, zero-setup detection
    connect.ts              connect flow, tool handoff, state
    runtime.ts              binds the panel to ZYRAXON's own MCP service
  ui/
    mcp-hub-panel.tsx       the panel and the app cards
  scripts/
    smoke.mjs               catalog and endpoint checks
    verify-live.mjs         live connection and tool-call proof
    verify-oauth.mjs        live browser login flow proof
    verify-injection.mjs    runtime tool injection proof
    build-registry-cache.mjs  registry cache builder
    preview.mjs             standalone UI preview server
  install.mjs               writes the plugin entry into the user's config
  PLAN.md                   design notes
  HOST-INTEGRATION.md       how the host wires it up
```

## Commands

```bash
node "MCP Hub/install.mjs"                    # register the plugin
node "MCP Hub/scripts/smoke.mjs"              # catalog and endpoints
node "MCP Hub/scripts/verify-live.mjs"        # live connect and tool calls
node "MCP Hub/scripts/verify-oauth.mjs"       # live login flow
node "MCP Hub/scripts/verify-injection.mjs"   # runtime tool injection
node "MCP Hub/scripts/build-registry-cache.mjs" 250
node "MCP Hub/scripts/preview.mjs"            # UI preview on port 12002
```
