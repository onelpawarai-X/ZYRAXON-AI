# Contributing to ZYRAXON

Thank you for wanting to build with us. ZYRAXON grows in proportion to the people
who contribute to it, and this document explains exactly how to join, what we are
building next, and where things honestly stand today.

- **Repository:** https://github.com/onelpawarai-X/ZYRAXON-AI
- **Default branch:** `dev`
- **Licence:** [ZSL-X](LICENSE) — free to use, free to change, not for sale.
- **Questions:** open a [Discussion](https://github.com/onelpawarai-X/ZYRAXON-AI/discussions)

---

## 1. The short version

1. Fork the repository and branch off `dev`.
2. Branch names are at most three words, hyphenated. No slashes, no type prefixes.
   Good: `session-recovery`. Bad: `feat/new-thing-v2`.
3. Make one focused change.
4. Add the licence header to any new source file (see section 7).
5. Run the tests from a package directory, never from the repository root.
6. Open a pull request against `dev` using a conventional commit title.

That is the whole process. Everything below is detail.

---

## 2. Setting up

**You need:** Bun 1.3 or newer, Node.js 20 or newer, Git.

```bash
git clone https://github.com/YOUR_USERNAME/ZYRAXON-AI.git
cd ZYRAXON-AI
bun install
```

**Run it locally:**

```bash
bun run dev            # the agent
bun run dev:desktop    # the desktop app
bun run dev:web        # the web app
```

**Build everything, including the SDK:**

```bash
bun run zyraxon:build
```

The SDK is built as part of this command. You never need to build it separately,
and you should not commit anything from `dist` or `out`. Those directories are
build output, they are ignored, and the build regenerates them every time.

---

## 3. Before you open a pull request

Run these from inside the package you changed. Tests are blocked at the repository
root on purpose, so a root-level run will refuse to start.

```bash
cd packages/zyraxon
bun test
bun run typecheck
```

**Commit messages and pull request titles** follow conventional commits:
`type(scope): summary`. Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`,
`test`. Scopes are optional. Examples: `fix(tui): simplify thinking toggle styling`,
`chore(sdk): regenerate types`.

**Generated code is never hand-edited.** If you change a public protocol or HTTP
API, run the generator instead:

```bash
cd packages/client
bun run generate
```

Never edit anything under `src/generated` or `src/generated-effect` directly.

**When you change a legacy SDK**, regenerate it rather than patching it:

```bash
./packages/sdk/js/script/build.ts
```

---

## 4. What we are building next

This is the direction we are committed to. Contributions that move any of these
forward are the most welcome contributions there are.

### 4.1 Our own provider

We are building a first-party model provider so that ZYRAXON can run on our own
inference rather than depending entirely on third parties. This is the single
largest piece of infrastructure work ahead of us.

It has to be genuinely good, not merely present. That means routing, failover,
quota accounting, streaming, tool-calling correctness, and a cost model that
survives real use.

### 4.2 Community providers

We want third-party providers to be first-class, and we want to credit the people
who make that happen.

If you build or maintain a provider that works with ZYRAXON, open a pull request
adding it to the provider list. Once merged you are listed as a supported provider
in the documentation and in the application, and contributors to that provider are
acknowledged alongside it.

This is a standing offer, not a one-time campaign. Provider support is treated as
a first-class contribution category, alongside tools and agents.

### 4.3 Marketplace

The marketplace exists. It is the weakest part of the product today and the
clearest opportunity for new contributors. Improvements we want: better search
and ranking, real install and update flows, verification that a listed package
actually works, screenshots and previews in the listing, and honest presentation
of what a package does before install.

### 4.4 Cloud agents

Agents that run for you rather than waiting for you to type. Long-running tasks,
scheduled work, and background execution are the goal. The interesting part is not
the scheduling, it is the safety: a cloud agent that can take real actions needs
permissions that are explicit, visible, and revocable.

### 4.5 The control systems, and what the tiers really mean

ZYRAXON ships a large set of control systems spanning aircraft, ground vehicles,
drones, boats, rockets, robots, algorithms, sensors and actuators. They are not
decorative labels, and they are not a list of stubs. They are the long-term shape
of the product, and we are bringing them online.

The agent tiers — General, Build, Plan, Beast, PRO, APEX PREDATOR, DARK EMPEROR,
VISION, PRO BUILDER — are the delivery mechanism. Each tier should grant access to
capabilities that are real at the moment of use. A tier that advertises a
capability must have a working implementation behind it.

**Being honest about where this stands.** Some tiers already do real work. The
computer-control, media, planning, learning and browser-automation tool sets are
implemented and covered by tests. Large parts of the higher-tier vehicle, marine,
aviation and space control surfaces are still being wired to live subsystems. We
will not claim a capability works before it does, and we would rather tell you
something is in progress than have you discover it yourself.

**The most valuable thing you can contribute here is a gap.** Find a tier that
advertises something which is not yet real, and either implement it or tell us
precisely what is missing. Closing the gap between what is promised and what is
real is the most respected contribution we can receive, and we will credit it.

---

## 5. Adding a tool

A tool that reports a fixed answer is not a tool. It must do the work, and it must
fail honestly when it cannot. A tool that invents a plausible result is worse than
a missing tool, because it cannot be detected from the outside.

```bash
# 1. implement
packages/zyraxon/src/tool/your_tool.ts

# 2. describe
packages/zyraxon/src/tool/your_tool.txt

# 3. register
packages/zyraxon/src/tool/registry.ts

# 4. prove it
packages/zyraxon/test/your_tool.test.ts
```

**The rules that matter:**

- Do the real work. Call the real system.
- Never return a fabricated success, a simulated result, or a hardcoded verdict.
- When a prerequisite is missing, say so plainly and name what is missing.
- Never leave a test file behind. Tests belong in the suite or they do not exist.
- Register the tool so the registry actually exposes it, then verify the ID
  resolves. A tool that is written but unregistered is invisible.

---

## 6. Adding an agent mode

1. Define the agent in `packages/zyraxon/src/agent/agent.ts` with its name,
   description, permissions and tool access.
2. Add the prompt in `packages/zyraxon/src/agent/prompt/`.
3. Map the mode to a subscription tier in the tier map, so gating is explicit.
4. If the mode is a fork of an earlier edition, record that lineage in its own
   licence file. Never imply a fork is the upstream edition.

---

## 7. Licence headers

Every new source file carries this notice. The year is maintained automatically
each 1 January, so you never need to update it by hand.

```ts
// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.
```

For other languages, use that language's comment syntax and keep the same two
lines. `scripts/copyright-header.ts` applies the correct form for each file type:

```bash
bun run scripts/copyright-header.ts           # apply to everything that can carry it
bun run scripts/copyright-header.ts --check   # report only, write nothing
bun run scripts/copyright-year.ts             # restamp the year
```

The script never edits a file that cannot legally hold a comment: JSON, lockfiles,
images, fonts, archives, and generated trees. If your file is skipped, that is why.

---

## 8. What contributions are welcome

- **Tools** that do real work and fail honestly.
- **Providers**, per section 4.2.
- **Marketplace**, per section 4.3.
- **Cloud agents**, per section 4.4.
- **Control system gaps**, per section 4.5.
- **Tests** for anything currently untested.
- **Documentation**, including translations.
- **Build and packaging fixes.**

The common thread: we would rather have a smaller, working thing than a larger
promised one.

---

## 9. Reporting a bug

1. Search existing issues first.
2. Use the **Bug Report** template.
3. Include reproduction steps, expected behaviour, actual behaviour, your OS, and
   your ZYRAXON version.
4. Attach a screenshot or a screen recording if the issue is visual.

**Security issues** should not be opened as a public issue. Contact the maintainer
privately first so a fix can be prepared before disclosure. See section 11.

---

## 10. Reporting a licence violation

If you believe someone is reselling ZYRAXON, publishing a modified copy as their
own, or stripping the origin notice, send:

- Your contact details
- The URL or location of the infringing copy
- What the infringement is
- Any evidence you have, with dates

Legal notices go to the maintainer's designated address, not to the issue tracker.
Full procedure and evidence requirements are in [legal/DMCA-NOTICE.md](legal/DMCA-NOTICE.md).

We take this seriously and we act on it. Licensing is what funds the project.

---

## 11. Security disclosure

Discover a vulnerability? Report it privately before any public disclosure. We will
make a genuine effort to address it promptly. Please give us a reasonable window to
ship a fix before you disclose publicly.

---

## 12. Conduct

Be decent to each other. Assume good faith, critique the work and never the person,
and help newcomers. The full expectations are in
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## 13. Licence of contributions

Contributions are accepted under ZSL-X. You keep ownership of what you write, and
you grant the patent and copyright permissions set out in the licence. By opening a
pull request you confirm that you have the right to contribute the work, and that
you are not knowingly submitting anything that infringes someone else's rights or
that would remove a protection the licence depends on.

---

## 14. One last thing

If you find a bug, a broken tool, an overstated claim, or a gap between what the
documentation promises and what the code does, tell us. That report is worth more
than a polished pull request, and we treat it that way.

Welcome. Build something real.
