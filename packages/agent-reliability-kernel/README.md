# Agent Reliability Kernel

A provider-agnostic execution boundary for ZYRAXON AI. This package adds a small, opt-in layer between an agent planner and a tool executor.

## What it enforces

- **Policy before execution:** each tool must authorize its input before it can run.
- **Verification after execution:** success is returned only when the tool's verifier accepts the output.
- **Bounded retries:** retries are disabled for side-effecting tools unless the tool explicitly declares the input retry-safe.
- **Budgets:** caps total calls per kernel instance and checks elapsed time between attempts.
- **Audit events:** emits structured lifecycle events for an application-owned logger or durable audit sink.
- **Cancellation propagation:** passes the caller's AbortSignal to the executor.

## Minimal example

```ts
import { AgentReliabilityKernel } from "@zyraxon-ai/agent-reliability-kernel";

const kernel = new AgentReliabilityKernel({
  maxAttempts: 2,
  maxToolCalls: 6,
  maxElapsedMs: 30_000,
  onEvent: (event) => auditLogger.write(event),
});

const result = await kernel.run(
  {
    name: "read-project-status",
    authorize: () => ({ allowed: true }),
    execute: async (_input, { signal }) => readProjectStatus({ signal }),
    verify: (output) => output.status
      ? { ok: true }
      : { ok: false, reason: "Status field missing" },
    isRetrySafe: () => true,
  },
  {},
  { runId: crypto.randomUUID(), signal: requestSignal },
);

if (!result.ok) {
  // Report the failure. Never present an unverified result as success.
  throw new Error(result.error);
}
```

## Important integration notes

1. Keep authorization policy in the host application; this package does not infer user permissions.
2. Require explicit user approval in the host for destructive, financial, external-publishing, or otherwise high-impact actions.
3. Do not mark a tool retry-safe unless repeated execution is genuinely safe (ideally through idempotency keys).
4. Store audit events in a protected, durable sink if they are needed for compliance or incident review.
5. The kernel does not sandbox tools, persist state, or guarantee that a tool obeys cancellation. Executors must implement those properties.
6. The elapsed-time budget is checked between attempts; a host-level timeout is still needed for tools that can hang.
7. The call budget is shared by this kernel instance. Create a per-run instance or add a run-scoped budget adapter if independent per-run budgets are required.

## Automatic verification against an external system

`VerificationGate` runs checks this repository owns. `AutoVerifier` is the same
idea pointed at *another* system: hand the work to a harness or a service, read a
score back, and decide — with no person running the suite and reading the result.
Three shapes cover almost every system:

- `command` — run a program (a test suite, `swebench.harness.run_evaluation`), and
  read the score from its output or a JSON report it wrote.
- `http` — POST the work to a service (a CI API, a hosted grader), and read the
  score from the response body.
- `swebench` — shorthand that expands to the SWE-bench harness command.

The score is read declaratively: `ratio`, `fraction`, `percent`, `count` or
`boolean`, each a regular expression with one capture group. A run is only
accepted as passed when a score was actually produced and it cleared its
threshold; an exit code with no score is reported as `unscored`, which is
deliberately not the same as passing.

```ts
import { AutoVerifier, swebenchEvaluator, evaluationOk } from "@zyraxon-ai/agent-reliability-kernel";

const verifier = new AutoVerifier({ onOutcome: (o) => console.log(o.status, o.evaluator, o.reason) });

const outcomes = await verifier.evaluateAll(
  [
    {
      kind: "command",
      id: "unit",
      command: "npm",
      args: ["test"],
      score: { kind: "fraction", pattern: "(\\d+)\\s*/\\s*(\\d+)" },
      threshold: { requireAll: true },
    },
    swebenchEvaluator({ dataset: "princeton-nlp/SWE-bench_Verified", minRatio: 0.9, requireAll: false }),
  ],
  { root: process.cwd(), target: { patch: "predictions.jsonl" } },
);

if (!evaluationOk(outcomes)) throw new Error("The work did not score as passing.");
```

### From a config file, and from CI

`src/auto-verify-cli.ts` reads a config, runs every evaluator, writes a JSON
verdict, and exits non-zero unless all of them passed:

```bash
node --import ./scripts/node-test/loader.mjs --experimental-transform-types \
  packages/agent-reliability-kernel/src/auto-verify-cli.ts --config zyraxon-verify.json
```

```json
{
  "evaluators": [
    {
      "kind": "command",
      "id": "unit",
      "command": "npm",
      "args": ["test"],
      "score": { "kind": "fraction", "pattern": "(\\d+)\\s*/\\s*(\\d+)" },
      "threshold": { "requireAll": true }
    },
    { "kind": "swebench", "id": "swe", "minRatio": 0.9, "requireAll": false }
  ]
}
```

`.github/actions/auto-verify` runs that CLI against a checkout, so a workflow
gates on a real score rather than on the agent's own claim. Connecting a new
system is a config change, not a workflow change.

## Status

Initial isolated implementation. It is intentionally not wired into existing production paths in this change. Integration should follow focused tests and a review of the current tool execution boundary, especially around approvals, cancellation, idempotency, and logging.
