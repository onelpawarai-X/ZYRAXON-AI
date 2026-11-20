// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * MODEL-TO-MODEL DELEGATION
 *
 * Lets the model that is answering ask a different model to answer instead. The
 * caller picks a provider and model id; the tool resolves it from the live
 * provider list, runs one plain completion on it, and hands the text back.
 *
 * This is deliberately not a subagent. A subagent is a full session with its own
 * tools, permissions and loop; that is the `task` tool, and it is expensive. What
 * this covers is the cheap case: one question, one answer, from a model chosen for
 * the job — a vision model to read an image, a coding model to review a snippet, a
 * cheaper model to summarise. No new session, no tool loop, no shared state.
 *
 * The selected model is resolved from the provider registry rather than from a
 * hardcoded table, for the same reason media_generate does it: whatever the user
 * has configured is what is reachable, including local models.
 */

import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Provider } from "@/provider/provider"

const DESCRIPTION = `Ask another model a question and get its answer back.

Use this when a different model would do a better job than you: a vision model to
read an image, a coding model to review code, a long-context model to digest a large
document, a cheaper model to summarise. One question, one answer — this is not a
subagent and it does not have tools of its own.

- Call it several times in one message to ask several models at once.
- Leave provider and model out to ask the model the user has currently selected.
- The model must already be configured. Call x_list_models first if unsure.`

const Parameters = Schema.Struct({
  prompt: Schema.String.annotate({
    description: "The question or instruction to send to the other model. Be specific and self-contained.",
  }),
  provider: Schema.optional(Schema.String).annotate({
    description: "Provider id, for example anthropic or openai. Defaults to the user's current provider.",
  }),
  model: Schema.optional(Schema.String).annotate({
    description: "Model id within that provider. Defaults to the user's current model.",
  }),
  system: Schema.optional(Schema.String).annotate({
    description: "Optional system instruction for the other model.",
  }),
})

type Metadata = { provider?: string; model?: string }

export const ModelCallTool = Tool.define(
  "model_call",
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context): Effect.Effect<Tool.ExecuteResult<Metadata>> =>
        Effect.gen(function* () {
          const current = ctx.extra?.model as Provider.Model | undefined
          const providerID = params.provider ?? current?.providerID
          const modelID = params.model ?? current?.id
          if (!providerID || !modelID) {
            return {
              title: "No model to call",
              metadata: {},
              output:
                "No provider or model was given, and there is no current model to fall back to. " +
                "Pass provider and model explicitly.",
            }
          }

          const resolved = yield* provider
            .getModel(providerID as Provider.Model["providerID"], modelID as Provider.Model["id"])
            .pipe(Effect.catch(() => Effect.succeed(undefined as Provider.Model | undefined)))
          if (!resolved) {
            const all = yield* provider.list()
            const available = Object.values(all)
              .flatMap((entry) => Object.keys(entry.models).map((id) => `${entry.id}/${id}`))
              .slice(0, 40)
            return {
              title: `Unknown model ${providerID}/${modelID}`,
              metadata: { provider: providerID, model: modelID },
              output: `There is no configured model ${providerID}/${modelID}.\nAvailable models include:\n${available.join("\n")}`,
            }
          }

          const language = yield* provider
            .getLanguage(resolved)
            .pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (!language) {
            return {
              title: `Cannot load ${providerID}/${modelID}`,
              metadata: { provider: providerID, model: modelID },
              output: `The model ${providerID}/${modelID} is configured but its provider could not be loaded. Check that its credentials are set.`,
            }
          }
          const answer = yield* Effect.promise(() => runOne(language, params.prompt, params.system, ctx.abort))

          return {
            title: `${resolved.name} answered`,
            metadata: { provider: providerID, model: modelID },
            output: answer,
          }
        }),
    }
  }),
)

/** One completion, no tools, no loop. The AI SDK's own entry point for a single turn. */
export async function runOne(
  model: unknown,
  prompt: string,
  system: string | undefined,
  abort: AbortSignal,
): Promise<string> {
  const { generateText } = await import("ai")
  try {
    const result = await generateText({
      model: model as never,
      prompt,
      ...(system ? { system } : {}),
      abortSignal: abort,
    })
    const text = result.text.trim()
    return text.length > 0 ? text : "(the model returned an empty reply)"
  } catch (error) {
    return `The model call failed: ${error instanceof Error ? error.message : String(error)}`
  }
}
