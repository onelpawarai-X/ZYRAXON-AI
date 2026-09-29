// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as IdeEvent from "./ide-event"

import { Schema } from "effect"
import { Event } from "./event"

export const Installed = Event.define({
  type: "ide.installed",
  schema: {
    ide: Schema.String,
  },
})

export const Definitions = Event.inventory(Installed)
