// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Backoff policy for restarting the local server sidecar after it exits.
 *
 * The sidecar is a child process, so it can die from an out-of-memory kill, a
 * crash, or a machine waking from sleep. Previously an exit only produced a log
 * line, which is why the server looked like it "kept stopping and starting":
 * nothing brought it back, and the UI kept polling a dead port.
 *
 * This is deliberately pure so the policy can be tested without Electron.
 */
export type BackoffPolicy = {
  readonly baseMs: number
  readonly maxMs: number
  readonly maxAttempts: number
}

export const defaultBackoff: BackoffPolicy = {
  baseMs: 500,
  maxMs: 30_000,
  maxAttempts: 5,
}

/** Delay before restart number `attempt` (1-based), capped at `maxMs`. */
export function backoffDelay(attempt: number, policy: BackoffPolicy = defaultBackoff): number {
  if (attempt <= 1) return policy.baseMs
  return Math.min(policy.baseMs * 2 ** (attempt - 1), policy.maxMs)
}

export type RestartDecision = { readonly restart: true; readonly delayMs: number } | { readonly restart: false; readonly reason: string }

/**
 * Decide whether an exit should trigger a restart.
 *
 * A deliberate stop is never a restart: the caller is either quitting the app or
 * swapping the server out, and racing a restart against that teardown is how you
 * get two servers fighting over one port.
 */
export function decideRestart(input: {
  attempt: number
  quitting: boolean
  stoppedDeliberately: boolean
  policy?: BackoffPolicy
}): RestartDecision {
  if (input.quitting) return { restart: false, reason: "app is quitting" }
  if (input.stoppedDeliberately) return { restart: false, reason: "server was stopped deliberately" }
  const policy = input.policy ?? defaultBackoff
  if (input.attempt > policy.maxAttempts) return { restart: false, reason: `gave up after ${policy.maxAttempts} attempts` }
  return { restart: true, delayMs: backoffDelay(input.attempt, policy) }
}
