// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260211171708_add_project_commands",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`project\` ADD \`commands\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
