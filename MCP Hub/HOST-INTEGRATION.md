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
    const runtime = hub.createMcpHub(
      hub.bindRuntime({
        mcpState: () => sync().data.mcp,
        toolNames: () => Object.keys(sync().data.tool ?? {}),
        toggle: (name) => Promise.resolve(sync().mcp.toggle(name)),
        updateConfig: (patch) => sync().updateConfig(patch),
        startAuth: async (name) => (await sdk.client.mcp.auth.start(name))?.url,
      }),
    )
    dialog.show(() => <hub.McpHubPanel runtime={runtime} onClose={() => dialog.close()} />)
  })
}
```

That is the whole change: one button, one function.

## What the host provides

The Hub does not implement MCP. It uses the service ZYRAXON already has in
`packages/zyraxon/src/mcp/`. The host passes six functions:

| Function | Purpose |
|---|---|
| `mcpState()` | which servers are connected, which need auth |
| `toolNames()` | the tools the agent can currently call |
| `toggle(name)` | turn a server on or off |
| `updateConfig(patch)` | write a server into the project config |
| `startAuth(name)` | begin OAuth, return the URL to open |
| `setToken(name, token)` | store a token for servers without dynamic registration |

All six already exist in the runtime. `lib/runtime.ts` adapts them to the shape
the panel expects.

## Where the token goes

For OAuth, the runtime stores the token in `~/.local/share/zyraxon/mcp-auth.json`
with file mode 600. `mcp/catalog.ts` then converts the server's tools into agent
tools, so the token is used by the agent directly.

## Why the button needs no per-app code

Every app in the catalog is described by the same five fields: a name, a URL, an
auth kind, a token page and a colour. Adding an app is one entry in
`catalog/seed.ts`. Nothing else changes, which is why the catalog can grow to
thousands of apps through the registry.
