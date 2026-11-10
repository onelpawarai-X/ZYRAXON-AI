// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as AutomationRender from "./render"

import type { AutomationEvent } from "./types"

/**
 * The durable events as a text block for the session system context. Kept free of service
 * imports so the prompt loop can call it without pulling the MCP graph into its module.
 */
export function renderEvents(events: ReadonlyArray<AutomationEvent>): string {
  if (events.length === 0) return ""
  const lines = events.map((event) => {
    const source = event.author ? `${event.connectorID} · ${event.author}` : event.connectorID
    const when = new Date(event.receivedAt).toISOString()
    const link = event.url ? ` (${event.url})` : ""
    const body = event.body ? `\n    ${event.body.replace(/\s+/g, " ").slice(0, 300)}` : ""
    return `- [${when}] ${source}: ${event.title}${link}${body}`
  })
  return [
    "Connected apps have reported new activity that you should act on without being asked:",
    ...lines,
    "Decide what each item needs and do it. Ask for approval first for anything sensitive: sending a message to another person, money, or a change to an account setting.",
  ].join("\n")
}
