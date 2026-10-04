<!--
  Copyright (c) 2026 onelpawarai. All rights reserved.
  SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-->

# Contributing to ZYRAXON

First of all: thank you. Whether you are fixing a typo, reporting something that
behaves strangely, or rewriting a subsystem — all of it counts, and all of it is
reviewed by a person who reads the code.

This document is the whole of what you need. It is deliberately short.

---

## Contents

- [Before you start](#before-you-start)
- [Setting up](#setting-up)
- [How the codebase is organised](#how-the-codebase-is-organised)
- [Making a change](#making-a-change)
- [Commit and branch naming](#commit-and-branch-naming)
- [Checks](#checks)
- [Opening a pull request](#opening-a-pull-request)
- [What a good pull request looks like](#what-a-good-pull-request-looks-like)
- [Review](#review)
- [Reporting a bug](#reporting-a-bug)
- [Proposing something large](#proposing-something-large)
- [Adding a tool](#adding-a-tool)
- [Adding an MCP app](#adding-an-mcp-app)
- [Adding a translation](#adding-a-translation)
- [Style](#style)
- [Security](#security)
- [Code of conduct](#code-of-conduct)
- [License](#license)

---

## Before you start

- Search the [issues](https://github.com/onelpawarai-X/ZYRAXON-AI/issues) and
  open pull requests first. Someone may already be working on it, and a
  duplicate costs everyone more than a small delay.
- If you are unsure whether something is a bug or intended behaviour, open an
  issue and ask. That is a perfectly good contribution.
- **Security problems do not go in the issue tracker.** See
  [SECURITY.md](SECURITY.md).

## Setting up

Requires [Bun](https://bun.sh) and Node 20 or newer.

```bash
git clone https://github.com/onelpawarai-X/ZYRAXON-AI
cd ZYRAXON-AI
bun install
bun run dev
```

To run the desktop application:

```bash
bun run --cwd packages/desktop dev
```

Useful things to know before your first build:

- The build runs in **five ordered steps** — core, node sidecar, web UI, Electron
  shell, installer. Each depends on the last, so skipping ahead produces a
  confusing error rather than a useful one.
- If the build runs out of memory, raise the heap first:

  ```bash
  export NODE_OPTIONS="--max-old-space-size=16384"
  ```

- Tests cannot run from the repository root. Run them from the package you
  changed:

  ```bash
  bun test --cwd packages/zyraxon
  ```

## How the codebase is organised

Dependencies point one way and only one way:

```
Desktop / TUI / SDK  →  Client · Session-UI  →  SDK · Protocol  →  Core · Schema · Server
```

Client runtime code may depend on Schema and Protocol but **never** on Core or
Server. If you find yourself wanting to import from Core into a client module,
that is a signal the thing you need belongs somewhere else — ask in an issue
rather than reaching across the boundary.

| Package | Holds |
|:--|:--|
| `packages/schema` | The data shapes everything agrees on |
| `packages/core` | Effects runtime, configuration, database, utilities |
| `packages/protocol` | The wire types |
| `packages/server` | HTTP API and server routes |
| `packages/zyraxon` | The agent: tools, session, MCP, prompts |
| `packages/sdk` | Generated client |
| `packages/client` | UI state and data layer |
| `packages/app` | The application shell |
| `packages/ui` | Design system |
| `packages/session-ui` | Chat, timeline and composer |
| `packages/desktop` | Electron shell, TTS, task daemon, packaging |

Two conventions worth knowing on day one:

**The agent is written against Effect, not ad-hoc async.** Cancellation, timeouts,
retries and resource lifetimes are part of a function's type rather than
something each call site has to remember. If you are reaching for a bare promise
where an Effect would do, that is worth a second look.

**Generated code is generated.** After changing the public Protocol or the server
HTTP API, run `bun run generate` from `packages/client`. Do not edit anything
under `src/generated` by hand — it will be overwritten.

## Making a change

1. Fork the repository and create a branch.
2. Make the smallest change that fully solves the problem.
3. Run the checks (below).
4. Open a pull request against `dev`.

### Guidelines that save everyone time

- **Match the surrounding code.** Indentation, naming, comment density — follow
  what is already there rather than your own preference.
- **Comment the non-obvious, not the obvious.** A line that restates itself is
  noise. A comment explaining *why* something is done this way is worth more
  than the line it sits above.
- **Avoid `try`/`catch` and `any`.** Both are almost always avoidable here, and
  both hide failures rather than handling them.
- **Prefer `const`.** Reassignment is rarely the clearest option.
- **Prefer early returns to `else`.**
- **No stray test files.** Scratch scripts and temporary probes do not get
  committed.
- **Never commit secrets.** No API keys, tokens, logs or customer data — not in
  source, not in a fixture, not in a comment.

## Commit and branch naming

Conventional commits, always:

```
type(scope): summary
```

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor` and `test`. The scope
is optional and should name the package or area when it helps:

```
feat(mcp): add Stripe to the verified catalog
fix(composer): stop dictation from erasing the typed draft
docs: correct the tool counts in the README
```

Branch names are up to three words, hyphen-separated. No slashes, no type
prefixes:

```
session-recovery
fix-scroll-state
regenerate-sdk
```

## Checks

Run what your change touches:

```bash
# types
bun typecheck --cwd packages/<package>

# tests
bun test --cwd packages/<package>

# lint, if the package has it
bun run lint --cwd packages/<package>
```

A change that touches the Protocol or the server HTTP API also needs
`bun run generate` from `packages/client`.

If a check fails for a reason that predates your change, say so in the pull
request. Do not silently fix unrelated failures in the same commit — it makes the
review impossible.

## Opening a pull request

Your description should let a reviewer understand the change **without opening
it**. That means:

- **What** you changed and **why** — the problem, not just the diff.
- **How** you verified it. What you ran, what you clicked, what you observed.
- **What** you deliberately did not do, if it came up.
- Anything you are unsure about, stated plainly. "This works on my machine and I
  could not reproduce the failure on Windows" is genuinely useful.

Use a clear title:

```
fix(voice): submit the transcript when the bridge send button is used
```

Draft pull requests are welcome if you want a design opinion before finishing.

## What a good pull request looks like

- One concern. If it does two things, it is two pull requests.
- The description explains why, not what — the diff already says what.
- Reviewers can verify the claim from the description alone.
- No drive-by reformatting. If you ran a formatter, that belongs in its own
  commit.
- No unexplained binary or generated-file changes.

## Review

Every pull request is read by a human. Expect comments — they are about the code,
not about you. Reply to each one, even if the reply is "good catch, fixed". When
review asks for a change, push a commit rather than force-pushing, so the
discussion stays attached to the code.

Once approved it will be merged into `dev`. The `main` branch is cut for
releases.

## Reporting a bug

A good report contains:

1. **What you did**, and **what happened instead** — numbered steps are ideal.
2. **What you expected** to happen.
3. **The exact version or commit** you tested.
4. **Your platform** — OS, version, architecture.
5. The relevant log output, if you have it.

Screenshots help for anything visual. Please redact anything personal from them.

## Proposing something large

Architecture changes, new subsystems and anything that rewrites a package
boundary are better discussed before written. Open an issue describing the
problem and your proposed shape. That is not a gate on contributing — it just
means a week of discussion is cheaper than a week of work in the wrong direction.

## Adding a tool

1. Create the tool under `packages/zyraxon/src/tool/`.
2. Register it in `packages/zyraxon/src/tool/registry.ts`.
3. Record its required tier in
   `packages/zyraxon/src/subscription/tier-map.ts`. This file is sorted by tier —
   keep it that way, and do not add a tier that is not already defined.
4. Describe it so clearly that a model can decide when to reach for it. The
   description is the only thing the model sees.

## Adding an MCP app

Apps live in `MCP Hub/catalog/seed.ts`.

**Verify the endpoint before adding it.** An entry that connects but cannot call a
tool is worse than no entry, because it looks like it works:

1. Send an `initialize` request.
2. Check the `WWW-Authenticate` header for `resource_metadata` — that is what
   tells you the server speaks OAuth with discovery.
3. Fetch `/.well-known/oauth-authorization-server` and confirm a
   `registration_endpoint` exists if you are marking the app `oauth`.
4. Send `tools/list`.
5. Call one read-only tool and confirm real data comes back.

Then pick the `kind` honestly:

| `kind` | Use when |
|:--|:--|
| `oauth` | It completes sign-in through the vendor's own OAuth |
| `none` | It answers with no sign-in at all |
| `token` | It needs a key the user creates themselves |

A 401 is **not** evidence of OAuth. Plenty of servers simply refuse an anonymous
request. Check for the metadata.

Set `via` when the server is not run by the vendor — it is shown on the card so
nobody hands an account to a third party by surprise.

## Adding a translation

Translated READMEs live beside the main one as `README.<locale>.md`. If you
speak a language we do not have, adding it is genuinely useful.

Keep the structure of `README.md` intact and translate the prose. Leave code
blocks, badge URLs and link targets untouched — a translated README with a broken
build badge is worse than none.

## Style

Follow what is already in the file you are editing. Beyond that:

- Two-space indentation.
- Double quotes.
- No semicolons at end of statements, except where the file uses them.
- Comments explain *why*. Never restate the code.

## Security

Do not open a public issue for a security problem. Follow
[SECURITY.md](SECURITY.md) — private advisory, acknowledged within three days.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Please
read it; it is short and it is enforced.

## License

Contributions are accepted under [ZSL-X](LICENSE). By opening a pull request you
agree that your contribution is licensed under it.

---

## The team

Maintained by **Zyraxon Labs**.

| | |
|:--|:--|
| Author | **onelpawarai** |
| Based in | Bangladesh · operating globally |
| Email | [sayidilxs@gmail.com](mailto:sayidilxs@gmail.com) |
| Website | [zyraxonai.lovable.app](https://zyraxonai.lovable.app/) |
| Cloud Agent | [zyraxon-pro-x.lovable.app](https://zyraxon-pro-x.lovable.app/) |
| Portfolio | [onelpawarai.lovable.app](https://onelpawarai.lovable.app/) |
| YouTube | [@ZYRAXONAI](https://www.youtube.com/@ZYRAXONAI) |
| Facebook | [onelpawarai](https://www.facebook.com/onelpawarai) |
| Access codes | [ZYRAXON Group](https://zyraxon-group-x.lovable.app/) |

---

<p align="center">
  <sub>Questions? <a href="mailto:sayidilxs@gmail.com">sayidilxs@gmail.com</a></sub>
</p>