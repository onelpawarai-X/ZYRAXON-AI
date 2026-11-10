// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Stopping a background job must not throw away the work it already did.
 *
 * A background task is often several steps long. When the user stops it, the
 * session still has to resume with whatever the task produced so far plus a note
 * that the stop was deliberate — otherwise the run is silently lost and the
 * agent has nothing to continue from. This drives the real registry, because the
 * failure being guarded against is a registry that reports "cancelled" while
 * handing back an empty body.
 */
import { describe, expect, test } from "bun:test"
import { Deferred, Effect } from "effect"
import { BackgroundJob } from "../src/background-job"

const withJobs = <A, E>(body: (jobs: BackgroundJob.Interface) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const jobs = yield* BackgroundJob.make
    return yield* body(jobs)
  }).pipe(Effect.scoped)

describe("BackgroundJob.cancel", () => {
  test("a stopped job reports cancelled to its waiter", async () => {
    const result = await Effect.runPromise(
      withJobs((jobs) =>
        Effect.gen(function* () {
          const started = yield* jobs.start({ id: "job-1", type: "task", run: Effect.never })
          const stopped = yield* jobs.cancel("job-1")
          const waited = yield* jobs.wait({ id: "job-1" })
          return { started: started.status, stopped: stopped?.status, waited: waited.info?.status }
        }),
      ),
    )
    expect(result.started).toBe("running")
    expect(result.stopped).toBe("cancelled")
    expect(result.waited).toBe("cancelled")
  })

  test("a stopped multi-step job keeps the output it already produced", async () => {
    const result = await Effect.runPromise(
      withJobs((jobs) =>
        Effect.gen(function* () {
          const gate = yield* Deferred.make<void>()
          yield* jobs.start({
            id: "job-2",
            type: "task",
            run: Deferred.await(gate).pipe(Effect.as("step one")),
          })
          yield* jobs.extend({ id: "job-2", run: Effect.never })
          yield* Deferred.succeed(gate, undefined)
          yield* Effect.sleep("200 millis")
          return yield* jobs.cancel("job-2")
        }),
      ),
    )
    expect(result?.status).toBe("cancelled")
    expect(result?.output).toBe("step one")
  })
})
