// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as ProviderCatalog from "./provider-catalog"

import { define, inventory } from "./event"

// The wire name stays "models-dev.refreshed" on purpose: event types are a
// persisted contract, and renaming one would orphan every event already written
// to disk. The module that owns it is the provider catalogue.
const Refreshed = define({
  type: "models-dev.refreshed",
  schema: {},
})
export const Event = { Refreshed, Definitions: inventory(Refreshed) }
