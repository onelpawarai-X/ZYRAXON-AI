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

## Status

Initial isolated implementation. It is intentionally not wired into existing production paths in this change. Integration should follow focused tests and a review of the current tool execution boundary, especially around approvals, cancellation, idempotency, and logging.
