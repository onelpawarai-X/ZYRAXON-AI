// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

export default defineConfig({
  root: import.meta.dirname,
  plugins: [solid()],
})
