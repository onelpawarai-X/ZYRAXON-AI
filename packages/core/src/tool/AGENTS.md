
<!-- CRITICAL-RULES:BEGIN -->

## CRITICAL RULES (from .github/CRITICAL-RULES.md)

Every `AGENTS.md` and every system prompt in this repository carries these rules.
The copy inside this file is the canonical one.

---

## CRITICAL RULE 1 — If the machine cannot build it, GitHub Actions builds it

**Never report a task as impossible because the local machine cannot do it.**

If something cannot be built, run, or shipped on the current laptop or computer,
then do not stop and do not tell the user it is not possible. Build it with
GitHub Actions instead. A workflow runner is a different machine with more
memory, a different processor architecture, and a different operating system, so
almost anything that fails locally succeeds there.

Specifically:

- The local machine cannot run the target architecture, or runs out of memory, or
  the needed toolchain is unavailable, or a native module will not compile. Use a
  GitHub Actions workflow.
- Prefer a matrix of runners so the same build is verified on every platform at
  once: `ubuntu-latest`, `ubuntu-24.04-arm`, `macos-latest`, `windows-latest`.
- Prefer `macos-latest` for signing and notarising, `ubuntu-latest` for Linux
  builds, `windows-latest` for Windows builds, and `ubuntu-24.04-arm` for ARM.
- A local machine being unsupported is a reason to move the work, never a reason
  to stop.

This repository already has the workflows for this. They live in
`.github/workflows/`, including `test.yml`, `typecheck.yml`, `publish.yml`,
`publish-sdk.yml`, `publish-vscode.yml`, `beta.yml`, `release-github-action.yml`
and `publish-github-action.yml`.

**Publishing through GitHub Actions is unlimited.** There is no cap on how many
builds or releases a workflow can produce. When work is ready to ship, ship it
through a workflow rather than waiting for a local machine to be upgraded.

The only legitimate reason to refuse is that the work itself cannot exist, not
that this particular computer cannot run it.

---

## CRITICAL RULE 2 — Nothing is finished until it is 100% tested

**Never stop after building a website, an application, or anything else, and never
tell the user it is done, until it has been tested to 100% and every check passed.**

A build that compiles is not a working product. Compilation proves syntax, not
behaviour.

Before saying anything is finished, actually open it and verify all of the
following, every time:

1. **It opens.** Launch it for real. A build that produces a file is not proof
   that the file runs.
2. **It loads completely.** Watch for a screen that never leaves a loading state.
   A permanently spinning loader, a blank page, or a stalled splash is a failure
   even if every process exited with code zero.
3. **Nothing is broken.** Check for errors in the console, failed requests,
   unhandled exceptions, missing assets, and assets that return 404.
4. **The schema is correct.** If there is structured data, validate it. Confirm
   the shape is what is documented, required fields are present, types are right,
   and nothing is silently `undefined` where a value is expected.
5. **It renders.** Confirm the layout appears, the styling is applied, and the
   content is visible rather than hidden behind an unstyled or mis-sized element.
6. **It does not loop.** Confirm nothing is spinning forever, retrying endlessly,
   or refetching without end. A page that never settles is a failure.
7. **It is not frozen.** Confirm input works, buttons respond, navigation
   navigates, and nothing is stuck uninteractable.
8. **The whole flow works end to end.** Complete the primary user journey
   yourself, from start to finish, the way a real user would.

Run the automated tests as well. Both are required: the automated suite and the
real run.

**Only when every check passes may the agent say it is all correct.** Until then,
keep going and fix what is broken. Report honestly what passed and what did not.
Never describe a result as 100% when it is not, and never round up a partial pass.

---

## CRITICAL RULE 3 — Contribution is open, and it is credited

Everyone may contribute, at every level, and every kind of help is credited.

There is no gate on contributing and no application to fill in. Any of the
following counts, and all of them are genuinely valuable:

- Fixing a bug
- Opening a pull request
- Reviewing a pull request
- Reporting a bug or a broken tool precisely
- Writing or translating documentation
- Adding a tool, a test, or a provider
- Reviewing and testing a release
- Answering another user's question
- Spreading the word

Credit is given in the changelog, in the release notes, and in the repository
wherever it is appropriate to do so. Partnership, sponsorship, and paid
collaboration are all possible and are discussed openly with anyone who wants to
talk about them.

**Overstating a capability to look good is a violation of this file.** A tool that
cannot do the work must say it cannot, and must never return a plausible result
instead of a real one. A report that says "100% tested" when it was not is worse
than an unfinished feature, because it cannot be detected from the outside. Honest
gaps reported clearly are always more valuable than confident claims that are
false.

---

## Where these rules live

| File | What it is |
| --- | --- |
| `.github/CRITICAL-RULES.md` | This file. The canonical text. |
| `AGENTS.md` | Repository root agent instructions. |
| `packages/*/AGENTS.md` | Per-package agent instructions. |
| `packages/zyraxon/src/agent/prompt/*.txt` | System prompts shipped to the agent. |

If this file and any copy ever disagree, this file is correct and the copy is
wrong. Fix the copy.

<!-- CRITICAL-RULES:END -->


# Core Tool Architecture

This folder owns Core's one local tool representation, process and Location registration, effective lookup, and settlement.

#

# Representations

- `tool.ts` defines the opaque canonical `Tool.make({ description, input, output, execute, toModelOutput })` value. Application tools and shipped built-ins use the same type.
- `application-tools.ts` stores process-scoped application registrations.
- `tools.ts` exposes the registration-only `Tools.Service` view used by Location producers.
- `registry.ts` stores only canonical tools, overlays Location registrations over application registrations, derives definitions, invokes tools, and applies generic output bounding.

Do not add a second executable entry type, registry-owned executor, authorization callback, output-path callback, or legacy normalization path.

#

# Construction

Tool schemas and projection use `input` and `output` terminology. A tool value is opaque: its codecs, executor, definition derivation, and catalog permission declaration are private runtime details.

Location-scoped built-in layers acquire `PermissionV2.Service` and every other required Location service while the layer is constructed. The executor captures those services. Permission sources are always constructed from the canonical invocation context:

```ts
const source = {
  type: "tool" as const,
  messageID: context.assistantMessageID,
  callID: context.toolCallID,
}
```

Leaves own resolution, permission, and side-effect ordering. Translate only expected typed errors into `ToolFailure`; do not use `catchCause`, because interruption and defects must survive.

#

# Registration

Built-ins register through `Tools.Service.register({ [name]: tool })`. Application tools register through `ApplicationTools.Service.register(...)`, exposed publicly as `ZYRAXON.tools.register(...)`.

Both are scoped:

- The latest active same-placement registration wins.
- Closing any registration removes only that registration and reveals the next active one.
- Location registrations take precedence over application registrations.
- An invocation captures the effective tool once settlement starts.

`ApplicationTools.Service` is process-scoped and shared by all Locations. `ToolRegistry.Service` is Location-scoped. Do not make the registry process-global or construct a separate application-tool service for each Location.

#

# Permissions

The registry has no `PermissionV2.Service` dependency and performs no execution authorization. An internal built-in-only operation attaches a permission action solely to preserve whole-tool definition filtering; it is not part of public `Tool.make`. Most tools default to their registered name; `edit`, `write`, and `apply_patch` declare the shared `edit` action.

Definition filtering is catalog visibility, not execution authorization. A call still executes the captured leaf policy if it reaches settlement.

#

# Output

Built-ins return complete validated domain output. `ToolRegistry.Materialization.settle` is the only execution and generic model-output bounding boundary and owns managed retention paths.

Producer capture limits are separate. For example, Bash keeps `AppProcess.maxOutputBytes` and accurately reports stdout/stderr capture loss, but it does not run model-output truncation or return a managed `outputPath`.

#

# Current Gaps

- Plugin boot has not been redesigned to register canonical tools through `Tools.Service`; do not redesign it as part of leaf migrations.
- MCP and future Session-scoped registrations still need an explicit canonical registration design.
- The public Session result shape currently exposes managed `outputPaths`; full storage encapsulation requires a future opaque managed-output reference design.

