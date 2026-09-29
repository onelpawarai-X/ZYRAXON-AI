// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"

export default Runtime.handler(
  Commands.commands.debug.commands.agents,
  Effect.fn("cli.debug.agents")(function* () {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const response = yield* Effect.promise(() => client.v2.agent.list({ location: { directory: process.cwd() } }))
    process.stdout.write(
      JSON.stringify(
        response.data?.data.toSorted((a, b) => a.id.localeCompare(b.id)),
        null,
        2,
      ) + EOL,
    )
  }),
)
