// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Effect } from "effect"

export function runStatsEffect<A, E>(effect: Effect.Effect<A, E>) {
  return Effect.runPromise(effect)
}
