// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { backoffDelay, decideRestart, defaultBackoff } from "../src/main/server-supervisor"

describe("server restart policy", () => {
  test("a crash schedules a restart with a growing delay", () => {
    const delays = [1, 2, 3, 4].map((attempt) => backoffDelay(attempt))
    expect(delays).toEqual([500, 1000, 2000, 4000])
    expect(delays.every((delay, index) => index === 0 || delay > delays[index - 1]!)).toBe(true)
  })

  test("the delay is capped so retries never drift into hours", () => {
    expect(backoffDelay(50)).toBe(defaultBackoff.maxMs)
    expect(backoffDelay(1)).toBe(defaultBackoff.baseMs)
  })

  test("a crash inside the retry budget restarts", () => {
    const decision = decideRestart({ attempt: 1, quitting: false, stoppedDeliberately: false })
    expect(decision.restart).toBe(true)
    if (decision.restart) expect(decision.delayMs).toBe(500)
  })

  test("the retry budget is finite so a crash loop cannot spin forever", () => {
    const last = decideRestart({ attempt: defaultBackoff.maxAttempts, quitting: false, stoppedDeliberately: false })
    expect(last.restart).toBe(true)
    const beyond = decideRestart({ attempt: defaultBackoff.maxAttempts + 1, quitting: false, stoppedDeliberately: false })
    expect(beyond.restart).toBe(false)
    if (!beyond.restart) expect(beyond.reason).toContain("gave up")
  })

  test("quitting the app never restarts the server", () => {
    const decision = decideRestart({ attempt: 1, quitting: true, stoppedDeliberately: false })
    expect(decision.restart).toBe(false)
    if (!decision.restart) expect(decision.reason).toBe("app is quitting")
  })

  test("a deliberate stop never restarts the server", () => {
    // This is the teardown/swap path: a restart here would race the new server
    // for the same port and is how "two servers fighting" shows up.
    const decision = decideRestart({ attempt: 1, quitting: false, stoppedDeliberately: true })
    expect(decision.restart).toBe(false)
    if (!decision.restart) expect(decision.reason).toBe("server was stopped deliberately")
  })

  test("quitting wins over an otherwise restartable crash", () => {
    const decision = decideRestart({ attempt: 2, quitting: true, stoppedDeliberately: true })
    expect(decision.restart).toBe(false)
  })
})
