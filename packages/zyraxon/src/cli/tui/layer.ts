// Copyright (c) 2026 onelpawarai. All rights reserved.

import { run as runTui, type TuiInput } from "@zyraxon-ai/tui"
import { Global } from "@zyraxon-ai/core/global"
import { AppNodeBuilder } from "@zyraxon-ai/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
