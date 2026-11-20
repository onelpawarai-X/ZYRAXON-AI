// Copyright (c) 2026 onelpawarai. All rights reserved.

import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.ZYRAXON_CHANNEL ?? "dev"}`

await $`cd ../zyraxon && bun script/build-node.ts`
