// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { detectMediaBackends } from "../src/local/media"

describe("local media backends", () => {
  test("discovers the bundled python backends from the repo layout", () => {
    const backends = detectMediaBackends()
    const names = backends.map((backend) => backend.name)
    expect(names).toContain("diffusion")
    expect(names).toContain("audiocraft")
  })

  test("reports a script path only for backends that exist on disk", () => {
    for (const backend of detectMediaBackends()) {
      expect(typeof backend.available).toBe("boolean")
      if (backend.available) expect(backend.script).toBeDefined()
    }
  })
})
