// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { mysqlTable, primaryKey } from "drizzle-orm/mysql-core"
import { id, timestamps } from "../drizzle/types"

export const AccountTable = mysqlTable(
  "account",
  {
    id: id(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.id] })],
)
