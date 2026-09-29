// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

// Separate file because every export in `agent-plugin.ts` must be a function.
export const PLUGIN_AGENT = {
  name: "plugin_added",
  description: "Added by a plugin via the config hook",
  mode: "subagent",
} as const
