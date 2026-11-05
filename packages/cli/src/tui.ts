// Copyright (c) 2026 onelpawarai. All rights reserved.

import { run } from "@zyraxon-ai/tui"
import { TuiConfig } from "@zyraxon-ai/tui/config"
import { Effect } from "effect"
import { AppNodeBuilder } from "@zyraxon-ai/core/effect/app-node-builder"
import { Global } from "@zyraxon-ai/core/global"

export function runTui(transport: { url: string; headers: RequestInit["headers"] }) {
  if (process.env.ZYRAXON_CLI_LOG !== "1") {
    const noop = () => {}
    console.log = noop
    console.info = noop
    console.debug = noop
    console.warn = noop
    console.error = noop
  }
  const config = TuiConfig.resolve({}, { terminalSuspend: false })
  return run({
    ...transport,
    args: {},
    config,
    fetch: gracefulFetch,
    pluginHost: {
      async start() {},
      async dispose() {},
    },
  }).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}

const legacyDefaults: Record<string, unknown> = {
  "/config/providers": { providers: [], default: {} },
  "/provider": { all: [], default: {}, connected: [] },
  "/agent": [],
  "/config": {},
}

const gracefulFetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init)
    if (response.status !== 404) return response
    const fallback = legacyDefaults[new URL(input instanceof Request ? input.url : input).pathname]
    if (fallback === undefined) return response
    return Response.json(fallback)
  },
  { preconnect: fetch.preconnect },
)
