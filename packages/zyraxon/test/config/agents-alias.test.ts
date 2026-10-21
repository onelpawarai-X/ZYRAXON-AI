// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { ConfigV1 } from "@zyraxon-ai/core/v1/config/config"
import { ConfigParse } from "../../src/config/parse"

function load(raw: Record<string, unknown>) {
  const normalized = ConfigParse.normalizeAgentAlias(raw)
  return ConfigParse.schema(ConfigV1.Info, normalized, "test.jsonc")
}

describe("config agents alias", () => {
  test("a custom agent written under `agents` reaches the loaded `agent` map", () => {
    const info = load({
      agents: { "alias-test-agent": { description: "from plural key", mode: "primary" } },
    })
    expect(info.agent?.["alias-test-agent"]?.description).toBe("from plural key")
    expect(info.agent?.["alias-test-agent"]?.mode).toBe("primary")
  })

  test("`agent` and `agents` merge with `agent` winning on conflict", () => {
    const info = load({
      agents: { shared: { description: "plural" }, onlyPlural: { description: "plural only" } },
      agent: { shared: { description: "singular" } },
    })
    expect(info.agent?.shared?.description).toBe("singular")
    expect(info.agent?.onlyPlural?.description).toBe("plural only")
  })

  test("configs without `agents` are untouched", () => {
    const info = load({ agent: { build: { description: "singular only" } } })
    expect(info.agent?.build?.description).toBe("singular only")
  })
})
