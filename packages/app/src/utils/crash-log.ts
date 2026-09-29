// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

// Crash log stub — all logging silently no-ops
// In Electron renderer (sandbox:true), file writes via window.require("fs") are blocked
// Use IPC to main process for actual file logging if needed
export function zlog(..._args: any[]) {}
export function zlogError(..._args: any[]) {}
export function zlogSection(..._args: any[]) {}
