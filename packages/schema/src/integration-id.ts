// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Schema } from "effect"

export const IntegrationID = Schema.String.pipe(Schema.brand("Integration.ID"))
export type IntegrationID = typeof IntegrationID.Type

export const IntegrationMethodID = Schema.String.pipe(Schema.brand("Integration.MethodID"))
export type IntegrationMethodID = typeof IntegrationMethodID.Type
