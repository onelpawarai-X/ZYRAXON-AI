# Host integration

Everything is in `MCP Hub/`. The host change is one button and one function.

## Route 1 — config only, no source change

`install.mjs` writes the plugin entry into the user's own config:

```bash
node "MCP Hub/install.mjs"
```

It appends this to `~/.config/zyraxon/zyraxon.jsonc`:

```jsonc
{
  "plugin": ["file:///workspace/zyraxon-src/MCP%20Hub/plugin.ts"]
}
```

Restart ZYRAXON and the MCP Connect button appears on the home page. No file in
the repository is modified.

## Route 2 — the button in the app source

The button itself lives in `packages/app/src/pages/home.tsx`, next to
*New session*:

```tsx
<ButtonV2
  data-action="home-mcp-connect"
  variant="ghost-muted"
  size="normal"
  icon="dot-grid"
  class="pointer-events-auto h-7 px-2 [font-weight:530]"
  onClick={openMcpHub}
>
  MCP Connect
</ButtonV2>
```

and `openMcpHub()` imports the Hub and hands it the runtime bindings:

```tsx
function openMcpHub() {
  void import("../../../../MCP Hub/plugin").then((hub) => {
    const conn = focusedServer() ?? server.current
    const sdk = conn ? global.ensureServerCtx(conn)?.sdk : undefined
    if (!sdk) return
    const runtime = hub.bindRuntime({
      client: sdk,
      updateConfig: (patch) => sync().updateConfig(patch),
    })
    const hubApi = hub.createMcpHub(runtime)
    dialog.show(() => (
      <hub.McpHubPanel runtime={runtime} resolve={hubApi.resolve} onClose={() => dialog.close()} />
    ))
  })
}
```

That is the whole change: one button, one function.

## What the host provides

The Hub does not implement MCP. It uses the service ZYRAXON already has in
`packages/zyraxon/src/mcp/`. The host passes the connected client and one
function:

| Provided | Purpose |
|---|---|
| `client` | the generated client, for status, add, connect, authenticate and tool ids |
| `updateConfig(patch)` | write a server into the project config so it survives a restart |

`lib/runtime.ts` adapts those to the shape the panel expects.

## Why the host passes the client rather than data

A card has to reflect a live transport, not a snapshot. `client.mcp.status()`
reads the running state, `client.mcp.add` brings a server up in the same round
trip, and `client.experimental.toolIDs()` reports what the agent can actually
call. Deriving any of that from the sync payload left cards stuck on
"Connecting…" forever.

## The browser belongs to the server

Signing in opens the real browser in the real profile that already holds the
app's session, because `mcp/index.ts` calls `browser.open` itself and then waits
on its local callback. The Hub never calls `window.open`. That is why approving
access leaves the app already logged in, and why an Allow button is not something
the panel has to render.

Because `authenticate` blocks until the user acts, the Hub watches status rather
than awaiting the request, so a card can say "check your browser" while it waits.

## Where the token goes

For OAuth, the runtime stores the token in `~/.local/share/zyraxon/mcp-auth.json`
with file mode 600. `mcp/catalog.ts` then converts the server's tools into agent
tools, so the token is used by the agent directly. Token apps carry their
`Authorization` header inside the server config, so they need no second write.

## Why the button needs no per-app code

Every app in the catalog is described by the same five fields: a name, a URL, an
auth kind, a token page and a colour. Adding an app is one entry in
`catalog/seed.ts`. Nothing else changes, which is why the catalog can grow to
thousands of apps through the registry.
