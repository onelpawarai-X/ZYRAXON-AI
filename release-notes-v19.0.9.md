## ZYRAXON AI v19.0.9

**Two features lead this release: AI Generate now uses every model from every
provider you have connected, and Settings has a new Integrations panel for
connecting an external system to the agent.**

---

### The headline fix: AI Generate respects your connections

AI Generate had its own model list, and that list only ever offered the free
`opencode` and `zyraxon` models. If you had connected OpenAI, Anthropic, Google
or any other provider, its models never appeared in the AI Generate selector, so
you could not use them there — even though the main chat offered them.

That is fixed. The selector now reads the same catalog the main chat reads. Every
model of every provider you have connected is listed and selectable, and the
models you have hidden in Settings stay hidden, exactly as in the composer. The
two surfaces can no longer drift apart.

- **Connected providers contribute all of their models.** Connect a provider once
  and its models are available in the main chat *and* in AI Generate.
- **Auto picks a model you are not billed for.** When you leave the selection on
  Auto, it prefers the free gateway, then the house provider, then the rest, so
  Auto never quietly lands on a paid model.
- **Clearer failures.** The error hint no longer blames `opencode`; it now points
  at the real cause — connect a provider in Settings and pick an available model.

### Session export and import

Your conversations are no longer trapped in one machine's database.

Imagine working with an AI for a year — every question, every decision, every
task, all in one place. Then you have to travel and cannot take the laptop, but
you still need that conversation.

**Export.** Open Settings, go to the Sessions panel, and press Export beside any
conversation. ZYRAXON writes the whole session — title, every message, every
part, the cost and the token counts — into one file named after the conversation
and ending in `.zyraxon-session.json`.

**Keep it anywhere.** Google Drive, a USB stick, an email to yourself, a cloud
folder, another machine. It is a plain JSON file, and it does not need ZYRAXON to
store it.

**Import.** On the new machine, open Settings → Sessions and drag the file in, or
press Import. ZYRAXON validates the file and restores the session exactly —
messages, parts, order and cost. Export and import are a full round trip with no
loss.

**From the command line.** `zyraxon export <sessionID>` writes a session to a
file, and `zyraxon import <file>` restores one; import also accepts a share URL.

**Safety.** Imports are validated before they are applied — a broken or
incomplete bundle is refused with a reason rather than half-loaded. Session ids
are remapped so in-conversation references follow their rows, and a sparse
session is filled with defaults rather than written as nulls.

### Integrations: connect an external system to the agent

The agent can now be given the outside systems it needs, from one place. A new
**Integrations** panel lives in Settings, beside Sessions. It lists every
integration the server offers, connects one with a key or through OAuth, and
disconnects it again.

The panel is the part that was missing. The server already owned the registry,
the credential store and the routes; what did not exist was a way to reach them
from the app. Before this release the machinery was there with no door to it.

- **Connect with a key.** Pick an integration, paste the secret, and it is stored
  and active. The panel confirms and the row reads as connected.
- **Connect through OAuth.** The server hands back a URL to open and an attempt
  to watch. The panel opens the browser and polls the attempt until it is
  complete, fails, or expires — and it stops on a hard five-minute cap, so a
  panel left open cannot poll forever.
- **Disconnect.** Removing a connection deletes the stored credential; the row
  goes back to unconnected.

There is no separate store to keep in sync. A connection *is* a credential in
the server's own credential store — the same one the agent reads when it works.
Once you connect an integration, the agent picks it up from the same registry on
its own, so there is no per-task wiring step.

This also means the browser half and the server half cannot drift apart: every
call in the panel goes through one client that speaks the server's own routes
with the same credentials the SDK uses, and a connection is stored as a
credential rather than as panel-only state.

### Reliability work in this release

- **Generated client refreshed.** The session-export `parts` field was missing
  from the committed generated client, so the `check:generated` gate failed on
  every run. It now passes.
- **Windows test loader fixed.** Passing a bare path to `--import` made Windows
  read `d:` as a URL scheme and failed four tests. The loader is now handed over
  as a file URL.
- **`mcp-hub` workflow fixed.** An empty `with:` block made the workflow
  unparseable — it produced zero jobs. It now runs its six jobs.

### Verification

- AI Generate model list: 7/7 tests pass (connected-provider models offered,
  hidden models respected, free tagging, option values).
- Integrations client: 16/16 tests pass (Basic auth headers, the location query,
  listing and fetching, key and OAuth connects, attempt polling and cancel, and
  disconnect).
- Session export/import round trip: 11/11 tests pass.
- `agent-reliability-kernel`: 54/54 pass.
- `test.yml`: unit and e2e, Linux and Windows — 4/4 green.
- `mcp-hub.yml`: 6/6 green.

### Assets

Built and attached automatically by the release workflow, for every platform:

- **Desktop** — Linux (AppImage, `.deb`, `.rpm`), Windows (x64 and arm64
  installers), macOS (arm64 and x64, `.dmg` and `.zip`).
- **CLI** — Linux, macOS and Windows archives, x64 and arm64.
- **SDK** — the published SDK package.

---

**Version:** 19.0.9 (from 19.0.8). The session file format is stable, so a bundle
exported on any 19.0.9 install imports into any other.

_This release note was written by an AI agent (OpenHands) on behalf of the maintainer._
