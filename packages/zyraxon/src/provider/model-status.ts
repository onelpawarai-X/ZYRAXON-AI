// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Schema } from "effect"

export { CatalogModelStatus } from "@zyraxon-ai/core/provider-catalog"

export const ModelStatus = Schema.Literals(["alpha", "beta", "deprecated", "active"])
export type ModelStatus = typeof ModelStatus.Type

export * as ProviderModelStatus from "./model-status"
