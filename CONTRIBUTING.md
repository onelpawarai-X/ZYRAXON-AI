<!--
  Copyright (c) 2026 onelpawarai. All rights reserved.
  SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-->

# Contributing to ZYRAXON

First of all: thank you. Whether you are fixing a typo, reporting something that
behaves strangely, or rewriting a subsystem — all of it counts, and all of it is
reviewed by a person who reads the code.

This document is the whole of what you need. It is deliberately short.

But contribution to ZYRAXON is not limited to code.

You can contribute as a developer, designer, researcher, tester, technical writer,
translator, security researcher, MCP integrator, documentation author, or simply
as someone who notices something that could be better.

If you can improve ZYRAXON, there is a place for your contribution.

---

## Contents

* [Before you start](#before-you-start)
* [What you can contribute](#what-you-can-contribute)
* [Setting up](#setting-up)
* [How the codebase is organised](#how-the-codebase-is-organised)
* [Making a change](#making-a-change)
* [Working on the user experience](#working-on-the-user-experience)
* [Design contributions](#design-contributions)
* [Feature contributions](#feature-contributions)
* [Commit and branch naming](#commit-and-branch-naming)
* [Checks](#checks)
* [Opening a pull request](#opening-a-pull-request)
* [What a good pull request looks like](#what-a-good-pull-request-looks-like)
* [Review](#review)
* [Reporting a bug](#reporting-a-bug)
* [Proposing something large](#proposing-something-large)
* [Adding a tool](#adding-a-tool)
* [Adding an MCP app](#adding-an-mcp-app)
* [Adding a translation](#adding-a-translation)
* [Documentation contributions](#documentation-contributions)
* [Accessibility and usability](#accessibility-and-usability)
* [Testing and verification](#testing-and-verification)
* [Performance improvements](#performance-improvements)
* [Style](#style)
* [Security](#security)
* [Code of conduct](#code-of-conduct)
* [License](#license)

---

## Before you start

* Search the [issues](https://github.com/onelpawarai-X/ZYRAXON-AI/issues) and
  open pull requests first. Someone may already be working on it, and a
  duplicate costs everyone more than a small delay.
* If you are unsure whether something is a bug or intended behaviour, open an
  issue and ask. That is a perfectly good contribution.
* **Security problems do not go in the issue tracker.** See
  [SECURITY.md](SECURITY.md).

A contribution does not have to begin with code.

If you have found something confusing, broken, visually inconsistent, difficult
to use, poorly documented, unnecessarily slow, or missing entirely, you can
start by opening an issue and explaining what you found.

You do not need to know exactly how to fix something before reporting it.

A useful observation can become an issue. An issue can become a design discussion.
A design discussion can become a pull request. A pull request can become part of
ZYRAXON.

---

## What you can contribute

There is no single "correct" way to contribute to ZYRAXON.

### Code

You can contribute:

* Bug fixes
* Refactors
* Performance improvements
* Reliability improvements
* Type-safety improvements
* Tests
* Developer tooling
* SDK improvements
* Protocol improvements
* Server improvements
* Client improvements
* Desktop improvements
* Agent improvements
* Session and state management
* Error handling
* Runtime improvements
* Build and packaging improvements

### Agent and AI work

You can also improve the agent itself:

* Tool behaviour
* Tool descriptions
* Prompt behaviour
* Agent workflows
* Session handling
* Model-facing interfaces
* Agent reliability
* Context handling
* Task execution
* Failure recovery
* Verification flows
* Model/tool coordination
* MCP behaviour
* Provider integrations
* AI-assisted developer workflows

When changing behaviour that affects how the agent reasons, acts, or selects
tools, explain the intended behaviour clearly in the issue or pull request.

### MCP and integrations

ZYRAXON is designed to work with external applications and tools.

You can contribute:

* New MCP applications
* MCP catalog entries
* MCP verification
* Authentication improvements
* OAuth discovery improvements
* Tool discovery improvements
* Integration fixes
* Better integration metadata
* Provider-specific fixes
* Reliability improvements for existing integrations

See [Adding an MCP app](#adding-an-mcp-app) below for the verification
requirements.

### Design and UI/UX

You do not need to be a backend developer to contribute.

Designers can help with:

* UI redesigns
* Visual polish
* Layout improvements
* Interaction design
* UX improvements
* Empty states
* Loading states
* Error states
* Navigation
* Typography
* Spacing
* Accessibility
* Responsive behaviour
* Component design
* Design-system improvements
* Desktop application experience
* TUI experience
* Web application experience
* Onboarding
* Settings
* Developer experience

If a design change affects the core product direction, discuss it before
implementing a large change. See [Design contributions](#design-contributions).

### Documentation

Documentation is code-adjacent work and is equally valuable.

You can improve:

* README files
* Guides
* Examples
* API documentation
* Tool documentation
* MCP documentation
* Installation instructions
* Development instructions
* Troubleshooting
* Comments
* Architecture documentation
* Translation
* Contributor documentation

A documentation pull request does not need to change source code.

### Issues

Opening an issue is a contribution.

Use an issue when you:

* Find a reproducible bug
* Notice confusing behaviour
* Have a feature idea
* Have a design problem to report
* Find a documentation problem
* Discover a performance problem
* Notice an accessibility issue
* Want to propose an architectural improvement
* Need clarification about intended behaviour

A good issue gives the team something concrete to understand and act on.

### Pull requests

If you know how to fix or improve something, open a pull request.

Small fixes are welcome.

Large changes are welcome too, but they should normally begin with discussion
so that the implementation has a clear direction before significant work begins.

---

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

* The build runs in **five ordered steps** — core, node sidecar, web UI, Electron
  shell, installer. Each depends on the last, so skipping ahead produces a
  confusing error rather than a useful one.

* If the build runs out of memory, raise the heap first:

  ```bash
  export NODE_OPTIONS="--max-old-space-size=16384"
  ```

* Tests cannot run from the repository root. Run them from the package you
  changed:

  ```bash
  bun test --cwd packages/zyraxon
  ```

If you are making a UI-only, documentation-only, or design-only contribution,
you may not need to build every part of the project. Run the checks relevant to
what you changed and explain anything you could not run.

---

## How the codebase is organised

Dependencies point one way and only one way:

```text
Desktop / TUI / SDK  →  Client · Session-UI  →  SDK · Protocol  →  Core · Schema · Server
```

Client runtime code may depend on Schema and Protocol but **never** on Core or
Server. If you find yourself wanting to import from Core into a client module,
that is a signal the thing you need belongs somewhere else — ask in an issue
rather than reaching across the boundary.

| Package               | Holds                                               |
| :-------------------- | :-------------------------------------------------- |
| `packages/schema`     | The data shapes everything agrees on                |
| `packages/core`       | Effects runtime, configuration, database, utilities |
| `packages/protocol`   | The wire types                                      |
| `packages/server`     | HTTP API and server routes                          |
| `packages/zyraxon`    | The agent: tools, session, MCP, prompts             |
| `packages/sdk`        | Generated client                                    |
| `packages/client`     | UI state and data layer                             |
| `packages/app`        | The application shell                               |
| `packages/ui`         | Design system                                       |
| `packages/session-ui` | Chat, timeline and composer                         |
| `packages/desktop`    | Electron shell, TTS, task daemon, packaging         |

Two conventions worth knowing on day one:

**The agent is written against Effect, not ad-hoc async.** Cancellation, timeouts,
retries and resource lifetimes are part of a function's type rather than
something each call site has to remember. If you are reaching for a bare promise
where an Effect would do, that is worth a second look.

**Generated code is generated.** After changing the public Protocol or the server
HTTP API, run `bun run generate` from `packages/client`. Do not edit anything
under `src/generated` by hand — it will be overwritten.

When contributing across package boundaries, keep the dependency direction in
mind. If a change seems to require breaking the existing boundary, discuss it
before implementing it.

---

## Making a change

1. Fork the repository and create a branch.
2. Make the smallest change that fully solves the problem.
3. Run the checks (below).
4. Open a pull request against `dev`.

### Guidelines that save everyone time

* **Match the surrounding code.** Indentation, naming, comment density — follow
  what is already there rather than your own preference.
* **Comment the non-obvious, not the obvious.** A line that restates itself is
  noise. A comment explaining *why* something is done this way is worth more
  than the line it sits above.
* **Avoid `try`/`catch` and `any`.** Both are almost always avoidable here, and
  both hide failures rather than handling them.
* **Prefer `const`.** Reassignment is rarely the clearest option.
* **Prefer early returns to `else`.**
* **No stray test files.** Scratch scripts and temporary probes do not get
  committed.
* **Never commit secrets.** No API keys, tokens, logs or customer data — not in
  source, not in a fixture, not in a comment.

Keep changes focused.

If you discover another unrelated problem while working, it is usually better
to open another issue than silently expand the scope of the current pull
request.

---

## Working on the user experience

ZYRAXON is used by people, not just by code.

A contribution that improves how something feels or behaves is a real
contribution even when it changes very little source code.

When working on user-facing behaviour, consider:

* Is the purpose of the screen or action obvious?
* Is the result understandable?
* Does the interface provide useful feedback?
* What happens while something is loading?
* What happens when something fails?
* What happens when there is no data?
* Does the user know what to do next?
* Does the experience remain understandable at different screen sizes?
* Does the change introduce unnecessary complexity?
* Does the visual hierarchy match the importance of the information?

Avoid changing established interaction patterns without a reason.

If a visual or interaction change is large enough to affect the product direction,
discuss it first.

---

## Design contributions

Designers are welcome contributors.

You can contribute without changing the underlying agent architecture.

Examples include:

* Redesigning an existing screen
* Improving a component
* Creating a missing component
* Improving spacing and hierarchy
* Improving typography
* Improving states and feedback
* Improving onboarding
* Improving navigation
* Improving settings
* Improving empty states
* Improving error states
* Improving responsive layouts
* Improving accessibility
* Improving consistency across the product
* Proposing a new visual direction

For substantial design changes, explain:

1. What problem the design solves.
2. Who the change helps.
3. What the current experience makes difficult.
4. What the proposed experience changes.
5. Why the proposed approach is better.

Screenshots, recordings, mockups, or design files are useful when they make the
change easier to review.

A design pull request should make it possible for reviewers to understand both
the visual result and the reason behind it.

---

## Feature contributions

New features are welcome.

Before implementing a substantial feature, open an issue describing:

* The problem
* The proposed behaviour
* Why the feature belongs in ZYRAXON
* Who it benefits
* Any important technical or design considerations

This gives maintainers an opportunity to discuss the direction before significant
implementation work begins.

Small, obvious improvements can often go directly into a pull request.

For larger features, see [Proposing something large](#proposing-something-large).

A feature should not be added simply because it is possible.

A good feature solves a real problem, fits the existing architecture, and does
not create unnecessary complexity for users or maintainers.

---

## Commit and branch naming

Conventional commits, always:

```text
type(scope): summary
```

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor` and `test`. The scope
is optional and should name the package or area when it helps:

```text
feat(mcp): add Stripe to the verified catalog
fix(composer): stop dictation from erasing the typed draft
docs: correct the tool counts in the README
```

Branch names are up to three words, hyphen-separated. No slashes, no type
prefixes:

```text
session-recovery
fix-scroll-state
regenerate-sdk
```

Keep commit messages understandable.

A reviewer should be able to look at the history and understand what each change
was intended to accomplish.

---

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

For UI changes, also verify the relevant screen manually.

For design changes, verify the actual rendered result rather than reviewing only
the source.

For MCP changes, verify the integration against a real endpoint as described in
[Adding an MCP app](#adding-an-mcp-app).

---

## Opening a pull request

Your description should let a reviewer understand the change **without opening
it**. That means:

* **What** you changed and **why** — the problem, not just the diff.
* **How** you verified it. What you ran, what you clicked, what you observed.
* **What** you deliberately did not do, if it came up.
* Anything you are unsure about, stated plainly. "This works on my machine and I
  could not reproduce the failure on Windows" is genuinely useful.

Use a clear title:

```text
fix(voice): submit the transcript when the bridge send button is used
```

Draft pull requests are welcome if you want a design opinion before finishing.

When opening a PR, include screenshots or recordings when they make the result
easier to understand, especially for:

* UI changes
* Visual changes
* Interaction changes
* Responsive changes
* Desktop changes
* Animation changes

A reviewer should not have to reconstruct a visual change entirely from code.

---

## What a good pull request looks like

* One concern. If it does two things, it is two pull requests.
* The description explains why, not what — the diff already says what.
* Reviewers can verify the claim from the description alone.
* No drive-by reformatting. If you ran a formatter, that belongs in its own
  commit.
* No unexplained binary or generated-file changes.

A strong pull request is easy to understand, easy to test, and easy to review.

It does not need to be perfect before opening.

If you are unsure about something, say so.

Early, honest discussion is better than hiding uncertainty until the end.

---

## Review

Every pull request is read by a human. Expect comments — they are about the code,
not about you. Reply to each one, even if the reply is "good catch, fixed". When
review asks for a change, push a commit rather than force-pushing, so the
discussion stays attached to the code.

Once approved it will be merged into `dev`. The `main` branch is cut for
releases.

Review is part of contribution, not an obstacle to contribution.

Reviewers may question:

* Architecture
* Behaviour
* UX
* Security
* Performance
* Maintainability
* Tests
* Scope
* Documentation
* Design consistency

The goal is to make ZYRAXON better, not to make contributors feel unwelcome.

---

## Reporting a bug

A good report contains:

1. **What you did**, and **what happened instead** — numbered steps are ideal.
2. **What you expected** to happen.
3. **The exact version or commit** you tested.
4. **Your platform** — OS, version, architecture.
5. The relevant log output, if you have it.

Screenshots help for anything visual. Please redact anything personal from them.

If possible, include a minimal reproduction.

A good bug report should help another person reproduce the problem without
having to guess what you meant.

If the behaviour only happens under specific conditions, describe those
conditions clearly.

---

## Proposing something large

Architecture changes, new subsystems and anything that rewrites a package
boundary are better discussed before written. Open an issue describing the
problem and your proposed shape. That is not a gate on contributing — it just
means a week of discussion is cheaper than a week of work in the wrong direction.

Large proposals may include:

* New subsystems
* New runtimes
* New agent architectures
* Major UI redesigns
* Major package restructuring
* New persistence models
* New protocol behaviour
* Large MCP infrastructure changes
* New application-level workflows
* Major desktop changes

For a large proposal, explain the problem first.

The implementation can evolve during discussion.

---

## Adding a tool

1. Create the tool under `packages/zyraxon/src/tool/`.
2. Register it in `packages/zyraxon/src/tool/registry.ts`.
3. Record its required tier in
   `packages/zyraxon/src/subscription/tier-map.ts`. This file is sorted by tier —
   keep it that way, and do not add a tier that is not already defined.
4. Describe it so clearly that a model can decide when to reach for it. The
   description is the only thing the model sees.

When adding a tool, think about:

* What problem does it solve?
* When should the agent use it?
* When should the agent not use it?
* What inputs does it require?
* What happens when it fails?
* Does it expose sensitive information?
* Does it require a particular subscription tier?
* Can the result be verified?

A tool should have a clear purpose and predictable behaviour.

---

## Adding an MCP app

Apps live in `MCP Hub/catalog/seed.ts`.

**Verify the endpoint before adding it.** An entry that connects but cannot call
a tool is worse than no entry, because it looks like it works:

1. Send an `initialize` request.
2. Check the `WWW-Authenticate` header for `resource_metadata` — that is what
   tells you the server speaks OAuth with discovery.
3. Fetch `/.well-known/oauth-authorization-server` and confirm a
   `registration_endpoint` exists if you are marking the app `oauth`.
4. Send `tools/list`.
5. Call one read-only tool and confirm real data comes back.

Then pick the `kind` honestly:

| `kind`  | Use when                                            |
| :------ | :-------------------------------------------------- |
| `oauth` | It completes sign-in through the vendor's own OAuth |
| `none`  | It answers with no sign-in at all                   |
| `token` | It needs a key the user creates themselves          |

A 401 is **not** evidence of OAuth. Plenty of servers simply refuse an anonymous
request. Check for the metadata.

Set `via` when the server is not run by the vendor — it is shown on the card so
nobody hands an account to a third party by surprise.

Do not add an MCP integration merely because a URL exists.

The integration should be verified as a real, working endpoint.

If an MCP server exposes tools that cannot actually be called, do not describe it
as fully supported.

---

## Adding a translation

Translated READMEs live beside the main one as `README.<locale>.md`. If you
speak a language we do not have, adding it is genuinely useful.

Keep the structure of `README.md` intact and translate the prose. Leave code
blocks, badge URLs and link targets untouched — a translated README with a broken
build badge is worse than none.

Translations are welcome for documentation, onboarding, contributor guides, and
other appropriate project content.

Keep technical names, commands, package names, API names, and code identifiers
unchanged unless there is a strong reason to localize them.

---

## Documentation contributions

Documentation can be improved independently of source code.

You can submit a PR to:

* Fix incorrect information
* Clarify confusing instructions
* Add missing examples
* Improve setup instructions
* Add troubleshooting information
* Improve API explanations
* Explain architecture
* Document tools
* Document MCP integrations
* Improve contributor guidance
* Correct spelling and grammar
* Add diagrams or visual explanations where appropriate

Documentation changes should be accurate.

If documentation describes a command, verify that the command still works.

If documentation describes a feature, verify that the feature exists.

---

## Accessibility and usability

Accessibility is part of product quality.

When working on the interface, consider:

* Keyboard navigation
* Focus states
* Readable typography
* Sufficient visual distinction
* Clear error messages
* Meaningful labels
* Screen-reader-friendly structure where applicable
* Reduced reliance on colour alone
* Usable controls at different sizes
* Clear loading and disabled states

If you find an accessibility problem, reporting it as an issue is already a
valuable contribution.

---

## Testing and verification

Tests should reflect the behaviour your change is intended to provide.

When possible:

* Add a regression test for a bug you fixed.
* Add tests for new logic.
* Test important failure paths.
* Verify edge cases.
* Test the relevant package rather than relying only on unrelated global checks.

For UI changes, manual verification matters too.

For integrations, verify the real integration rather than only mocking the
connection.

For agent behaviour, verify the actual user-visible result where possible.

If something cannot reasonably be tested in your environment, explain that in
the pull request.

---

## Performance improvements

Performance contributions are welcome.

Examples include:

* Faster startup
* Lower memory usage
* Reduced unnecessary work
* Faster tool execution
* Better rendering performance
* Reduced network overhead
* Improved caching
* Better build performance
* Improved agent responsiveness

When submitting a performance change, provide evidence when possible.

Examples:

* Before/after timing
* Memory usage
* Request counts
* Build duration
* Rendering measurements
* Reproduction steps

Avoid optimizing something solely because it looks theoretically expensive.

Measure first when practical.

---

## Style

Follow what is already in the file you are editing. Beyond that:

* Two-space indentation.
* Double quotes.
* No semicolons at end of statements, except where the file uses them.
* Comments explain *why*. Never restate the code.

Consistency matters more than personal preference.

---

## Security

Do not open a public issue for a security problem. Follow
[SECURITY.md](SECURITY.md) — private advisory, acknowledged within three days.

Never include secrets in:

* Issues
* Pull requests
* Screenshots
* Logs
* Fixtures
* Documentation
* Source code
* Comments

If you accidentally expose a credential while working on a contribution, stop
and report it through the appropriate private security channel.

---

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Please
read it; it is short and it is enforced.

Contributors are expected to communicate respectfully.

Technical disagreement is normal.

Personal attacks are not.

---

## License

Contributions are accepted under [ZSL-X](LICENSE). By opening a pull request you
agree that your contribution is licensed under it.

---

## The team

Maintained by **Zyraxon Labs**.

|              |                                                                 |
| :----------- | :-------------------------------------------------------------- |
| Author       | **onelpawarai**                                                 |
| Based in     | Bangladesh · operating globally                                 |
| Email        | [sayidilxs@gmail.com](mailto:sayidilxs@gmail.com)               |
| Website      | [zyraxonai.lovable.app](https://zyraxonai.lovable.app/)         |
| Cloud Agent  | [zyraxon-pro-x.lovable.app](https://zyraxon-pro-x.lovable.app/) |
| Portfolio    | [onelpawarai.lovable.app](https://onelpawarai.lovable.app/)     |
| YouTube      | [@ZYRAXONAI](https://www.youtube.com/@ZYRAXONAI)                |
| Facebook     | [onelpawarai](https://www.facebook.com/onelpawarai)             |
| Access codes | [ZYRAXON Group](https://zyraxon-group-x.lovable.app/)           |

---

<p align="center">
  <sub>Questions? <a href="mailto:sayidilxs@gmail.com">sayidilxs@gmail.com</a></sub>
</p>
