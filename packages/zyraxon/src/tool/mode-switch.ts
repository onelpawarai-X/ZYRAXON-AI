import { SessionV1 } from "@zyraxon-ai/core/v1/session"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Session } from "@/session/session"
import { Provider } from "@/provider/provider"
import { InstanceState } from "@/effect/instance-state"
import { MessageID, PartID } from "../session/schema"
import { getCurrentTier, hasAccess } from "../subscription/canonical"
import type { Tier } from "../subscription/canonical"

export const Parameters = Schema.Struct({
  mode: Schema.String,
})

const MODE_TIERS: Record<string, Tier> = {
  general: "free",
  build: "free",
  plan: "free",
  explore: "free",
  vision: "free",
  pro: "pro",
  "pro-builder": "pro",
  beast: "max",
  auto: "ultra",
  apex: "ultra",
  "dark-emperor": "ultra",
}

export const ModeSwitchTool = Tool.define(
  "x_mode_switch",
  Effect.gen(function* () {
    const session = yield* Session.Service
    const provider = yield* Provider.Service

    return {
      description:
        "Switch ZYRAXON to another agent mode (general, build, plan, explore, vision, pro, pro-builder, beast, auto, apex, dark-emperor). The target mode must be unlocked by your current subscription tier. If the target mode is locked, this tool FAILS and returns a clear access-denied error. When allowed, the switch takes effect at the next provider turn.",
      parameters: Parameters,
      execute: (params: { mode: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const mode = params.mode.trim().toLowerCase()
          if (!mode) {
            return yield* Effect.fail(
              new Error("Mode is required. Choose: general, build, plan, explore, vision, pro, pro-builder, beast, auto, apex, or dark-emperor."),
            )
          }

          const required = MODE_TIERS[mode]
          if (!required) {
            return yield* Effect.fail(new Error(`Unknown mode "${params.mode}". Valid modes: general, build, plan, explore, vision, pro, pro-builder, beast, auto, apex, dark-emperor.`))
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

          return {
            title: `Switching to ${mode} mode`,
            output: `Switched to ${mode} mode. Waiting for the next provider turn to take effect.`,
            metadata: {},
          }
        }).pipe(Effect.orDie),
    }
  }),
)