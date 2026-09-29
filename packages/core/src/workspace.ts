// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as WorkspaceV2 from "./workspace"

import { Workspace } from "@zyraxon-ai/schema/workspace"

export const ID = Workspace.ID
export type ID = typeof ID.Type
