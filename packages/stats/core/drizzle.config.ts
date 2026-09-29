// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Resource } from "sst/resource"
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "mysql",
  schema: ["./src/database/schema.ts"],
  // schema: ["./src/**/*.sql.ts"],
  out: "./migrations/",
  strict: true,
  verbose: true,
  dbCredentials: {
    database: Resource.StatsDatabase.database,
    host: Resource.StatsDatabase.host,
    user: Resource.StatsDatabase.username,
    password: Resource.StatsDatabase.password,
    port: Resource.StatsDatabase.port,
    ssl: {
      rejectUnauthorized: false,
    },
  },
})
