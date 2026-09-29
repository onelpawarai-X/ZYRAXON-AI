
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


# Test Fixtures Guide

#

# Temporary Directory Fixture

The `tmpdir` function in `fixture/fixture.ts` creates temporary directories for tests with automatic cleanup.

#
#

# Basic Usage

```typescript
import { tmpdir } from "./fixture/fixture"

test("example", async () => {
  await using tmp = await tmpdir()
  // tmp.path is the temp directory path
  // automatically cleaned up when test ends
})
```

#
#

# Options

- `git?: boolean` - Initialize a git repo with a root commit
- `config?: Partial<Config.Info>` - Write an `ZYRAXON.json` config file
- `init?: (dir: string) => Promise<T>` - Custom setup function, returns value accessible as `tmp.extra`
- `dispose?: (dir: string) => Promise<T>` - Custom cleanup function

#
#

# Examples

**Git repository:**

```typescript
await using tmp = await tmpdir({ git: true })
```

**With config file:**

```typescript
await using tmp = await tmpdir({
  config: { model: "test/model", username: "testuser" },
})
```

**Custom initialization (returns extra data):**

```typescript
await using tmp = await tmpdir<string>({
  init: async (dir) => {
    await Bun.write(path.join(dir, "file.txt"), "content")
    return "extra data"
  },
})
// Access extra data via tmp.extra
console.log(tmp.extra) // "extra data"
```

**With cleanup:**

```typescript
await using tmp = await tmpdir({
  init: async (dir) => {
    const specialDir = path.join(dir, "special")
    await fs.mkdir(specialDir)
    return specialDir
  },
  dispose: async (dir) => {
    // Custom cleanup logic
    await fs.rm(path.join(dir, "special"), { recursive: true })
  },
})
```

#
#

# Returned Object

- `path: string` - Absolute path to the temp directory (realpath resolved)
- `extra: T` - Value returned by the `init` function
- `[Symbol.asyncDispose]` - Enables automatic cleanup via `await using`

#
#

# Notes

- Directories are created in the system temp folder with prefix `ZYRAXON-test-`
- Use `await using` for automatic cleanup when the variable goes out of scope
- Paths are sanitized to strip null bytes (defensive fix for CI environments)

#

# Testing With Effects

Use `testEffect(...)` from `test/lib/effect.ts` for tests that exercise Effect services or Effect-based workflows.

#
#

# Core Pattern

```typescript
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(MyService.defaultLayer))

describe("my service", () => {
  it.instance("does the thing", () =>
    Effect.gen(function* () {
      const svc = yield* MyService.Service
      const out = yield* svc.run()
      expect(out).toEqual("ok")
    }),
  )
})
```

#
#

# `it.effect` vs `it.live`

- Use `it.effect(...)` when the test should run with `TestClock` and `TestConsole`.
- Use `it.live(...)` when the test depends on real time, filesystem mtimes, child processes, git, locks, or other live OS behavior.
- Use `it.instance(...)` for live Effect tests that need a scoped temporary directory and instance context.
- Most integration-style tests in this package use `it.live(...)`.

#
#

# Effect Fixtures

Prefer the Effect-aware helpers from `fixture/fixture.ts` instead of building a manual runtime in each test.

- `tmpdirScoped(options?)` creates a scoped temp directory and cleans it up when the Effect scope closes.
- `provideInstance(dir)(effect)` is the low-level helper. It does not create a directory; it runs an Effect with `InstanceRef` provided for `dir`.
- `provideTmpdirInstance((dir) => effect, options?)` is the convenience helper. It creates a temp directory, binds it as the active instance, and disposes the instance on cleanup.
- `provideTmpdirServer((input) => effect, options?)` does the same, but also provides the test LLM server.

Use `it.instance(...)` by default when a test only needs one temp instance. Yield `TestInstance` from `fixture/fixture.ts` when the test needs the temp directory path:

```typescript
import { TestInstance } from "../fixture/fixture"

it.instance("uses the temp directory", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    expect(test.directory).toContain("ZYRAXON-test-")
  }),
)
```

Use `provideTmpdirInstance(...)` or `tmpdirScoped()` plus `provideInstance(...)` when a test needs multiple directories, custom setup before binding, needs to switch instance context within one test, or explicitly tests instance disposal/reload lifetime.

#
#

# Style

- Define `const it = testEffect(...)` near the top of the file.
- Keep the test body inside `Effect.gen(function* () { ... })`.
- Yield services directly with `yield* MyService.Service` or `yield* MyTool`.
- Avoid custom `ManagedRuntime`, `attach(...)`, or ad hoc `run(...)` wrappers when `testEffect(...)` already provides the runtime.
- When a test needs instance-local state, prefer `it.instance(...)` over manual `Instance.provide(...)` inside Promise-style tests.

#
#

# Partial Service Stubs

When a test only needs to override one or two methods of a service, prefer `Layer.mock` over a hand-rolled `Layer.succeed(Service, Service.of({ ... }))`. `Layer.mock` lets you supply just the methods that matter — anything else throws an `UnimplementedError` defect if the test accidentally calls it, which is exactly the signal you want.

```typescript
import { Effect, Layer } from "effect"
import { Account } from "@/account/account"

const failingAccountLayer = Layer.mock(Account.Service, {
  orgsByAccount: () => Effect.fail(new Account.AccountServiceError({ message: "simulated upstream failure" })),
})
```

This is much shorter than stubbing every method with `Effect.void` / `Effect.succeed(...)` placeholders, and it keeps the test focused on the behaviour under test.

#

# Synchronizing With Concurrent Work

#
#

# The Anti-Pattern

Using `Effect.sleep(N)` or `setTimeout` as a "wait for the forked fiber to be ready" hack races the scheduler. The forked fiber may not have reached the synchronization point within `N` ms on a slow CI host, and the test fails intermittently. See PR #27622 for a concrete flake that fell out of this exact pattern.

#
#

# The Fix

Wait on a **published readiness signal**, not wall-clock time. Available affordances:

- `pollWithTimeout(effect, message, duration?)` from `test/lib/effect.ts` — repeatedly run a predicate effect until it returns a non-`undefined` value, with a timeout.
- `awaitWithTimeout(effect, message, duration?)` from `test/lib/effect.ts` — wrap any effect with `Effect.timeoutOrElse` and a custom error message.
- `llm.wait(n)` from `test/lib/llm-server.ts` — wait until the mock LLM has received `n` HTTP calls.
- `SessionStatus.Service` `.get(sessionID)` — observable per-session state (`{ type: "busy" | "idle" | ... }`).
- `BackgroundJob.wait({ id, timeout })` from `src/background/job.ts` — wait for a background job to complete.
- Bus subscriptions — fork `Stream.runForEach(bus.subscribe(Event), ...)` and open a `Latch` inside the callback to signal first-event readiness.
- `Deferred.await(deferred).pipe(Effect.timeoutOrElse(...))` for one-shot signals.

#
#

# Example

```ts
// Antipattern — race
yield * prompt.shell({ command: "sleep 30" }).pipe(Effect.forkChild)
yield * Effect.sleep(50)
yield * prompt.cancel(chat.id)

// Fix — wait for a published readiness signal
yield * prompt.shell({ command: "sleep 30" }).pipe(Effect.forkChild)
yield *
  pollWithTimeout(
    Effect.gen(function* () {
      const s = yield* (yield* SessionStatus.Service).get(chat.id)
      return s.type === "busy" ? (true as const) : undefined
    }),
    "session never became busy",
  )
yield * prompt.cancel(chat.id)
```

#
#

# When Fixed Sleeps Are OK

- Testing debounce or throttle behavior, where the sleep **is** the test.
- Letting real wall-clock advance past a genuine timestamp resolution boundary (e.g. mtime granularity).
- Simulating network latency in race-regression tests that intentionally exercise ordering.

