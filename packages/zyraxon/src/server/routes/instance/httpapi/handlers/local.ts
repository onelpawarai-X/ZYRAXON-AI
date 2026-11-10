// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import * as Local from "@/local/local"

export const localHandlers = HttpApiBuilder.group(InstanceHttpApi, "local", (handlers) =>
  Effect.gen(function* () {
    const models = Effect.fn("LocalHttpApi.models")(function* () {
      return Local.scanModels()
    })

    const backends = Effect.fn("LocalHttpApi.backends")(function* () {
      return Local.detectBackends()
    })

    const search = Effect.fn("LocalHttpApi.search")(function* (ctx: { query: { q: string } }) {
      return yield* Effect.promise(() => Local.searchHf(ctx.query.q))
    })

    const files = Effect.fn("LocalHttpApi.files")(function* (ctx: { query: { repo: string } }) {
      return yield* Effect.promise(() => Local.listHfFiles(ctx.query.repo))
    })

    const download = Effect.fn("LocalHttpApi.download")(function* (ctx: {
      payload: { repo: string; file: string }
    }) {
      return yield* Effect.promise(() => Local.downloadHfFile(ctx.payload.repo, ctx.payload.file))
    })

    const downloads = Effect.fn("LocalHttpApi.downloads")(function* () {
      return Local.allDownloads()
    })

    const chat = Effect.fn("LocalHttpApi.chat")(function* (ctx: {
      payload: { readonly model: string; readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }> }
    }) {
      // The client sends a model name; resolve it to the on-disk path so the
      // caller never has to know where the file lives.
      const model = ctx.payload.model
      const messages = ctx.payload.messages
      const text = yield* Effect.promise(async () => {
        const found = Local.scanModels().find((m) => m.id === model || m.name === model)
        if (!found) throw new Error(`Local model not found: ${model}`)
        return Local.chat(found.path, messages as Local.ChatMessage[])
      })
      return { text }
    })

    const speak = Effect.fn("LocalHttpApi.speak")(function* (ctx: {
      payload: { readonly text: string; readonly voice?: string }
    }) {
      const result = yield* Effect.promise(() => Local.speak(ctx.payload.text, ctx.payload.voice))
      return { mime: result.mime, audio: Buffer.from(result.bytes).toString("base64") }
    })

    return handlers
      .handle("models", models)
      .handle("backends", backends)
      .handle("search", search)
      .handle("files", files)
      .handle("download", download)
      .handle("downloads", downloads)
      .handle("chat", chat)
      .handle("speak", speak)
  }),
)
