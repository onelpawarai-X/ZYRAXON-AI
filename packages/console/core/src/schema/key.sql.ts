// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { mysqlTable, varchar, uniqueIndex } from "drizzle-orm/mysql-core"
import { timestamps, ulid, utc, workspaceColumns } from "../drizzle/types"
import { workspaceIndexes } from "./workspace.sql"

export const KeyTable = mysqlTable(
  "key",
  {
    ...workspaceColumns,
    ...timestamps,
    name: varchar("name", { length: 255 }).notNull(),
    key: varchar("key", { length: 255 }).notNull(),
    userID: ulid("user_id").notNull(),
    timeUsed: utc("time_used"),
  },
  (table) => [...workspaceIndexes(table), uniqueIndex("global_key").on(table.key)],
)
