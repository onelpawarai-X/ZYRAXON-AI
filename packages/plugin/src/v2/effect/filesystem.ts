// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { FileSystemEntry } from "@zyraxon-ai/sdk/v2/types"
import type { Effect } from "effect"

export interface FileSystem {
  read(input: { readonly path: string }): Effect.Effect<{ readonly content: Uint8Array; readonly mime: string }>
  list(input?: { readonly path?: string }): Effect.Effect<FileSystemEntry[]>
  find(input: {
    readonly query: string
    readonly type?: "file" | "directory"
    readonly limit?: number
  }): Effect.Effect<FileSystemEntry[]>
  glob(input: {
    readonly pattern: string
    readonly path?: string
    readonly limit?: number
  }): Effect.Effect<readonly FileSystemEntry[]>
}
