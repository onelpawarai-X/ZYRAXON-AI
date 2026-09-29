// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { ReferenceGitSource, ReferenceLocalSource } from "@zyraxon-ai/sdk/v2/types"
import type { Hooks } from "./registration.js"

export interface ReferenceDraft {
  add(name: string, source: ReferenceLocalSource | ReferenceGitSource): void
  remove(name: string): void
  list(): readonly (readonly [string, ReferenceLocalSource | ReferenceGitSource])[]
}

export type ReferenceHooks = Hooks<{
  transform: ReferenceDraft
}>
