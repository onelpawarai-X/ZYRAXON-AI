// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as SessionCompactionEvent from "./session-compaction-event"

import { Event } from "./event"
import { SessionID } from "./session-id"

export const Compacted = Event.define({
  type: "session.compacted",
  schema: {
    sessionID: SessionID,
  },
})

export const Definitions = Event.inventory(Compacted)
