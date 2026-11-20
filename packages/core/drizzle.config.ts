// Copyright (c) 2026 onelpawarai. All rights reserved.

import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/**/*.sql.ts", "./src/**/sql.ts"],
  out: "./migration",
  dbCredentials: {
    url: "/home/thdxr/.local/share/onelpawarai/ZYRAXON-AI.db",
  },
})
