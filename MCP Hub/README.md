# MCP Hub

One place to connect an account, and hand its tools to the agent.

The home page gets an **MCP Connect** button. It lists every connectable app in the order of
what it asks of you — apps that sign in through a browser first, then apps that want an API
key, then apps that need nothing at all. Clicking one opens that app's own consent page in
your real browser profile, and once you allow it the tools are live in the session.

## Install

```
node "MCP Hub/install.mjs"
```

Then restart ZYRAXON. To undo it:

```
node "MCP Hub/install.mjs" --uninstall
```

The installer edits your `~/.config/zyraxon/zyraxon.jsonc` as text, so your comments and
your formatting survive. Nothing in the repository is touched, and the config already
supports plugins, which is what this route is for.

## What is in the catalog

108 apps, checked against their real servers rather than against a list somebody typed:

| Kind | Apps | What it means |
|---|---|---|
| Browser sign-in | 53 | Opens that app's consent page. Token stored on this machine. |
| Needs a token | 18 | You paste a token you created yourself. |
| Open | 32 | No sign-in. Public data, live immediately. |
| Runs locally | 5 | A process on this machine. Nothing leaves the box. |

103 of the 108 are remote endpoints. All 103 answer a real MCP `initialize` today.

## How a connection works

For a browser app the panel does not guess anything about OAuth. It runs the chain in the
order MCP defines, and stops at the first thing that answers:

1. an anonymous `initialize`, and read `WWW-Authenticate` off the answer
2. the protected-resource metadata that header points at
3. `authorization_servers` from that document
4. the issuer's own metadata, for the authorization and token endpoints
5. the entry's own recorded endpoints, if the server advertises nothing

Then, if the server offers dynamic client registration, the client registers itself with
PKCE and the whole thing is one click. If it does not, the app says so on the card before
you press anything, rather than failing after you have waited.

Discovery is live, not cached: 53 of 53 browser apps resolve. The slowest measured was
MongoDB at 7.5s across the whole chain.

## Honest limits

- **9 apps have no dynamic client registration** — GitHub, ElevenLabs, Nango, Box, MongoDB,
  Zoom, Render, Slack and HubSpot. They sign in on another host and may ask you to paste an
  app id. Their cards say "Extra step" for this reason, from the live check rather than a
  hand-set flag.
- **29 apps sign in on a different host** than the endpoint they serve. All of them over
  https; none over plain http.
- **Context7 answers `initialize` with HTTP 200 while still sending a `WWW-Authenticate`
  challenge.** It needs a credential, and the panel treats it that way.

## Layout

```
install.mjs              register the plugin in the user's config
plugin.ts                the only file the host needs to know about
catalog/seed.ts          the 108 apps
catalog/registry-summary.json  how big the registry was at the last fetch
lib/connect.ts           the connection state machine and its timing budget
lib/client.ts            a dependency-free Streamable HTTP MCP client
lib/registry.ts          registry access and the OAuth discovery chain
lib/resolve.ts           catalog entry to a real, connectable server
lib/runtime.ts           binds the Hub to the host's MCP client
ui/mcp-hub-panel.tsx     the panel
scripts/                 verification and preview tools
```

`lib/registry.ts` duplicates the discovery order that lives in
`packages/zyraxon/src/mcp/oauth-discovery.ts`. The server-side version is Effect-based and
this one is plain fetch, because this runs in the UI. **Change them together.**

## Checking it yourself

```
node "MCP Hub/scripts/verify-injection.mjs"   # is the Hub actually wired into the app
node "MCP Hub/scripts/verify-live.mjs"        # does every endpoint still answer
node "MCP Hub/scripts/verify-oauth.mjs"       # can every browser app find its sign-in page
node "MCP Hub/scripts/verify-resolve.mjs"     # can catalog apps be resolved
node "MCP Hub/scripts/smoke.mjs"              # end to end against real servers
node "MCP Hub/scripts/preview.mjs"            # the panel, in a browser, without a build
node "MCP Hub/scripts/build-registry-cache.mjs" --dry-run   # refresh the registry numbers
```

`verify-live`, `verify-oauth` and `smoke` talk to real servers on somebody else's
infrastructure. They send a plain `initialize` and read the answer. Keep the concurrency
low; there is no reason to look like a load test.

## Two things that will bite you

**Do not trust the registry's search.** `?search=` on the registry API times out at any page
size, while `?limit=` on its own answers in about a second. Search here runs against the
local snapshot instead, which is instant, works offline, and covers all 9,580 servers
instead of the first page. If you ever see search hang, this is why.

**Do not import `registry-cache.json`.** It is 2.6 MB and the panel must never bundle it.
The count the UI shows comes from `registry-summary.json`, a few hundred bytes, written by
the same script.