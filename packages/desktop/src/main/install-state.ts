// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

export function hasExistingAppState(entries: Array<{ name: string; isDirectory: () => boolean }>) {
  return entries.some((entry) => {
    if (entry.name === "zyraxon.settings") return true
    if (entry.name.endsWith(".dat")) return true
    if (/^window-state-.+\.json$/.test(entry.name)) return true
    return entry.isDirectory() && entry.name === "zyraxon"
  })
}
