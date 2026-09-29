
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


# HttpApi Route Patterns

Use `HttpApiBuilder.group(...)` for normal HTTP endpoints, including streaming HTTP responses such as server-sent events. Handlers should yield stable services once while building the handler layer, then close over those services in endpoint implementations.

```ts
export const sessionHandlers = HttpApiBuilder.group(InstanceHttpApi, "session", (handlers) =>
  Effect.gen(function* () {
    const session = yield* Session.Service

    return handlers.handle("list", () => session.list())
  }),
)
```

For SSE endpoints, stay in `HttpApiBuilder.group(...)` and return `HttpServerResponse.stream(...)` from the handler. Annotate the endpoint success schema with `HttpApiSchema.asText({ contentType: "text/event-stream" })` so OpenAPI documents the stream content type.

Use `HttpApiBuilder.group(...)` with `handleRaw(...)` for declared endpoints that need the raw request or response, including WebSocket upgrade routes. This keeps endpoint middleware, routing context, and OpenAPI metadata on one typed route tree.

```ts
export const ptyConnectHandlers = HttpApiBuilder.group(PtyConnectApi, "pty-connect", (handlers) =>
  Effect.gen(function* () {
    const pty = yield* Pty.Service

    return handlers.handleRaw("connect", (ctx) => connectPty(ctx.request, pty))
  }),
)
```

Use raw `HttpRouter.use(...)` only for routes outside the declared API surface, such as a catch-all UI fallback.

Avoid `Effect.provide(SomeLayer)` inside request handlers or raw route callbacks. Stable layers should be provided once at the application/layer boundary, not rebuilt or scoped per request.

Avoid `HttpRouter.provideRequest(...)` unless the dependency is intentionally request-level. Prefer `HttpRouter.use(...)` for stable app services.

Use `Effect.provideService(...)` in middleware only for request-derived context, such as `WorkspaceRouteContext`, `InstanceRef`, or `WorkspaceRef`. Do not use it to smuggle stable services through request effects when they can be yielded at layer construction.

Public JSON errors should be explicit `Schema.ErrorClass` contracts declared on each endpoint. Use built-in `HttpApiError.*` classes only when their empty/tagged body is the intended wire shape; for SDK-visible errors with messages, define an API error schema such as `ApiNotFoundError` and fail with that exact declared error. Keep domain and storage services free of HttpApi types, and translate expected domain errors at the handler boundary.

When adding middleware, declare endpoint-contract middleware on the owning `HttpApiGroup` and provide its implementation layer at the assembly boundary in `server.ts`. Keep router middleware for truly raw fallback routes or global transport policy.

