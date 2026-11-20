// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Effect } from "effect"
import { layer, migrate } from "./database"

await Effect.runPromise(migrate().pipe(Effect.provide(layer)))
