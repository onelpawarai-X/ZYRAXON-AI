// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Context, Effect } from "effect"

export interface Interface {
  readonly run: Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@zyraxon/InstanceBootstrap") {}

export * as InstanceBootstrap from "./bootstrap-service"
