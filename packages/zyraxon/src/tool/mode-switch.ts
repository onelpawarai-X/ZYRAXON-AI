// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { SessionV1 } from "@zyraxon-ai/core/v1/session"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Session } from "@/session/session"
import { Provider } from "@/provider/provider"
import { InstanceState } from "@/effect/instance-state"
import { MessageID, PartID } from "../session/schema"
import { getCurrentTier, hasAccess } from "../subscription/canonical"
import { getAgentModeRequiredTier, listAgentModes } from "../subscription/agent-tiers"

export const Parameters = Schema.Struct({
  mode: Schema.String,
})

const VALID_MODES = listAgentModes().join(", ")

export const ModeSwitchTool = Tool.define(
  "x_mode_switch",
  Effect.gen(function* () {
    const session = yield* Session.Service
    const provider = yield* Provider.Service

    return {
      description:
        "Switch ZYRAXON to another agent mode (general, build, plan, explore, vision, pro, pro-builder, beast, auto, apex, dark-emperor). The switch takes effect immediately: the mode picker updates and the next turn runs in the new mode. The target mode must be unlocked by your current subscription tier; if it is locked this tool FAILS and returns a clear access-denied error.",
      parameters: Parameters,
      execute: (params: { mode: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const mode = params.mode.trim().toLowerCase()
          if (!mode) {
            return yield* Effect.fail(new Error(`Mode is required. Choose: ${VALID_MODES}.`))
          }

          const required = getAgentModeRequiredTier(mode)
          if (!required) {
            return yield* Effect.fail(new Error(`Unknown mode "${params.mode}". Valid modes: ${VALID_MODES}.`))
          }

          const current = getCurrentTier()
          if (!hasAccess(current, required)) {
            return yield* Effect.fail(
              new Error(`Access denied: switching to "${mode}" requires ${required} tier. You are on ${current} tier. Subscribe or enter your secret key to unlock it instantly.`),
            )
          }

          const messages = yield* session.messages({ sessionID: ctx.sessionID }).pipe(Effect.orDie)
          const lastUser = messages.findLast((item) => item.info.role === "user" && item.info.model)
          const model =
            lastUser?.info.role === "user" && lastUser.info.model ? lastUser.info.model : yield* provider.defaultModel()

          const msg: SessionV1.User = {
            id: MessageID.ascending(),
            sessionID: ctx.sessionID,
            role: "user",
            time: { created: Date.now() },
            agent: mode,
            model,
          }
          yield* session.updateMessage(msg)
          yield* session.updatePart({
            id: PartID.ascending(),
            messageID: msg.id,
            sessionID: ctx.sessionID,
            type: "text",
            text: `User switched ZYRAXON to ${mode} mode. Continue seamlessly in ${mode} mode.`,
            synthetic: true,
          } satisfies SessionV1.TextPart)

          // The synthetic message alone only labels that one message; the interface reads
          // the session's own agent field, so without this the mode picker kept showing the
          // old mode and the tool claimed a switch that never happened.
          yield* session
            .setAgentModel({
              sessionID: ctx.sessionID,
              agent: mode,
              model: { ...model, id: model.modelID },
              time: Date.now(),
            })
            .pipe(Effect.orDie)

          return {
            title: `Switched to ${mode} mode`,
            output: `Switched to ${mode} mode. The next turn runs in ${mode}.`,
            metadata: { mode },
          }
        }).pipe(Effect.orDie),
    }
  }),
)