// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@zyraxon-ai/schema/location"
import { InvalidRequestError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const StorageUsage = Schema.Struct({
  path: Schema.String,
  bytes: Schema.Number,
  pages: Schema.Number,
  freelistPages: Schema.Number,
  pageSize: Schema.Number,
  sessions: Schema.Number,
  messages: Schema.Number,
  parts: Schema.Number,
}).annotate({ identifier: "StorageUsage" })

export const StorageResult = Schema.Struct({
  sessions: Schema.Number,
  messages: Schema.Number,
  parts: Schema.Number,
  bytesBefore: Schema.Number,
  bytesAfter: Schema.Number,
}).annotate({ identifier: "StorageResult" })

const PurgeInput = Schema.Struct({
  sessionIDs: Schema.optional(Schema.Array(Schema.String)),
  olderThan: Schema.optional(Schema.String),
}).annotate({ identifier: "StoragePurgeInput" })

export const StorageGroup = HttpApiGroup.make("server.storage")
  .add(
    HttpApiEndpoint.get("storage.usage", "/api/storage", {
      query: LocationQuery,
      success: Location.response(StorageUsage),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.storage.usage",
          summary: "Get storage usage",
          description:
            "Report where the database lives, how large it is on disk, how many pages sit on the freelist, and how many sessions, messages and parts it holds.",
        }),
      ),
    HttpApiEndpoint.post("storage.compact", "/api/storage/compact", {
      query: LocationQuery,
      success: Location.response(StorageResult),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.storage.compact",
          summary: "Reclaim unused disk space",
          description:
            "Checkpoint the write-ahead log, run incremental vacuum so freed pages return to the filesystem, then optimise. Reports the size before and after.",
        }),
      ),
    HttpApiEndpoint.post("storage.purge", "/api/storage/purge", {
      query: LocationQuery,
      payload: PurgeInput,
      success: Location.response(StorageResult),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.storage.purge",
          summary: "Permanently delete stored sessions",
          description:
            "Delete sessions by id, or every session older than a timestamp. Messages and parts go with them, and the freed pages are handed back in the same call.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "storage",
      description: "Database size, reclaim and purge routes.",
    }),
  )