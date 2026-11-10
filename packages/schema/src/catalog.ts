// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as Catalog from "./catalog"

import { define, inventory } from "./event"

const Updated = define({ type: "catalog.updated", schema: {} })
export const Event = { Updated, Definitions: inventory(Updated) }
