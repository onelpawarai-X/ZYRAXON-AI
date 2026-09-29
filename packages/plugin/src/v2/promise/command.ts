// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { CommandDraft } from "../effect/command.js"
import type { Hooks } from "./registration.js"

export type { CommandDraft }

export type CommandHooks = Hooks<{
  transform: CommandDraft
}>
