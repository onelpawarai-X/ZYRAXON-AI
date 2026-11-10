// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * `PATCH /global/config` must not answer before instance teardown finishes.
 *
 * The desktop app refetches the agent list as soon as the update response lands.
 * If disposal were still running at that point, the refetch would read the
 * instance config cached from before the write, and a freshly saved custom agent
 * would look missing — the exact "custom agent does not show up" report.
 *
 * The assertion is an ordering assertion, so it fails when disposal is forked
 * and passes only when it is awaited. The server is built over `GlobalApi` alone
 * rather than the whole route tree: the ordering lives in this handler, and
 * pulling in every route group would make the test depend on the entire
 * application graph.
 */
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { testEffect } from "../lib/effect"
import { globalConfigLayer, order } from "./global-config-layer"

const it = testEffect(globalConfigLayer)

describe("global config update ordering", () => {
  it.live("disposes instances before the update response is readable", () => {
    order.length = 0

    return Effect.gen(function* () {
      // `layerTest` pairs the server with a client that resolves relative paths,
      // so a path-only URL is enough here.
      const request = HttpClientRequest.patch("/global/config").pipe(
        HttpClientRequest.bodyText(JSON.stringify({ username: "ordering-test" }), "application/json"),
      )
      const response = yield* HttpClient.execute(request)
      order.push("response")
      expect(response.status).toBe(200)
      expect(order).toEqual(["update", "dispose", "response"])
    })
  })
})
