// Copyright (c) 2026 onelpawarai. All rights reserved.

import { LayerNode } from "@zyraxon-ai/core/effect/layer-node"
import path from "path"
import { serviceUse } from "@zyraxon-ai/core/effect/service-use"
import { Global } from "@zyraxon-ai/core/global"
import { Effect, Layer, Context, Option, Schema } from "effect"
import { FSUtil } from "@zyraxon-ai/core/fs-util"
import { EffectFlock } from "@zyraxon-ai/core/util/effect-flock"

export const Tokens = Schema.Struct({
  accessToken: Schema.mutableKey(Schema.String),
  refreshToken: Schema.mutableKey(Schema.optional(Schema.String)),
  expiresAt: Schema.mutableKey(Schema.optional(Schema.Number)),
  scope: Schema.mutableKey(Schema.optional(Schema.String)),
})
export type Tokens = Schema.Schema.Type<typeof Tokens>

export const ClientInfo = Schema.Struct({
  clientId: Schema.mutableKey(Schema.String),
  clientSecret: Schema.mutableKey(Schema.optional(Schema.String)),
  clientIdIssuedAt: Schema.mutableKey(Schema.optional(Schema.Number)),
  clientSecretExpiresAt: Schema.mutableKey(Schema.optional(Schema.Number)),
})
export type ClientInfo = Schema.Schema.Type<typeof ClientInfo>

export const Entry = Schema.Struct({
  tokens: Schema.mutableKey(Schema.optional(Tokens)),
  clientInfo: Schema.mutableKey(Schema.optional(ClientInfo)),
  codeVerifier: Schema.mutableKey(Schema.optional(Schema.String)),
  oauthState: Schema.mutableKey(Schema.optional(Schema.String)),
  serverUrl: Schema.mutableKey(Schema.optional(Schema.String)),
})
export type Entry = Schema.Schema.Type<typeof Entry>

const decodeAuthData = Schema.decodeUnknownOption(Schema.Record(Schema.String, Entry))
type AuthData = Record<string, Entry>

const filepath = path.join(Global.Path.data, "mcp-auth.json")
const lockKey = `mcp-auth:${filepath}`

export interface Interface {
  readonly all: () => Effect.Effect<Record<string, Entry>>
  readonly get: (mcpName: string) => Effect.Effect<Entry | undefined>
  readonly getForUrl: (mcpName: string, serverUrl: string) => Effect.Effect<Entry | undefined>
  readonly set: (mcpName: string, entry: Entry, serverUrl?: string) => Effect.Effect<void>
  readonly remove: (mcpName: string) => Effect.Effect<void>
  readonly updateTokens: (mcpName: string, tokens: Tokens, serverUrl?: string) => Effect.Effect<void>
  readonly updateClientInfo: (mcpName: string, clientInfo: ClientInfo, serverUrl?: string) => Effect.Effect<void>
  readonly updateCodeVerifier: (mcpName: string, codeVerifier: string) => Effect.Effect<void>
  readonly clearCodeVerifier: (mcpName: string) => Effect.Effect<void>
  readonly updateOAuthState: (mcpName: string, oauthState: string) => Effect.Effect<void>
  readonly getOAuthState: (mcpName: string) => Effect.Effect<string | undefined>
  readonly clearOAuthState: (mcpName: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@zyraxon/McpAuth") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const flock = yield* EffectFlock.Service

    /**
 * Read the credential file.
 *
 * A missing file is an ordinary empty store. A file that is present and cannot be parsed is
 * not: the distinction decides whether a failed read may be treated as "no credentials".
 * The previous version answered `{}` for both, so the next write — which every sign-in
 * attempt makes — took that empty result as the whole truth and overwrote the file. One
 * stray byte in the JSON, and every token the user had ever connected was gone, with no
 * warning and nothing in the log.
 *
 * So the damaged case sets a flag instead, and `mutate` refuses to write while it is set.
 */
let damaged: { detail?: string } | undefined

const read = Effect.fn("McpAuth.read")(function* () {
  return yield* fs.readJson(filepath).pipe(
    Effect.map((data): AuthData => Option.getOrElse(decodeAuthData(data), () => ({}) as AuthData) as AuthData),
    Effect.catch((e) =>
      Effect.sync(() => {
        damaged ??= { detail: e instanceof Error ? e.message : String(e) }
        return {} as AuthData
      }),
    ),
  )
})

    const all = Effect.fn("McpAuth.all")(function* () {
      return yield* read().pipe(flock.withLock(lockKey), Effect.orDie)
    })

    /**
 * Read, change and write the whole file, under a lock.
 *
 * A file that exists but cannot be parsed is never overwritten. Every mutation goes
 * through here, so this is the single place that can stop it, and stopping is the point:
 * the alternative is that the first sign-in after any corruption quietly replaces the user's
 * entire credential store with an empty one.
 */
const mutate = Effect.fn("McpAuth.mutate")(function* (update: (data: AuthData) => AuthData | undefined) {
  yield* Effect.gen(function* () {
    const current = yield* read()

    if (damaged) {
      // Nothing has succeeded in reading the file yet, so there is no knowing what a write
      // would destroy. Back it up before refusing, so the tokens are still recoverable.
      const backup = `${filepath}.corrupt`
      yield* Effect.tryPromise({
        try: () => Bun.write(backup, JSON.stringify(current, null, 2)),
        catch: () => undefined,
      })
      return yield* Effect.fail(
        new Error(
          `The MCP credential file at ${filepath} could not be read and was left untouched, ` +
            `so nothing was overwritten. Move it aside or restore it, then connect again.` +
            (damaged.detail ? ` The problem was: ${damaged.detail}` : ""),
        ),
      )
    }

    const next = update(current)
    if (!next) return
    yield* fs.writeJson(filepath, next, 0o600).pipe(Effect.orDie)
  }).pipe(flock.withLock(lockKey), Effect.orDie)
})

    const get = Effect.fn("McpAuth.get")(function* (mcpName: string) {
      const data = yield* all()
      return data[mcpName]
    })

/**
 * Do these two spell the same server?
 *
 * Compared loosely on purpose. Credentials are stored against a URL the catalog wrote, and
 * they are looked up against whatever the config currently holds — so `https://mcp.example/`,
 * `https://mcp.example` and a host differing only in case are one server, not three. An
 * exact comparison silently failed the lookup for the two spellings that are not identical,
 * the server reported that it needed to sign in again, and the user was walked through the
 * whole consent flow to re-authorise an account that was already authorised.
 *
 * The path still has to match. Two servers on one host at different paths are different
 * servers with different scopes, and treating them as one would hand one app the other's
 * token.
 */
function sameServer(a: string, b: string): boolean {
  try {
    const left = new URL(a)
    const right = new URL(b)
    if (left.origin !== right.origin) return false
    const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p)
    return trim(left.pathname) === trim(right.pathname)
  } catch {
    // A URL that will not parse is compared as written rather than guessed at.
    return a.replace(/\/+$/, "") === b.replace(/\/+$/, "")
  }
}

const getForUrl = Effect.fn("McpAuth.getForUrl")(function* (mcpName: string, serverUrl: string) {
  const entry = yield* get(mcpName)
  if (!entry) return undefined
  if (!entry.serverUrl) return undefined
  if (!sameServer(entry.serverUrl, serverUrl)) return undefined
  return entry
})

    const set = Effect.fn("McpAuth.set")(function* (mcpName: string, entry: Entry, serverUrl?: string) {
      /**
       * The PKCE verifier and the state are for one handshake and nothing else.
       *
       * Both are dropped whenever an entry is written with real credentials in it. They used
       * to stay on disk indefinitely, so a later sign-in for the same server could pick up a
       * verifier that belonged to a request made days earlier. Nothing read them by accident —
       * the state check rejected them — but a secret that outlives its purpose is a secret
       * waiting to leak, and the file is written with owner-only permissions precisely
       * because it holds them.
       */
      const { codeVerifier: _verifier, oauthState: _state, ...rest } = entry

      yield* mutate((data) => ({
        ...data,
        [mcpName]: serverUrl ? { ...rest, serverUrl } : rest,
      }))
    })

    const remove = Effect.fn("McpAuth.remove")(function* (mcpName: string) {
      yield* mutate((data) => {
        const next = { ...data }
        delete next[mcpName]
        return next
      })
    })

    const updateField = <K extends keyof Entry>(field: K, spanName: string) =>
      Effect.fn(`McpAuth.${spanName}`)(function* (mcpName: string, value: NonNullable<Entry[K]>, serverUrl?: string) {
        yield* mutate((data) => {
          const entry = data[mcpName] ?? {}
          entry[field] = value
          if (serverUrl) entry.serverUrl = serverUrl
          return { ...data, [mcpName]: entry }
        })
      })

/**
 * Remove one field from one server's entry.
 *
 * The entry is copied before the field is dropped. The previous version deleted straight
 * off the object that `read()` had returned, and that object still belongs to the parsed
 * cache: clearing a code verifier on one server also cleared it on every other server in
 * the same file, and the loss was only visible when the next sign-in failed for reasons
 * that pointed nowhere near this call.
 */
const clearField = (field: keyof Entry, spanName: string) =>
  Effect.fn(`McpAuth.${spanName}`)(function* (mcpName: string) {
    yield* mutate((data) => {
      const entry = data[mcpName]
      if (!entry) return undefined
      // Already absent: leave the file alone rather than rewriting it unchanged.
      if (entry[field] === undefined) return undefined
      return { ...data, [mcpName]: { ...entry, [field]: undefined } }
    })
  })

    const updateTokens = updateField("tokens", "updateTokens")
    const updateClientInfo = updateField("clientInfo", "updateClientInfo")
    const updateCodeVerifier = updateField("codeVerifier", "updateCodeVerifier")
    const updateOAuthState = updateField("oauthState", "updateOAuthState")
    const clearCodeVerifier = clearField("codeVerifier", "clearCodeVerifier")
    const clearOAuthState = clearField("oauthState", "clearOAuthState")

    const getOAuthState = Effect.fn("McpAuth.getOAuthState")(function* (mcpName: string) {
      const entry = yield* get(mcpName)
      return entry?.oauthState
    })

    return Service.of({
      all,
      get,
      getForUrl,
      set,
      remove,
      updateTokens,
      updateClientInfo,
      updateCodeVerifier,
      clearCodeVerifier,
      updateOAuthState,
      getOAuthState,
      clearOAuthState,
    })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [FSUtil.node, EffectFlock.node] })

export * as McpAuth from "./auth"
