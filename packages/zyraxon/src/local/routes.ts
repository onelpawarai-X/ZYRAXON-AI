// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as LocalRoutes from "./routes"

import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import * as Local from "./local"

/**
 * OpenAI-compatible surface for the local models. The AI SDK talks to this when
 * the selected model's provider is `local`; each call starts the matching
 * llama-server on demand and streams the reply back unchanged.
 */
export const routes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const forward = (pathname: string, method: string) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const body = method === "GET" ? undefined : yield* Effect.orDie(request.text)
        let model = ""
        if (body) {
          try {
            model = (JSON.parse(body) as { model?: string }).model ?? ""
          } catch {
            /* body may be empty on GET */
          }
        }
        const contentType = String(request.headers["content-type"] ?? "application/json")
        const response = yield* Effect.promise(() =>
          Local.proxy(model, pathname, method, body, { "content-type": contentType }),
        )
        return HttpServerResponse.fromWeb(response)
      })

    yield* router.add("GET", "/local/v1/models", () => forward("/v1/models", "GET"))
    yield* router.add("POST", "/local/v1/chat/completions", () => forward("/v1/chat/completions", "POST"))
    yield* router.add("POST", "/local/v1/completions", () => forward("/v1/completions", "POST"))
  }),
)
