# MCP Hub — design notes

All changes live in this folder. Nothing outside it is modified.

## What already exists in the project

| Piece | File | What it does |
|---|---|---|
| MCP client engine | `packages/zyraxon/src/mcp/index.ts` (1,098 lines) | stdio, HTTP and SSE transports, tool list, tool call |
| OAuth | `mcp/oauth-provider.ts` | RFC 7591 dynamic client registration, PKCE |
| OAuth callback server | `mcp/oauth-callback.ts` | `http://127.0.0.1:19876/mcp/oauth/callback` |
| Token store | `mcp/auth.ts` | `~/.local/share/zyraxon/mcp-auth.json` |
| Tool conversion | `mcp/catalog.ts` | MCP tool becomes an agent tool |
| Config schema | `packages/core/src/v1/config/mcp.ts` | local (command) and remote (url + oauth) |
| Existing MCP UI | `packages/app/src/components/dialog-select-mcp.tsx` | enable and disable servers |
| Built-in tools | `mcp/*-tools.ts` | 18 categories, 136 tools |

So the Hub does not rebuild any of this. It adds the catalog, the panel and the
wiring.

## The question this was built to answer

When a user clicks an app, does the browser open that app's own consent page,
and after Allow does the tool reach the agent?

Yes. The flow is:

1. Read the protected resource metadata to find the authorization server.
2. Read the authorization server metadata.
3. Register a client dynamically — no client id or secret from the user.
4. Open the authorize URL with PKCE. This is the app's own consent page.
5. The user presses Allow.
6. The code returns to the local callback on port 19876.
7. The token is stored and the server's tools are converted into agent tools.

Steps 1 to 4 and 6 to 7 were verified live; step 5 is the only part a human does.

## Why some apps cannot use that flow

An app can only offer one-click sign-in if it runs an authorization server that
supports dynamic client registration. GitHub does not, so it needs a token once.
Facebook, Google and Meta publish no hosted MCP server at all, so those apps are
reached through community servers from the registry or through the provider's
own API with a token.

Verified live:

| Server | Dynamic registration |
|---|---|
| Notion | yes |
| Linear | yes |
| Atlassian | yes |
| Sentry | yes |
| Stripe | yes |
| Cloudflare | yes |
| Figma | yes |
| GitHub | no |

## Scale

- 27 curated apps
- 9,580 servers in the local cache, 8,517 hosted
- 18,000+ in the live registry, and growing

The registry walk was stopped after 595 pages at 18,098 unique servers, so the
true figure is higher.

## Design rules

1. Everything in this folder. The host change is one button and one function.
2. No new dependencies. The MCP client in `lib/client.ts` uses only `fetch`.
3. The Hub never reaches into the app. The host passes its MCP service in
   through `lib/runtime.ts`.
4. Adding an app is one entry in `catalog/seed.ts`.
5. Every claim has a script that proves it.
