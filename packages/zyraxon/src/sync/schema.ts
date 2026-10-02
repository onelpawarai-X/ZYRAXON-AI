// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Schema } from "effect"

import { Identifier } from "@/id/id"
import { statics } from "@zyraxon-ai/core/schema"

export const EventID = Schema.String.check(Schema.isStartsWith("evt")).pipe(
  Schema.brand("EventID"),
  statics((s) => ({
    ascending: (id?: string) => s.make(Identifier.ascending("event", id)),
  })),
)
