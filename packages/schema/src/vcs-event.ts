// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as VcsEvent from "./vcs-event"

import { Schema } from "effect"
import { optional } from "./schema"
import { Event } from "./event"

export const BranchUpdated = Event.define({
  type: "vcs.branch.updated",
  schema: {
    branch: optional(Schema.String),
  },
})

export const Definitions = Event.inventory(BranchUpdated)
