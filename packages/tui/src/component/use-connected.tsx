// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createMemo } from "solid-js"
import { useSync } from "../context/sync"

export function useConnected() {
  const sync = useSync()
  return createMemo(() =>
    sync.data.provider.some(
      (provider) =>
        provider.id !== "zyraxon" || Object.values(provider.models).some((model) => model.cost?.input !== 0),
    ),
  )
}
