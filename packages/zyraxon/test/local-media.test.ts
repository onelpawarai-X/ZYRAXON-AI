// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { detectMediaBackends, speak } from "../src/local/media"

describe("local media backends", () => {
  test("discovers the bundled python backends from the repo layout", () => {
    const backends = detectMediaBackends()
    const names = backends.map((backend) => backend.name)
    expect(names).toContain("diffusion")
    expect(names).toContain("audiocraft")
  })

  test("includes the speech backend so local models have a voice", () => {
    const names = detectMediaBackends().map((backend) => backend.name)
    expect(names).toContain("bark")
  })

  test("reports a script path only for backends that exist on disk", () => {
    for (const backend of detectMediaBackends()) {
      expect(typeof backend.available).toBe("boolean")
      if (backend.available) expect(backend.script).toBeDefined()
    }
  })

  test("refuses to speak empty text without starting a backend", async () => {
    await expect(speak("   ")).rejects.toThrow("no text to speak")
  })
})
