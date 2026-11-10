// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery, WorkspaceRoutingQueryFields } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/local"

export const LocalModelInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
  sizeBytes: Schema.Number,
  quantization: Schema.optional(Schema.String),
  family: Schema.optional(Schema.String),
  kind: Schema.String,
}).annotate({ identifier: "LocalModelInfo" })

export const LocalBackendInfo = Schema.Struct({
  name: Schema.String,
  available: Schema.Boolean,
  path: Schema.optional(Schema.String),
}).annotate({ identifier: "LocalBackendInfo" })

export const LocalHfModel = Schema.Struct({
  id: Schema.String,
  downloads: Schema.Number,
  likes: Schema.Number,
  pipelineTag: Schema.optional(Schema.String),
  kind: Schema.String,
}).annotate({ identifier: "LocalHfModel" })

export const LocalHfFile = Schema.Struct({
  name: Schema.String,
  sizeBytes: Schema.Number,
}).annotate({ identifier: "LocalHfFile" })

export const LocalDownloadProgress = Schema.Struct({
  id: Schema.String,
  filename: Schema.String,
  receivedBytes: Schema.Number,
  totalBytes: Schema.Number,
  done: Schema.Boolean,
  error: Schema.optional(Schema.String),
}).annotate({ identifier: "LocalDownloadProgress" })

export const LocalFilesQuery = Schema.Struct({ repo: Schema.String })
export const LocalDownloadPayload = Schema.Struct({ repo: Schema.String, file: Schema.String })
export const LocalChatPayload = Schema.Struct({
  model: Schema.String,
  messages: Schema.Array(
    Schema.Struct({ role: Schema.String, content: Schema.String }),
  ),
})
export const LocalChatResult = Schema.Struct({ text: Schema.String }).annotate({ identifier: "LocalChatResult" })

export const LocalSpeakPayload = Schema.Struct({ text: Schema.String, voice: Schema.optional(Schema.String) })
export const LocalSpeakResult = Schema.Struct({ mime: Schema.String, audio: Schema.String }).annotate({
  identifier: "LocalSpeakResult",
})

export const LocalApi = HttpApi.make("local")
  .add(
    HttpApiGroup.make("local")
      .add(
        HttpApiEndpoint.get("models", `${root}/models`, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(LocalModelInfo), "Models already present on disk"),
        }).annotateMerge(OpenApi.annotations({ identifier: "local.models", summary: "Scan local GGUF models" })),
        HttpApiEndpoint.get("backends", `${root}/backends`, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(LocalBackendInfo), "Available local inference backends"),
        }).annotateMerge(OpenApi.annotations({ identifier: "local.backends", summary: "Detect local backends" })),
        HttpApiEndpoint.get("search", `${root}/search`, {
          query: Schema.Struct({ q: Schema.String, ...WorkspaceRoutingQueryFields }),
          success: described(Schema.Array(LocalHfModel), "HuggingFace search results"),
        }).annotateMerge(OpenApi.annotations({ identifier: "local.search", summary: "Search HuggingFace" })),
        HttpApiEndpoint.get("files", `${root}/files`, {
          query: Schema.Struct({ repo: Schema.String, ...WorkspaceRoutingQueryFields }),
          success: described(Schema.Array(LocalHfFile), "GGUF files in a Hub repo"),
        }).annotateMerge(OpenApi.annotations({ identifier: "local.files", summary: "List Hub repo GGUF files" })),
        HttpApiEndpoint.post("download", `${root}/download`, {
          query: WorkspaceRoutingQuery,
          payload: LocalDownloadPayload,
          success: described(LocalModelInfo, "Downloaded model"),
        }).annotateMerge(OpenApi.annotations({ identifier: "local.download", summary: "Download a Hub GGUF" })),
        HttpApiEndpoint.get("downloads", `${root}/downloads`, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(LocalDownloadProgress), "Active downloads"),
        }).annotateMerge(OpenApi.annotations({ identifier: "local.downloads", summary: "Download progress" })),
        HttpApiEndpoint.post("chat", `${root}/chat`, {
          query: WorkspaceRoutingQuery,
          payload: LocalChatPayload,
          success: described(LocalChatResult, "Local model reply"),
        }).annotateMerge(OpenApi.annotations({ identifier: "local.chat", summary: "Chat with a local model" })),
        HttpApiEndpoint.post("speak", `${root}/speak`, {
          query: WorkspaceRoutingQuery,
          payload: LocalSpeakPayload,
          success: described(LocalSpeakResult, "Synthesised speech as base64 audio"),
        }).annotateMerge(OpenApi.annotations({ identifier: "local.speak", summary: "Synthesise speech with the bundled backend" })),
      )
      .annotateMerge(OpenApi.annotations({ title: "local", description: "Local model routes." }))
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "zyraxon local models",
      version: "0.0.1",
      description: "Local model discovery, download and inference.",
    }),
  )
