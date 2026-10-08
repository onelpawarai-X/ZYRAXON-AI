// Copyright (c) 2026 onelpawarai. All rights reserved.

import { MCP } from "@/mcp"
import { Cause, Effect, Schema } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { McpServerNotFoundError } from "../errors"
import { AddPayload, AuthCallbackPayload, StatusMap, UnsupportedOAuthError } from "../groups/mcp"

export const mcpHandlers = HttpApiBuilder.group(InstanceHttpApi, "mcp", (handlers) =>
  Effect.gen(function* () {
    const mcp = yield* MCP.Service

    const status = Effect.fn("McpHttpApi.status")(function* () {
      return yield* mcp.status()
    })

    const add = Effect.fn("McpHttpApi.add")(function* (ctx: { payload: typeof AddPayload.Type }) {
      const result = (yield* mcp.add(ctx.payload.name, ctx.payload.config)).status
      return yield* Schema.decodeUnknownEffect(StatusMap)(
        "status" in result ? { [ctx.payload.name]: result } : result,
      ).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})))
    })

    const authStart = Effect.fn("McpHttpApi.authStart")(function* (ctx: { params: { name: string } }) {
      return yield* Effect.gen(function* () {
        if (!(yield* mcp.supportsOAuth(ctx.params.name))) {
          return yield* new UnsupportedOAuthError({ error: `MCP server ${ctx.params.name} does not support OAuth` })
        }
        return yield* mcp.startAuth(ctx.params.name)
      }).pipe(
        Effect.catchTag("MCP.NotFoundError", (error) =>
          Effect.fail(new McpServerNotFoundError({ name: error.name, message: `MCP server not found: ${error.name}` })),
        ),
      )
    })

    const authHasTokens = Effect.fn("McpHttpApi.authHasTokens")(function* (ctx: { params: { name: string } }) {
      const status = yield* mcp.status()
      if (!(ctx.params.name in status))
        return yield* new McpServerNotFoundError({
          name: ctx.params.name,
          message: `MCP server not found: ${ctx.params.name}`,
        })
      return { hasTokens: yield* mcp.hasStoredTokens(ctx.params.name) }
    })

    const authCallback = Effect.fn("McpHttpApi.authCallback")(function* (ctx: {
      params: { name: string }
      payload: typeof AuthCallbackPayload.Type
    }) {
      return yield* mcp
        .finishAuth(ctx.params.name, ctx.payload.code)
        .pipe(
          Effect.catchTag("MCP.NotFoundError", (error) =>
            Effect.fail(
              new McpServerNotFoundError({ name: error.name, message: `MCP server not found: ${error.name}` }),
            ),
          ),
        )
    })

    const authAuthenticate = Effect.fn("McpHttpApi.authAuthenticate")(function* (ctx: { params: { name: string } }) {
      return yield* Effect.gen(function* () {
        if (!(yield* mcp.supportsOAuth(ctx.params.name))) {
          return yield* new UnsupportedOAuthError({ error: `MCP server ${ctx.params.name} does not support OAuth` })
        }
        return yield* mcp.authenticate(ctx.params.name)
      }).pipe(
        Effect.catchTag("MCP.NotFoundError", (error) =>
          Effect.fail(new McpServerNotFoundError({ name: error.name, message: `MCP server not found: ${error.name}` })),
        ),
        // A handshake that times out, is interrupted, or dies on its own is a failure
        // with a reason, not a defect. Left as a defect it became a 500 whose body was
        // `Unknown error: undefined`, which is what every card showed: the wait ended,
        // the browser never appeared, and nothing said why. The reason travels back as a
        // normal status so the card can show it.
        //
        // Effect v4 has no catchAll and no catchAllDefect — both are reached through
        // catchCause, which hands over the whole Cause. A Cause carrying a defect is
        // logged as one; anything else keeps the warning and the plain reason.
        Effect.catchCause((cause) =>
          Cause.hasDies(cause)
            ? Effect.logError("mcp authenticate defect", {
                server: ctx.params.name,
                reason: Cause.pretty(cause),
              }).pipe(
                Effect.andThen(
                  Effect.succeed({ status: "failed" as const, error: `The sign-in attempt failed: ${Cause.pretty(cause)}` }),
                ),
              )
            : Effect.logWarning("mcp authenticate failed", {
                server: ctx.params.name,
                reason: Cause.pretty(cause),
              }).pipe(Effect.andThen(Effect.succeed({ status: "failed" as const, error: Cause.pretty(cause) }))),
        ),
      )
    })

    const authRemove = Effect.fn("McpHttpApi.authRemove")(function* (ctx: { params: { name: string } }) {
      const status = yield* mcp.status()
      if (!(ctx.params.name in status))
        return yield* new McpServerNotFoundError({
          name: ctx.params.name,
          message: `MCP server not found: ${ctx.params.name}`,
        })
      yield* mcp.removeAuth(ctx.params.name)
      return { success: true as const }
    })

    const connect = Effect.fn("McpHttpApi.connect")(function* (ctx: { params: { name: string } }) {
      yield* mcp
        .connect(ctx.params.name)
        .pipe(
          Effect.catchTag("MCP.NotFoundError", (error) =>
            Effect.fail(
              new McpServerNotFoundError({ name: error.name, message: `MCP server not found: ${error.name}` }),
            ),
          ),
        )
      return true
    })

    const disconnect = Effect.fn("McpHttpApi.disconnect")(function* (ctx: { params: { name: string } }) {
      yield* mcp
        .disconnect(ctx.params.name)
        .pipe(
          Effect.catchTag("MCP.NotFoundError", (error) =>
            Effect.fail(
              new McpServerNotFoundError({ name: error.name, message: `MCP server not found: ${error.name}` }),
            ),
          ),
        )
      return true
    })

    return handlers
      .handle("status", status)
      .handle("add", add)
      .handle("authStart", authStart)
      .handle("authCallback", authCallback)
      .handle("authHasTokens", authHasTokens)
    .handle("authAuthenticate", authAuthenticate)
      .handle("authRemove", authRemove)
      .handle("connect", connect)
      .handle("disconnect", disconnect)
  }),
)
