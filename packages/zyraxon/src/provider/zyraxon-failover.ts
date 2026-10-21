// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * ZYRAXON provider failover — the house provider never surfaces a dead model.
 *
 * The ten ZYRAXON models are served by one keyless endpoint, but they do not
 * fail together: a single model can time out, answer `5xx`, or go quiet while the
 * other nine are healthy. When the user picks the slow one — or the fast one has a
 * bad minute — the reply must still arrive. So a failed ZYRAXON call is retried
 * against the next-fastest model in this list, in order, without the user ever
 * seeing an error for a provider that is still able to answer.
 *
 * The order is measured, not guessed: each model was timed against the live
 * endpoint with a one-word streaming prompt, and the list is sorted by median
 * time-to-first-token. `zyraxon-apex` answers in ~0.35s and `zyraxon-visionary`
 * in ~14s, so trying them in this order costs the least possible time on the
 * happy path and still reaches every model before giving up.
 *
 * Only the ZYRAXON provider is reordered this way. Every other provider keeps the
 * exact model the user chose — silently swapping a model on a provider whose
 * catalogue the user is paying for would be a lie about what answered.
 */

import { isContextOverflow } from "@zyraxon-ai/llm"

export const ZYRAXON_PROVIDER_ID = "zyraxon"

/**
 * The ten ZYRAXON models, fastest first.
 *
 * Ordering is by median time-to-first-token against the live endpoint:
 * apex 355ms · titan 1047ms · cyber 1415ms · pulse 1527ms · codex 1734ms ·
 * matrix 1839ms · genesis 1914ms · quantum 3037ms · neural 6591ms ·
 * visionary 14097ms.
 *
 * A model that is not in this list (a future addition, or a user override) is
 * still attempted — it simply sorts after every known model, so the known-fast
 * ones are always tried first.
 */
export const ZYRAXON_MODEL_PRIORITY: ReadonlyArray<string> = [
  "zyraxon-apex",
  "zyraxon-titan",
  "zyraxon-cyber",
  "zyraxon-pulse",
  "zyraxon-codex",
  "zyraxon-matrix",
  "zyraxon-genesis",
  "zyraxon-quantum",
  "zyraxon-neural",
  "zyraxon-visionary",
]

const RANK = new Map(ZYRAXON_MODEL_PRIORITY.map((id, index) => [id, index]))

/**
 * Sort rank for `modelID` — lower is faster, unknown models sort last.
 *
 * Unknown ids share one rank past the end so their relative order is stable
 * rather than arbitrary.
 */
export function zyraxonModelRank(modelID: string): number {
  return RANK.get(modelID) ?? ZYRAXON_MODEL_PRIORITY.length
}

/**
 * The models to try, in order, for a ZYRAXON request that started on `modelID`.
 *
 * `modelID` is always first so a healthy chosen model is never delayed by a
 * probe, and the remaining models follow in measured-fastest order with the
 * chosen one removed. A non-ZYRAXON provider returns just its own model, because
 * failover is a property of the house provider and not a global retry policy.
 */
export function zyraxonFailoverChain(providerID: string, modelID: string): string[] {
  if (providerID !== ZYRAXON_PROVIDER_ID) return [modelID]
  const rest = ZYRAXON_MODEL_PRIORITY.filter((id) => id !== modelID)
  return [modelID, ...rest]
}

/**
 * Whether a failure is worth retrying on another model.
 *
 * A dead model, a refused request, a rate limit, or a timeout all mean "this
 * model cannot answer right now" and are worth another model. A user pressing
 * stop, or a request the user themselves cancelled, is not — retrying it would
 * ignore the cancel. Context overflow is not retried either: every ZYRAXON model
 * shares the same context accounting, so a second model fails identically and the
 * retry would only add latency before the real error surfaces.
 */
export function isFailoverWorthy(input: { aborted?: boolean; contextOverflow?: boolean }): boolean {
  if (input.aborted) return false
  if (input.contextOverflow) return false
  return true
}

/**
 * Whether a stream failure should move to the next model.
 *
 * The error arrives as an unknown thrown by the provider, so it is classified
 * here rather than trusted: a user abort and a context overflow both look like
 * failures but must not be retried, and everything else is a dead model that the
 * next one can serve.
 */
export function shouldFailover(error: unknown, aborted: boolean): boolean {
  if (aborted) return false
  const message = error instanceof Error ? error.message : String(error)
  return isFailoverWorthy({ aborted, contextOverflow: isContextOverflow(message) })
}

export * as ZyraxonFailover from "./zyraxon-failover"
