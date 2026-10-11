import { describe, expect, test } from "bun:test";
import { AgentReliabilityKernel } from "../src/index";

describe("AgentReliabilityKernel", () => {
  test("blocks a tool before execution when policy denies it", async () => {
    let executed = false;
    const kernel = new AgentReliabilityKernel();
    const result = await kernel.run(
      {
        name: "blocked-tool",
        authorize: () => ({ allowed: false as const, reason: "Approval required" }),
        execute: async () => {
          executed = true;
          return "done";
        },
        verify: () => ({ ok: true as const }),
      },
      {},
      { runId: "test-blocked" },
    );

    expect(result.ok).toBe(false);
    expect(executed).toBe(false);
    if (!result.ok) expect(result.blocked).toBe(true);
  });

  test("retries retry-safe operations and only succeeds after verification", async () => {
    let calls = 0;
    const kernel = new AgentReliabilityKernel({ maxAttempts: 2, retryOnVerificationFailure: true });
    const result = await kernel.run(
      {
        name: "retry-safe-tool",
        authorize: () => ({ allowed: true as const }),
        execute: async () => ({ ready: ++calls === 2 }),
        verify: (output) => output.ready
          ? ({ ok: true as const })
          : ({ ok: false as const, reason: "Output not ready" }),
        isRetrySafe: () => true,
      },
      {},
      { runId: "test-retry" },
    );

    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    if (result.ok) expect(result.attempts).toBe(2);
  });

  test("does not retry a side-effecting tool unless explicitly marked safe", async () => {
    let calls = 0;
    const kernel = new AgentReliabilityKernel({ maxAttempts: 3 });
    const result = await kernel.run(
      {
        name: "side-effect-tool",
        authorize: () => ({ allowed: true as const }),
        execute: async () => {
          calls += 1;
          throw new Error("temporary failure");
        },
        verify: () => ({ ok: true as const }),
      },
      {},
      { runId: "test-no-replay" },
    );

    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
    if (!result.ok) expect(result.attempts).toBe(1);
  });
});
