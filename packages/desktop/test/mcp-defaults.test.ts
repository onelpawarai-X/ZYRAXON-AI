// Copyright (c) 2026 onelpawarai. All rights reserved.

// The one-time switch-off of the bundled MCP servers in an existing config.
//
// This migration is what reaches installs created before the servers became opt-in: their
// config already says `enabled: true`, so changing the shipped default alone would leave
// them starting a headless Chrome on every session. The cases below are the ones that
// decide whether that happens or whether someone's own setup gets disabled by mistake.

import { describe, expect, test } from "bun:test"
import { disableBundledDefaults, type McpDefaultsConfig } from "../src/main/mcp-defaults"

const defaults = {
  "jarvis-browser": { command: ["node", "__RESOURCES_PATH__/jarvis-browser-mcp.cjs", "--headless"] },
  "nuphus-desktop": { command: ["node", "__RESOURCES_PATH__/nuphus-mcp/nuphus-mcp.cjs"] },
}

describe("disabling bundled defaults", () => {
  test("turns off a bundled server an earlier version had switched on", () => {
    const config: McpDefaultsConfig = {
      mcp: { "jarvis-browser": { enabled: true, command: defaults["jarvis-browser"].command } },
    }
    const disabled = disableBundledDefaults(config, defaults)
    expect(disabled).toEqual(["jarvis-browser"])
    expect(config.mcp!["jarvis-browser"]!.enabled).toBe(false)
  })

  test("leaves a server the user had already switched off alone", () => {
    const config: McpDefaultsConfig = {
      mcp: { "nuphus-desktop": { enabled: false, command: defaults["nuphus-desktop"].command } },
    }
    expect(disableBundledDefaults(config, defaults)).toEqual([])
    expect(config.mcp!["nuphus-desktop"]!.enabled).toBe(false)
  })

  test("does not touch a bundled name the user pointed at their own server", () => {
    const config: McpDefaultsConfig = {
      mcp: { "jarvis-browser": { enabled: true, command: ["node", "/home/me/my-own-server.cjs"] } },
    }
    expect(disableBundledDefaults(config, defaults)).toEqual([])
    expect(config.mcp!["jarvis-browser"]!.enabled).toBe(true)
  })

  test("ignores servers that are not in the shipped defaults", () => {
    const config: McpDefaultsConfig = {
      mcp: { slack: { enabled: true, command: ["node", "slack.cjs"] } },
    }
    expect(disableBundledDefaults(config, defaults)).toEqual([])
    expect(config.mcp!.slack!.enabled).toBe(true)
  })

  test("turns off every bundled server still on the shipped command", () => {
    const config: McpDefaultsConfig = {
      mcp: {
        "jarvis-browser": { enabled: true, command: defaults["jarvis-browser"].command },
        "nuphus-desktop": { enabled: true, command: defaults["nuphus-desktop"].command },
      },
    }
    expect(disableBundledDefaults(config, defaults).sort()).toEqual(["jarvis-browser", "nuphus-desktop"])
  })

  test("a config with no mcp block is left untouched", () => {
    expect(disableBundledDefaults({}, defaults)).toEqual([])
  })
})
