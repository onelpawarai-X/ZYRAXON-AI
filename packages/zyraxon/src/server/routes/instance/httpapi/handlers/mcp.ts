// Copyright (c) 2026 onelpawarai. All rights reserved.

import { MCP } from "@/mcp"
import { Cause, Effect, Schema } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { McpServerNotFoundError } from "../errors"
import { AddPayload, AuthCallbackPayload, StatusMap, UnsupportedOAuthError } from "../groups/mcp"

/**
 * A reason a person can read.
 *
 * `Cause.pretty` renders an Effect Cause, not a plain JavaScript error, so the
 * message behind a failed sign-in came back as `undefined` and the card showed
 * "Unknown error: undefined". Every failure is turned into a real string here.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    return JSON.stringify(err);
  }
  return String(err);
}

/** How long the sign-in link hunt may run before it falls back. */
const DISCOVERY_TIMEOUT_MS = 15000;

/**
 * The page the browser should open for sign-in, found quickly.
 *
 * Discovery used to run for 45 seconds and stall the whole connect while the
 * person watched nothing happen. It is cut to 15, and every miss â€” no discovery
 * document, a network error, a timeout â€” lands on `<base>/authorize` instead of
 * surfacing as "Unknown error: undefined".
 */
export async function resolveSignInUrl(serverConfig: {
  id?: string;
  baseUrl: string;
  authType?: string;
  customAuthUrl?: string;
}): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);

  try {
if (serverConfig.authType === "token") {
      return ""; // token servers do not need a browser authorization URL
    }

    if (serverConfig.customAuthUrl) {
      return serverConfig.customAuthUrl;
    }

    // RFC 8414 / OpenID discovery handling
    const wellKnown = `${serverConfig.baseUrl.replace(/\/$/, "")}/.well-known/oauth-authorization-server`;
    const res = await fetch(wellKnown, { signal: controller.signal });
    if (res.ok) {
      const data = (await res.json()) as { authorization_endpoint?: string };
      if (data.authorization_endpoint) {
        return data.authorization_endpoint;
      }
    }

    return `${serverConfig.baseUrl.replace(/\/$/, "")}/authorize`;
  } catch {
    console.warn(`Discovery failed for ${serverConfig.id}, falling back to default /authorize`);
    return `${serverConfig.baseUrl.replace(/\/$/, "")}/authorize`;
  } finally {
    clearTimeout(timeoutId);
  }
}

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
        // Effect v4 has no catchAll and no catchAllDefect â€” both are reached through
        // catchCause, which hands over the whole Cause. A Cause carrying a defect is
        // logged as one; anything else keeps the warning and the plain reason.
        Effect.catchCause((cause) =>
          Cause.hasDies(cause)
            ? Effect.logError("mcp authenticate defect", {
                server: ctx.params.name,
                reason: describeError(Cause.squash(cause)),
              }).pipe(
                Effect.andThen(
                  Effect.succeed({ status: "failed" as const, error: `The sign-in attempt failed: ${describeError(Cause.squash(cause))}` }),
                ),
              )
            : Effect.logWarning("mcp authenticate failed", {
                server: ctx.params.name,
                reason: describeError(Cause.squash(cause)),
              }).pipe(Effect.andThen(Effect.succeed({ status: "failed" as const, error: describeError(Cause.squash(cause)) }))),
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
