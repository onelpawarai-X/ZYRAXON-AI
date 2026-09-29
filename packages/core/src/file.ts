// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as File from "./file"

import { Revert } from "@zyraxon-ai/schema/revert"

export const Diff = Revert.FileDiff
export type Diff = typeof Diff.Type
