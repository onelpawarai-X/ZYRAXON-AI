# Wiring the Hub into a host

Everything the host has to do, and the four ways it silently does not work.

## The seam

There is exactly one. The host imports the plugin entry, renders the panel component, and
hands it an MCP runtime. Nothing in this folder modifies the host, and nothing in the host
has to know about the catalog, the registry or OAuth.

```ts
const hub = await import("<repo>/MCP Hub/plugin.ts")

const runtime = hub.bindRuntime({
  client: serverSDK.createClient({ directory, throwOnError: true }),
  updateConfig: (patch) => config.updateConfig(patch),
})

dialog.show(() => (
  <hub.McpHubPanel runtime={runtime} resolve={hub.resolve} onClose={() => dialog.close()} />
))
```

Four things have to be true, and `scripts/verify-injection.mjs` checks all four:

| # | Requirement | What breaks without it |
|---|---|---|
| 1 | the plugin entry is registered in the user's config | no button, no error |
| 2 | the host imports the entry and it actually imports | fails at startup, or not at all |
| 3 | the panel is rendered as a component | renders once, then stops updating |
| 4 | a runtime is passed in | every card blank |

`bindRuntime` needs exactly two things. `client` is your connected MCP client. `updateConfig`
writes into the project config — and it is **required**, not optional, because a connection
that is only recorded in memory is gone on the next restart.

## Why the panel must be a component

This is the mistake that produces a panel which appears to work.

```tsx
// wrong — runs the body outside a reactive owner
dialog.show(() => hub.McpHubPanel({ runtime }))

// right
dialog.show(() => <hub.McpHubPanel runtime={runtime} resolve={hub.resolve} />)
```

Calling a Solid component as a plain function is legal and produces no error. The signals it
creates are never disposed and the first render is not tracked, so the panel paints, looks
correct, and quietly stops responding to everything: Connect does nothing, the status poll
never lands, the cards freeze on whatever they said last. It reads as a server problem.

## Disconnect, and why it does not delete anything

`updateConfig` is a deep merge. A key left out of a merge survives it, so the config API
cannot express a delete. Disconnect therefore does two things that together mean "gone":

- `disconnect(name, { forgetCredentials: true })` — stops the transport and clears the
  stored tokens and the client registration
- a config patch setting `enabled: false` — stops it coming back on the next start

`forgetCredentials` is not optional in practice. Without it the tokens stay on disk and the
next launch signs the app back in, so a user who pressed Disconnect finds their account
reattached with no explanation and no way to tell why.

If you want true removal rather than disabling, it needs a config API that can express a
delete. Do not try to fake it with a patch.

## Adding an app

Add one entry to `MCP Hub/catalog/seed.ts`, in the array that matches its kind, and then:

```
node "MCP Hub/scripts/verify-live.mjs"    # does it answer, and does it need auth
node "MCP Hub/scripts/verify-oauth.mjs"   # if browser: can discovery find its endpoints
```

Both are live. The second is not optional for a browser app: a card that cannot find its
sign-in page is a card that will hang for the user, and the registry's answers are not
standardised enough to assume.

Order within each array is alphabetical except `browserApps`, which leads with Higgsfield
because it is the one that was verified end to end against a real account.

### Fields worth setting

- `url` — the endpoint. Without it the app is resolved through the registry at click time,
  which works but is slower and less predictable.
- `via` — who actually runs the endpoint. More than half the catalog is hosted by a third
  party, and a card that hides that reads as a first-party integration when it is not.
- `iconDomain` — the app's own domain, used as the second chance when the brand mark 404s.
  Simple Icons has no slug for Canva or Prisma.
- `tokenUrl` — where to make a token, for token-class apps. Shown as a link before the
  paste box so nobody has to go hunting.

### What not to set

Do not set `zeroSetup`. It was a hand-set flag, and a live pass over the catalog showed 29
apps redirect sign-in to another host with 9 offering no dynamic client registration at all.
A flag saying "No setup" for those is a promise the connector cannot keep. The panel now
checks the live server instead and labels the card from that.

## Credentials

- OAuth tokens and client registrations are created on the machine and stored there. Nothing
  is sent anywhere else.
- A pasted token is stored the same way and sent as a bearer header to that server only.
- The catalog never carries a credential, and neither does the registry snapshot.

## Cross-platform

Verified on Windows. Written for the others, unverified on them:

- **Chrome discovery** walks the usual install paths per platform. On macOS and Linux it
  also needs a display session; there is no headless path.
- **The loopback callback** binds 127.0.0.1 on an ephemeral port. Under Wayland the browser
  may not raise without an explicit activation token, so the consent page can open behind
  the app. macOS and Linux are untested here.
- **Timing** is measured on Windows. The budgets in `lib/connect.ts` are generous enough
  that a slower platform should not need them raised, but that is an expectation, not a
  measurement.

## Checking a change

```
node "MCP Hub/scripts/verify-injection.mjs" --config   # the seam, and the user's config
node "MCP Hub/scripts/preview.mjs"                    # the panel, no build needed
```

`preview.mjs` serves the panel against a stub runtime that is deliberately mixed — one app
waiting for sign-in, two connected with tool counts, one failed. A stub where everything is
connected hides exactly the states that break.

If the panel changes but the button does not appear, run `verify-injection` first. It is
faster than any other guess.