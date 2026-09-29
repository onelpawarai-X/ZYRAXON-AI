// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as ServerEvent from "./server-event"

import { Event } from "./event"

export const Connected = Event.define({ type: "server.connected", schema: {} })
export const Disposed = Event.define({ type: "global.disposed", schema: {} })

export const Definitions = Event.inventory(Connected, Disposed)
