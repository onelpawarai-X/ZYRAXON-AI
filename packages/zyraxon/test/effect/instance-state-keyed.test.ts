// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect } from "bun:test"
import { Effect, Ref } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { it } from "../lib/effect"

describe("InstanceState keyed cache", () => {
  it.effect("shares one entry per key and isolates different keys", () =>
    Effect.gen(function* () {
      const builds = yield* Ref.make<string[]>([])
      const state = yield* InstanceState.makeKeyed<string>((key) =>
        Ref.update(builds, (list) => [...list, key]).pipe(Effect.as(`value:${key}`)),
      )

      const first = yield* InstanceState.getKeyed(state, "sig-a")
      const second = yield* InstanceState.getKeyed(state, "sig-a")
      const other = yield* InstanceState.getKeyed(state, "sig-b")

      expect(first).toBe("value:sig-a")
      expect(second).toBe(first)
      expect(other).toBe("value:sig-b")
      expect(yield* Ref.get(builds)).toEqual(["sig-a", "sig-b"])
    }),
  )

  it.effect("invalidateKeyed closes the entry so the next get rebuilds it", () =>
    Effect.gen(function* () {
      const closed = yield* Ref.make<string[]>([])
      const state = yield* InstanceState.makeKeyed<string>((key) =>
        Effect.acquireRelease(Effect.succeed(`value:${key}`), () =>
          Ref.update(closed, (list) => [...list, key]),
        ),
      )

      yield* InstanceState.getKeyed(state, "sig-a")
      expect(yield* InstanceState.hasKeyed(state, "sig-a")).toBe(true)

      yield* InstanceState.invalidateKeyed(state, "sig-a")

      expect(yield* Ref.get(closed)).toEqual(["sig-a"])
      expect(yield* InstanceState.hasKeyed(state, "sig-a")).toBe(false)
      expect(yield* InstanceState.getKeyed(state, "sig-a")).toBe("value:sig-a")
    }),
  )

  it.effect("invalidateKeyed leaves other keys running", () =>
    Effect.gen(function* () {
      const closed = yield* Ref.make<string[]>([])
      const state = yield* InstanceState.makeKeyed<string>((key) =>
        Effect.acquireRelease(Effect.succeed(key), () => Ref.update(closed, (list) => [...list, key])),
      )

      yield* InstanceState.getKeyed(state, "keep")
      yield* InstanceState.getKeyed(state, "drop")

      yield* InstanceState.invalidateKeyed(state, "drop")

      expect(yield* Ref.get(closed)).toEqual(["drop"])
      expect(yield* InstanceState.hasKeyed(state, "keep")).toBe(true)
    }),
  )
})
