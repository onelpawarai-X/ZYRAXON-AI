// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as AutomationWatchSpecs from "./watch-specs"

/**
 * A watch spec tells the poller which MCP tool to call to see "what is new" for a
 * connected app, and how to turn the tool's result into events.
 *
 * This is deliberately declarative rather than hard-coded per app: every connected app
 * exposes its own MCP tools, and the poller is the same for all of them. A spec only has
 * to name the tool and two small extraction rules.
 */
export interface WatchSpec {
  readonly connectorID: string
  readonly label: string
  /** MCP server name from the MCP config that this connector polls. Defaults to connectorID. */
  readonly mcpServer?: string
  /**
   * Candidate MCP tool names, most preferred first. The first one that exists on the
   * connected server is used, so a vendor renaming its tool does not silently stop polling.
   */
  readonly tools: ReadonlyArray<string>
  /** Arguments passed to the tool on every poll. */
  readonly args?: Record<string, unknown>
  /**
   * Where the list of items lives in the tool result. `result.content[0].text` is JSON in
   * most MCP servers, so the poller decodes text blocks automatically before applying this.
   * Dot-path, e.g. "messages" or "data.items".
   */
  readonly itemsPath: string
  /** Field mapping from a source item to a RawObservation. */
  readonly map: {
    readonly externalID: string
    readonly kind: string
    readonly title: string
    readonly body?: string
    readonly url?: string
    readonly author?: string
    readonly receivedAt: string
  }
}

/**
 * Default specs for the apps the product advertises. Tool names are the ones the official
 * hosted MCP servers publish; if a server changes a name, adding it to `tools` is the whole
 * fix. A connector the poller cannot resolve stays connected-but-quiet rather than erroring.
 */
export const DEFAULT_WATCH_SPECS: ReadonlyArray<WatchSpec> = [
  {
    connectorID: "gmail",
    label: "Gmail",
    tools: ["gmail_list_messages", "list_messages", "gmail_search", "search_gmail_messages"],
    args: { maxResults: 25, query: "is:unread newer_than:1d" },
    itemsPath: "messages",
    map: {
      externalID: "id",
      kind: "email",
      title: "subject",
      body: "snippet",
      author: "from",
      receivedAt: "internalDate",
    },
  },
  {
    connectorID: "github",
    label: "GitHub",
    tools: ["list_notifications", "github_list_notifications", "search_issues", "list_pull_requests"],
    itemsPath: "notifications",
    map: {
      externalID: "id",
      kind: "collaboration",
      title: "subject.title",
      body: "reason",
      url: "subject.url",
      receivedAt: "updated_at",
    },
  },
  {
    connectorID: "upwork",
    label: "Upwork",
    tools: ["upwork_list_messages", "list_messages", "get_messages", "upwork_inbox"],
    itemsPath: "messages",
    map: {
      externalID: "id",
      kind: "message",
      title: "subject",
      body: "body",
      author: "from",
      receivedAt: "created_at",
    },
  },
  {
    connectorID: "canva",
    label: "Canva",
    tools: ["canva_list_comments", "list_comments", "get_notifications", "list_notifications"],
    itemsPath: "comments",
    map: {
      externalID: "id",
      kind: "comment",
      title: "message",
      body: "message",
      author: "author",
      receivedAt: "created_at",
    },
  },
  {
    connectorID: "notion",
    label: "Notion",
    tools: ["notion_search", "search", "list_databases"],
    itemsPath: "results",
    map: {
      externalID: "id",
      kind: "document",
      title: "properties.title",
      receivedAt: "last_edited_time",
    },
  },
  {
    connectorID: "slack",
    label: "Slack",
    tools: ["slack_list_messages", "conversations_history", "list_messages"],
    itemsPath: "messages",
    map: {
      externalID: "ts",
      kind: "message",
      title: "text",
      body: "text",
      author: "user",
      receivedAt: "ts",
    },
  },
]

const FALLBACK_TOOL_HINTS = [
  "list_messages",
  "get_messages",
  "list_notifications",
  "notifications",
  "inbox",
  "list_comments",
  "search",
]

export function specFor(connectorID: string): WatchSpec | undefined {
  return DEFAULT_WATCH_SPECS.find((spec) => spec.connectorID === connectorID)
}

/**
 * Build a spec on the fly for a connected MCP server that has no hand-written spec. The
 * poller asks the server for its tools and picks the first tool whose name looks like a
 * "what is new" reader. This is how a brand-new connected app starts producing events
 * without a code change.
 */
export function deriveSpec(connectorID: string, toolNames: ReadonlyArray<string>): WatchSpec | undefined {
  const named = toolNames.find((name) => FALLBACK_TOOL_HINTS.some((hint) => name.toLowerCase().includes(hint)))
  if (!named) return undefined
  return {
    connectorID,
    label: connectorID,
    tools: [named],
    itemsPath: "",
    map: {
      externalID: "id",
      kind: "event",
      title: "title",
      body: "body",
      url: "url",
      author: "author",
      receivedAt: "created_at",
    },
  }
}
