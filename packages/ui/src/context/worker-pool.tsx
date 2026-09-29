// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { WorkerPoolManager } from "@pierre/diffs/worker"
import { createSimpleContext } from "./helper"

export type WorkerPools = {
  unified: WorkerPoolManager | undefined
  split: WorkerPoolManager | undefined
}

const ctx = createSimpleContext<WorkerPools, { pools: WorkerPools }>({
  name: "WorkerPool",
  init: (props) => props.pools,
})

export const WorkerPoolProvider = ctx.provider

export function useWorkerPool(diffStyle: "unified" | "split" | undefined) {
  const pools = ctx.use()
  if (diffStyle === "split") return pools.split
  return pools.unified
}
