# MCP Connect — what it does and what it refuses to do

## The goal

One button on the home page that connects an account to the agent. Press it, allow the app
in your own browser, and its tools are callable in the session. No config file to hand-edit,
no JSON to paste, no host and port.

## The rules it follows

**The order things are offered in is the order of what they ask of you.** Browser sign-in
first, because that is the case that works for most people with one click. Then apps that
want a pasted token. Then apps that need nothing at all. Mixing them in one list was the
original mistake: a card that opens Chrome, a card that wants a string of text and a card
that just works all looked identical, so nothing explained why one succeeded and the next
did not.

**No endpoint is written down from memory.** Every URL in the catalog has been sent a real
MCP `initialize`. A 404 gets the entry removed rather than left for somebody to press.

**A 200 to `initialize` is not proof of anything.** Plenty of servers answer it
unauthenticated and then refuse every tool call. Token-classified entries are probed with a
deliberately invalid bearer token so the answer means something. For the same reason the
live token probe for Copilot was taught to treat a 4xx as rejection rather than as success,
which it had been doing.

**Discovery follows the MCP order and stops at the first answer.** No invented client ids,
no guessed endpoints. If a server advertises nothing, its own recorded endpoints are the
last resort and nothing else is tried.

**The card never promises one click unless the server proved it.** Dynamic client
registration is checked live. Nine apps do not offer it, and those cards say so.

**Progress is reported honestly.** The first stretch — resolving, finding endpoints, opening
the consent page — is real work that finishes, and it is worth 70%. After that the wait
belongs to the person reading the consent page, so the bar creeps toward 95% and stops
rather than continuing to promise a percentage of a total nobody knows.

## What it will not do

- It will not invent a client id to get past a server that wants one. Nine apps need you to
  supply it themselves.
- It will not fall back to a different server when the one you chose fails. A silent
  substitution is worse than an error you can see.
- It will not keep credentials after you press Disconnect. `forgetCredentials` is part of
  what that button does; without it the next start signs the app back in.
- It will not bundle the registry into the app. 2.6 MB of JSON to render one number is not
  a trade worth making.
- It will not edit a config by parsing and rewriting it. `zyraxon.jsonc` is full of
  comments and the user's formatting; it comes back the way it went in.

## Where the risks actually are

**The config write is a deep merge, so nothing can be deleted.** A key left out of a merge
survives it. Disconnect therefore marks the entry disabled rather than removing it, and
that is what `enabled: false` means here. If you ever want true deletion, it needs an API
that can express it, not a cleverer patch.

**The MCP servers live in the server process, not the panel.** A card's state is whatever
the server reports, read back on a poll. Closing the panel must not make a connected app
look disconnected, so the panel keeps a module-level cache and never invents a state the
server did not report.

**The browser is opened by the server, in the real profile.** That is the whole point: you
are already signed in to Notion, so Noticon recognises you. It also means the panel cannot
know when you are finished — it waits for the server's own loopback callback.

**Discovery is duplicated.** `lib/registry.ts` and
`packages/zyraxon/src/mcp/oauth-discovery.ts` implement the same chain, one for the UI and
one for the server. They must be changed together, or the panel will promise a connection
the connector then cannot make.

## What was measured

- 103 of 103 remote endpoints answer `initialize`. None dead, none timing out.
- 53 of 53 browser apps resolve through the discovery chain.
- 44 offer dynamic client registration; 9 do not.
- 29 sign in on a different host than the endpoint. All https.
- Slowest discovery: MongoDB, 7.5s across the whole chain.
- 9,580 servers in the registry snapshot, last fetched 2026-10-02.

## Still open

- No authenticated round trip has been run. Sign-in was exercised up to the point where the
  server asks for a token, which needs a real account for each vendor.
- macOS and Linux have not been run. The Chrome discovery and loopback paths are written
  for them but unverified.
- Two entries in the registry snapshot carry a mangled character from an earlier fetch.
  Harmless in a search box, worth cleaning on the next full refresh.