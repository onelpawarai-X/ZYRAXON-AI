// Copyright (c) 2026 onelpawarai. All rights reserved.

// Pressing Connect on a verified row, driven through the real panel component.
//
// The panel keeps one busy signal and every connect path refuses to run while it is set.
// `connectVerified` used to set that signal itself and then hand the app to `beginConnect`,
// which called `onConnect` — whose first line is `if (busy()) return`. The press was
// therefore a no-op for every one of the 8,000-odd verified rows: no config written, no
// handshake, no error shown. Nothing below the panel was wrong, which is why the data-path
// tests all passed while the button did nothing.
//
// This mounts the component, clicks a verified row's Connect, and asserts the app reached
// the connect flow — the one thing that was false. No network: the runtime is a stand-in
// that records what it was asked to do.

import { describe, expect, test } from "bun:test"
import { render } from "solid-js/web"
import { McpHubPanel } from "../../../../MCP Hub/ui/mcp-hub-panel"
import type { AppEntry } from "../../../../MCP Hub/catalog/seed"
import type { McpRuntime, McpStatusEntry } from "../../../../MCP Hub/lib/connect"
import type { McpLocalConfig, McpRemoteConfig } from "../../../../MCP Hub/lib/runtime"
import type { Resolution } from "../../../../MCP Hub/lib/resolve"

/** A runtime that answers nothing, records everything, and never opens a browser. */
function recordingRuntime() {
  const added: { name: string; config: McpLocalConfig | McpRemoteConfig }[] = []
  const statuses = new Map<string, McpStatusEntry>()
  const runtime: McpRuntime = {
    statuses: async () => Object.fromEntries(statuses),
    toolNames: async () => [],
    connect: async (name) => {
      statuses.set(name, { status: "connected" })
    },
    addServer: async (name, config) => {
      added.push({ name, config })
      const entry: McpStatusEntry = { status: "connected" }
      statuses.set(name, entry)
      return entry
    },
    authenticate: async () => {},
    startAuth: async () => "https://example.test/authorize",
    disconnect: async () => {},
    getBrowserPath: async () => "",
    setBrowserPath: async () => {},
    hasTokens: async () => false,
    openUrl: async () => {},
  }
  return { runtime, added }
}

/** Resolution is never reached by a verified row that already carries an endpoint. */
const noResolve = async (): Promise<Resolution> => ({ candidates: [] })

async function mountPanel() {
  const host = document.createElement("div")
  document.body.append(host)
  const { runtime, added } = recordingRuntime()
  const dispose = render(() => <McpHubPanel runtime={runtime} resolve={noResolve} />, host)
  // The verified rows are loaded by a dynamic import, so give the microtask queue and the
  // panel's own first poll a chance to run before anything is clicked.
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { host, added, dispose }
}

/** The Connect button that belongs to the verified section, not a curated card. */
function verifiedConnectButtons(host: HTMLElement): HTMLButtonElement[] {
  const heading = Array.from(host.querySelectorAll("span")).find((s) => s.textContent === "Verified servers")
  const section = heading?.closest("div.flex.flex-col")
  if (!section) return []
  return Array.from(section.querySelectorAll("button")).filter((b) => b.textContent?.trim() === "Connect")
}

async function browseVerified(host: HTMLElement, term: string) {
  const input = host.querySelector<HTMLInputElement>('input[placeholder*="postgres, notion, github"]')
  if (!input) throw new Error("verified search box not found")
  input.value = term
  input.dispatchEvent(new Event("input", { bubbles: true }))
  const browse = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Browse")
  browse?.click()
  await new Promise((resolve) => setTimeout(resolve, 250))
}

/** The modal layer the panel raises above everything else. */
function dialog(host: HTMLElement): HTMLElement | undefined {
  return Array.from(host.querySelectorAll<HTMLElement>("div")).find(
    (d) => d.style.zIndex === "2147483100",
  )
}

function pressButton(scope: HTMLElement, label: string) {
  const button = Array.from(scope.querySelectorAll("button")).find((b) => b.textContent?.trim() === label)
  if (!button) throw new Error(`button "${label}" not found`)
  button.click()
}

describe("verified catalog — pressing Connect", () => {
  test("a no_auth row reaches the connect flow instead of being swallowed by the busy guard", async () => {
    const { host, added, dispose } = await mountPanel()
    try {
      await browseVerified(host, "johto")
      const buttons = verifiedConnectButtons(host)
      expect(buttons.length).toBeGreaterThan(0)

      buttons[0].click()
      // The connect flow writes the server before it handshakes; give it the same
      // microtask window the browser gives a real press.
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(added.length).toBeGreaterThan(0)
      expect(added[0].config).toMatchObject({ type: "remote", enabled: true })
    } finally {
      dispose()
    }
  })

  test("an api_key row opens the environment form rather than connecting with nothing", async () => {
    const { host, added, dispose } = await mountPanel()
    try {
      await browseVerified(host, "NexusToken")
      const buttons = verifiedConnectButtons(host)
      expect(buttons.length).toBeGreaterThan(0)

      buttons[0].click()
      await new Promise((resolve) => setTimeout(resolve, 50))

      // The row asks for a credential, so nothing may be written until it is supplied.
      expect(added).toEqual([])
      expect(host.textContent).toContain("reads its credentials from its environment")
    } finally {
      dispose()
    }
  })

  test("supplying the api_key and pressing Continue writes it into the config", async () => {
    const { host, added, dispose } = await mountPanel()
    try {
      await browseVerified(host, "NexusToken")
      verifiedConnectButtons(host)[0].click()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const layer = dialog(host)
      expect(layer).toBeTruthy()
      const field = layer!.querySelector<HTMLInputElement>("input")
      expect(field).toBeTruthy()
      field!.value = "the-key"
      field!.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
      pressButton(layer!, "Continue")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(added.length).toBeGreaterThan(0)
      expect(added[0].config).toMatchObject({ type: "local" })
    } finally {
      dispose()
    }
  })

  test("a url_input row asks for the address instead of writing a template into the config", async () => {
    const { host, added, dispose } = await mountPanel()
    try {
      await browseVerified(host, "checkmarx")
      const buttons = verifiedConnectButtons(host)
      expect(buttons.length).toBeGreaterThan(0)

      buttons[0].click()
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(added).toEqual([])
      expect(host.textContent).toContain("paste the complete URL your instance answers on")
    } finally {
      dispose()
    }
  })

  test("supplying the address and pressing Continue writes the substituted URL", async () => {
    const { host, added, dispose } = await mountPanel()
    try {
      await browseVerified(host, "checkmarx")
      verifiedConnectButtons(host)[0].click()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const layer = dialog(host)
      expect(layer).toBeTruthy()
      const field = layer!.querySelector<HTMLInputElement>("input")
      field!.value = "https://example.checkmarx.net/api/security-mcp/mcp/tenant-1"
      field!.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
      pressButton(layer!, "Continue")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(added.length).toBeGreaterThan(0)
      const url = (added[0].config as { url?: string }).url ?? ""
      expect(url).toBe("https://example.checkmarx.net/api/security-mcp/mcp/tenant-1")
      expect(url.includes("{")).toBe(false)
    } finally {
      dispose()
    }
  })
})
