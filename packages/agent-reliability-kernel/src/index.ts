/**
 * ZYRAXON Agent Reliability Kernel
 *
 * A small, provider-agnostic execution boundary for agent tools. It does not
 * invoke tools itself: callers supply policy, execution, and verification.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type KernelEvent =
  | { type: "started"; runId: string; tool: string; at: number }
  | { type: "blocked"; runId: string; tool: string; reason: string; at: number }
  | { type: "attempt"; runId: string; tool: string; attempt: number; at: number }
  | { type: "verified"; runId: string; tool: string; attempt: number; at: number }
  | { type: "verification_failed"; runId: string; tool: string; attempt: number; reason: string; at: number }
  | { type: "failed"; runId: string; tool: string; attempt: number; reason: string; at: number }
  | { type: "completed"; runId: string; tool: string; attempts: number; elapsedMs: number; at: number };

export interface ToolDefinition<TInput, TOutput> {
  name: string;
  /** Must be side-effect-free and deterministic wherever possible. */
  authorize(input: TInput): Promise<{ allowed: true } | { allowed: false; reason: string }> | { allowed: true } | { allowed: false; reason: string };
  execute(input: TInput, context: { runId: string; attempt: number; signal: AbortSignal }): Promise<TOutput>;
  verify(output: TOutput, input: TInput): Promise<{ ok: true } | { ok: false; reason: string }> | { ok: true } | { ok: false; reason: string };
  /** Return true only when repeating the operation is safe. Defaults to false. */
  isRetrySafe?: (input: TInput) => boolean;
}

export interface KernelOptions {
  maxAttempts?: number;
  maxToolCalls?: number;
  maxElapsedMs?: number;
  /** Called for each event. Keep this sink durable if you need persistent audit logs. */
  onEvent?: (event: KernelEvent) => void;
  /** Allows retrying an operation after a verification failure; defaults to false. */
  retryOnVerificationFailure?: boolean;
}

export type KernelResult<T> =
  | { ok: true; value: T; runId: string; attempts: number; elapsedMs: number }
  | { ok: false; error: string; runId: string; attempts: number; elapsedMs: number; blocked?: boolean };

export class AgentReliabilityKernel {
  private readonly maxAttempts: number;
  private readonly maxToolCalls: number;
  private readonly maxElapsedMs: number;
  private readonly onEvent: (event: KernelEvent) => void;
  private readonly retryOnVerificationFailure: boolean;
  private toolCalls = 0;

  constructor(options: KernelOptions = {}) {
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 2));
    this.maxToolCalls = Math.max(1, Math.floor(options.maxToolCalls ?? 8));
    this.maxElapsedMs = Math.max(1, options.maxElapsedMs ?? 60_000);
    this.onEvent = options.onEvent ?? (() => undefined);
    this.retryOnVerificationFailure = options.retryOnVerificationFailure ?? false;
  }

  async run<TInput, TOutput>(
    tool: ToolDefinition<TInput, TOutput>,
    input: TInput,
    options: { runId: string; signal?: AbortSignal },
  ): Promise<KernelResult<TOutput>> {
    const startedAt = Date.now();
    const { runId } = options;
    const emit = (event: Omit<KernelEvent, "at">) => this.onEvent({ ...event, at: Date.now() } as KernelEvent);
    emit({ type: "started", runId, tool: tool.name });

    const decision = await tool.authorize(input);
    if (!decision.allowed) {
      emit({ type: "blocked", runId, tool: tool.name, reason: decision.reason });
      return { ok: false, error: decision.reason, runId, attempts: 0, elapsedMs: Date.now() - startedAt, blocked: true };
    }

    const retrySafe = tool.isRetrySafe?.(input) ?? false;
    const attemptLimit = retrySafe ? this.maxAttempts : 1;
    let lastError = "Tool execution did not complete";

    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= this.maxElapsedMs) {
        lastError = `Execution budget exceeded (${this.maxElapsedMs}ms)`;
        emit({ type: "failed", runId, tool: tool.name, attempt: attempt - 1, reason: lastError });
        return { ok: false, error: lastError, runId, attempts: attempt - 1, elapsedMs };
      }
      if (this.toolCalls >= this.maxToolCalls) {
        lastError = `Tool-call budget exceeded (${this.maxToolCalls})`;
        emit({ type: "failed", runId, tool: tool.name, attempt: attempt - 1, reason: lastError });
        return { ok: false, error: lastError, runId, attempts: attempt - 1, elapsedMs };
      }
      if (options.signal?.aborted) {
        lastError = "Execution cancelled by caller";
        emit({ type: "failed", runId, tool: tool.name, attempt: attempt - 1, reason: lastError });
        return { ok: false, error: lastError, runId, attempts: attempt - 1, elapsedMs };
      }

      this.toolCalls += 1;
      emit({ type: "attempt", runId, tool: tool.name, attempt });
      try {
        const output = await tool.execute(input, {
          runId,
          attempt,
          signal: options.signal ?? new AbortController().signal,
        });
        const verification = await tool.verify(output, input);
        if (verification.ok) {
          const totalMs = Date.now() - startedAt;
          emit({ type: "verified", runId, tool: tool.name, attempt });
          emit({ type: "completed", runId, tool: tool.name, attempts: attempt, elapsedMs: totalMs });
          return { ok: true, value: output, runId, attempts: attempt, elapsedMs: totalMs };
        }
        lastError = `Verification failed: ${verification.reason}`;
        emit({ type: "verification_failed", runId, tool: tool.name, attempt, reason: verification.reason });
        if (!this.retryOnVerificationFailure) break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        emit({ type: "failed", runId, tool: tool.name, attempt, reason: lastError });
      }
      if (attempt < attemptLimit) {
        // Do not automatically replay side effects: only retrySafe tools reach here.
        continue;
      }
    }

    return { ok: false, error: lastError, runId, attempts: Math.min(attemptLimit, this.toolCalls), elapsedMs: Date.now() - startedAt };
  }
}
