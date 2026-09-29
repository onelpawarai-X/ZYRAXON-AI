// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { Effect } from "effect"

export interface Npm {
  add(pkg: string): Effect.Effect<
    {
      readonly directory: string
      readonly entrypoint?: string
    },
    unknown
  >
}
