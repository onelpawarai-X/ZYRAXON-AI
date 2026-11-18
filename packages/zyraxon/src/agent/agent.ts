// Copyright (c) 2026 onelpawarai. All rights reserved.

import { LayerNode } from "@zyraxon-ai/core/effect/layer-node"
import { PermissionV1 } from "@zyraxon-ai/core/v1/permission"
import { Config } from "@/config/config"
import { ConfigV1 } from "@zyraxon-ai/core/v1/config/config"
import { serviceUse } from "@zyraxon-ai/core/effect/service-use"
import { Provider } from "@/provider/provider"

import { generateObject, streamObject, type ModelMessage } from "ai"
import { Truncate } from "@/tool/truncate"
import { Auth } from "../auth"
import { ProviderTransform } from "@/provider/transform"

import { PromptVault } from "@/subscription/prompt-vault"
import { Permission } from "@/permission"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@zyraxon-ai/core/global"
import path from "path"
import { Plugin } from "@/plugin"
import { Skill } from "../skill"
import { Effect, Context, Layer, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { AbsolutePath, type DeepMutable } from "@zyraxon-ai/core/schema"
import { ProviderV2 } from "@zyraxon-ai/core/provider"
import { ModelV2 } from "@zyraxon-ai/core/model"
import { LocationServiceMap, locationServiceMapLayer } from "@zyraxon-ai/core/location-services"
import { Reference } from "@zyraxon-ai/core/reference"
import { Location } from "@zyraxon-ai/core/location"
import { PluginV2 } from "@zyraxon-ai/core/plugin"

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  native: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  topP: Schema.optional(Schema.Finite),
  temperature: Schema.optional(Schema.Finite),
  color: Schema.optional(Schema.String),
  permission: PermissionV1.Ruleset,
  model: Schema.optional(
    Schema.Struct({
      modelID: ModelV2.ID,
      providerID: ProviderV2.ID,
    }),
  ),
  variant: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  options: Schema.Record(Schema.String, Schema.Unknown),
  steps: Schema.optional(Schema.Finite),
}).annotate({ identifier: "Agent" })
export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>

const GeneratedAgent = Schema.Struct({
  identifier: Schema.String,
  whenToUse: Schema.String,
  systemPrompt: Schema.String,
})

export interface Interface {
  readonly get: (agent: string) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Info[]>
  readonly defaultInfo: () => Effect.Effect<Info>
  readonly defaultAgent: () => Effect.Effect<string>
  readonly generate: (input: {
    description: string
    model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
  }) => Effect.Effect<
    {
      identifier: string
      whenToUse: string
      systemPrompt: string
    },
    Provider.DefaultModelError
  >
}

type State = Omit<Interface, "generate">

export class Service extends Context.Service<Service, Interface>()("@zyraxon/Agent") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const plugin = yield* Plugin.Service
    const skill = yield* Skill.Service
    const provider = yield* Provider.Service
    const locations = yield* LocationServiceMap.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("Agent.state")(function* (ctx) {
        const cfg = yield* config.get()
        const skillDirs = yield* skill.dirs()
        const referenceDirs = Object.keys(cfg.references ?? cfg.reference ?? {}).length
          ? yield* Effect.gen(function* () {
              yield* (yield* PluginV2.Service).wait(PluginV2.ID.make("core/config-reference"))
              return (yield* (yield* Reference.Service).list()).map((reference) => reference.path)
            }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
          : []
        const whitelistedDirs = [
          Truncate.GLOB,
          path.join(Global.Path.tmp, "*"),
          ...skillDirs.map((dir) => path.join(dir, "*")),
          ...referenceDirs.map((dir) => path.join(dir, "*")),
        ]
        const readonlyExternalDirectory = {
          "*": "ask",
          ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
        } satisfies Record<string, "allow" | "ask" | "deny">

        const defaults = Permission.fromConfig({
          "*": "allow",
          doom_loop: "ask",
          external_directory: {
            "*": "ask",
            ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
          },
          question: "deny",
          plan_enter: "deny",
          plan_exit: "deny",
          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files
          read: {
            "*": "allow",
            "*.env": "ask",
            "*.env.*": "ask",
            "*.env.example": "allow",
          },
        })

        const user = Permission.fromConfig(cfg.permission ?? {})

        const builtinAgents: Record<string, Info> = {
          auto: {
            name: "auto",
            description: "AUTO ORCHESTRATOR — Plans a task, delegates it to the right modes in parallel, and merges their results into one answer.",
            options: {},
            color: "#00D4FF",
            prompt: PromptVault.ref("mode", "auto"),
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          build: {
            name: "build",
            description: "BUILD MODE — Full-stack engineering: files, shell, git, tests and deployment, with subagents, memory and self-evolution.",
            options: {},
            prompt: PromptVault.ref("mode", "build"),
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                memory: "allow",
                self_evolve: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          plan: {
            name: "plan",
            description: "PLAN MODE — Read-only architecture and planning. Reads, searches and runs non-destructive checks; every file write is denied except plan documents in .zyraxon/plans/.",
            options: {},
            prompt: PromptVault.ref("mode", "plan"),
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_exit: "allow",
                task: {
                  general: "deny",
                },
                external_directory: {
                  [path.join(Global.Path.data, "plans", "*")]: "allow",
                },
                edit: {
                  "*": "deny",
                  [path.join(".zyraxon", "plans", "*.md")]: "allow",
                  [path.relative(ctx.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
                },
                write: "deny",
                shell: "allow",
                self_evolve: "deny",
                memory: "deny",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          beast: {
            name: "beast",
            description: "BEAST MODE — Aggressive autonomous coding: full file and shell access, nested subagents, permanent memory, auto-test and auto-fix until the task is done.",
            options: {},
            color: "#FF4500",
            prompt: PromptVault.ref("mode", "beast"),
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          pro: {
            name: "pro",
            description: "PRO MODE — Professional-grade coding with strict quality enforcement, security scans and documentation, for production-ready output.",
            options: {},
            color: "#FFD700",
            prompt: PromptVault.ref("mode", "pro"),
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          apex: {
            name: "apex",
            description: "APEX PREDATOR — Maximum power: every tool, self-evolution, memory and runtime tool synthesis, with self-healing when something fails.",
            options: {},
            color: "#FF0000",
            prompt: PromptVault.ref("mode", "apex"),
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          "dark-emperor": {
            name: "dark-emperor",
            description: "DARK EMPEROR — Ultra mode: all ULTRA tools, full system access, a subagent empire and autonomous operation with the widest authority.",
            options: {},
            color: "#8B0000",
            prompt: PromptVault.ref("mode", "dark-emperor"),
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          "pro-builder": {
            name: "pro-builder",
            description: "PRO BUILDER — Turns natural language into a complete website: HTML/CSS/JS, responsive design, and GitHub Pages deployment.",
            options: {},
            color: "#10B981",
            prompt: PromptVault.ref("mode", "pro-builder"),
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
                shell: "allow",
                write: "allow",
                edit: "allow",
                read: "allow",
                glob: "allow",
                grep: "allow",
                webfetch: "allow",
                websearch: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          vision: {
            name: "vision",
            description: "VISION MODE — Real-time screen analysis: a frame every 2 seconds, scene and activity tracking, read and shell access. Writing and editing are denied.",
            options: {},
            color: "#8B5CF6",
            prompt: PromptVault.ref("mode", "vision"),
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
                read: "allow",
                write: "deny",
                edit: "deny",
                glob: "allow",
                grep: "allow",
                bash: "allow",
                screen_vision: "deny",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          general: {
            name: "general",
            description: `GENERAL MODE — Default subagent for delegated tasks: research, code analysis, file work and multi-step flows, focused on the one task.`,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                todowrite: "deny",
                self_evolve: "deny",
              }),
              user,
            ),
            options: {},
            mode: "subagent",
            native: true,
          },
          explore: {
            name: "explore",
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                grep: "allow",
                glob: "allow",
                list: "allow",
                bash: "allow",
                webfetch: "allow",
                websearch: "allow",
                read: "allow",
                external_directory: readonlyExternalDirectory,
              }),
              user,
            ),
            description: `EXPLORE MODE — Read-only codebase exploration: grep, glob, read and web search, at quick, medium or very thorough depth.`,
            prompt: PromptVault.ref("mode", "explore"),
            options: {},
            mode: "subagent",
            native: true,
          },
          compaction: {
            name: "compaction",
            mode: "primary",
            native: true,
            hidden: true,
            prompt: PromptVault.ref("utility", "compaction"),
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            options: {},
          },
          title: {
            name: "title",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            temperature: 0.5,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PromptVault.ref("utility", "title"),
          },
        }

        // Agents are resolved from the current config on every read. Config-created
        // agents (Settings → Agents writes `agent.<name>`) must appear in the mode
        // selector without a restart, and the instance state that owns this closure
        // is built once and cached, so a map captured here would never see them.
        function resolveAgents(cfg: ConfigV1.Info): Record<string, Info> {
          const agents: Record<string, Info> = Object.fromEntries(
            Object.entries(builtinAgents).map(([name, agent]) => [
              name,
              { ...agent, permission: [...agent.permission], options: { ...agent.options } },
            ]),
          )

          for (const [key, value] of Object.entries(cfg.agent ?? {})) {
            if (value.disable) {
              delete agents[key]
              continue
            }
            let item = agents[key]
            if (!item)
              item = agents[key] = {
                name: key,
                mode: "all",
                permission: Permission.merge(defaults, user),
                options: {},
                native: false,
              }
            if (value.model) item.model = Provider.parseModel(value.model)
            item.variant = value.variant ?? item.variant
            item.prompt = value.prompt ?? item.prompt
            item.description = value.description ?? item.description
            item.temperature = value.temperature ?? item.temperature
            item.topP = value.top_p ?? item.topP
            item.mode = value.mode ?? item.mode
            item.color = value.color ?? item.color
            item.hidden = value.hidden ?? item.hidden
            item.name = value.name ?? item.name
            item.steps = value.steps ?? item.steps
            item.options = mergeDeep(item.options, value.options ?? {})
            item.permission = Permission.merge(item.permission, Permission.fromConfig(value.permission ?? {}))
          }

          // Ensure Truncate.GLOB is allowed unless explicitly configured
          for (const name in agents) {
            const agent = agents[name]
            const explicit = agent.permission.some((r) => {
              if (r.permission !== "external_directory") return false
              if (r.action !== "deny") return false
              return r.pattern === Truncate.GLOB
            })
            if (explicit) continue

            agents[name].permission = Permission.merge(
              agents[name].permission,
              Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
            )
          }

          return agents
        }

        const get = Effect.fnUntraced(function* (agent: string) {
          // Auto-start Vision Mode when vision agent is selected
          if (agent === "vision") {
            yield* Effect.promise(async () => {
              try {
                const { VisionContext } = await import("../screen/vision-context")
                if (!VisionContext.isRunning()) {
                  await VisionContext.start({ autoAnalyze: true, lowLatency: true })
                }
              } catch {}
            })
          }
          // Auto-stop Vision Mode when switching away from vision agent
          else {
            yield* Effect.promise(async () => {
              try {
                const { VisionContext } = await import("../screen/vision-context")
                if (VisionContext.isRunning()) {
                  VisionContext.stop()
                }
              } catch {}
            })
          }
          const cfg = yield* config.get()
          return resolveAgents(cfg)[agent]
        })

        const list = Effect.fnUntraced(function* () {
          const cfg = yield* config.get()
          return pipe(
            resolveAgents(cfg),
            values(),
            sortBy(
              [(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"],
              [(x) => x.name, "asc"],
            ),
          )
        })

        const defaultInfo = Effect.fnUntraced(function* () {
          const c = yield* config.get()
          const agents = resolveAgents(c)
          if (c.default_agent) {
            const agent = agents[c.default_agent]
            if (!agent) throw new Error(`default agent "${c.default_agent}" not found`)
            if (agent.mode === "subagent") throw new Error(`default agent "${c.default_agent}" is a subagent`)
            if (agent.hidden === true) throw new Error(`default agent "${c.default_agent}" is hidden`)
            return agent
          }
          const visible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
          if (!visible) throw new Error("no primary visible agent found")
          return visible
        })

        const defaultAgent = Effect.fnUntraced(function* () {
          return (yield* defaultInfo()).name
        })

        return {
          get,
          list,
          defaultInfo,
          defaultAgent,
        } satisfies State
      }),
    )

    return Service.of({
      get: Effect.fn("Agent.get")(function* (agent: string) {
        return yield* InstanceState.useEffect(state, (s) => s.get(agent))
      }),
      list: Effect.fn("Agent.list")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.list())
      }),
      defaultInfo: Effect.fn("Agent.defaultInfo")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultInfo())
      }),
      defaultAgent: Effect.fn("Agent.defaultAgent")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultAgent())
      }),
      generate: Effect.fn("Agent.generate")(function* (input: {
        description: string
        model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      }) {
        const cfg = yield* config.get()
        const model = input.model ?? (yield* provider.defaultModel())
        const resolved = yield* provider.getModel(model.providerID, model.modelID)
        const language = yield* provider.getLanguage(resolved)
        const tracer = cfg.experimental?.openTelemetry
          ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer))
          : undefined

        const system = [
          (yield* Effect.promise(() => PromptVault.resolve(PromptVault.ref("utility", "generate")))) ?? "",
        ]
        yield* plugin.trigger("experimental.chat.system.transform", { model: resolved }, { system })
        const existing = yield* InstanceState.useEffect(state, (s) => s.list())

        // TODO: clean this up so provider specific logic doesnt bleed over
        const authInfo = yield* auth.get(model.providerID).pipe(Effect.orDie)
        const isOpenaiOauth = model.providerID === "openai" && authInfo?.type === "oauth"

        const params = {
          experimental_telemetry: {
            isEnabled: cfg.experimental?.openTelemetry,
            tracer,
            metadata: {
              userId: cfg.username ?? "unknown",
            },
          },
          temperature: 0.3,
          messages: [
            ...(isOpenaiOauth
              ? []
              : system.map(
                  (item): ModelMessage => ({
                    role: "system",
                    content: item,
                  }),
                )),
            {
              role: "user",
              content: `Create an agent configuration based on this request: "${input.description}".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
            },
          ],
          model: language,
          schema: Object.assign(
            Schema.toStandardSchemaV1(GeneratedAgent),
            Schema.toStandardJSONSchemaV1(GeneratedAgent),
          ),
        } satisfies Parameters<typeof generateObject>[0]

        if (isOpenaiOauth) {
          return yield* Effect.promise(async () => {
            const result = streamObject({
              ...params,
              providerOptions: ProviderTransform.providerOptions(resolved, {
                instructions: system.join("\n"),
                store: false,
              }),
              onError: () => {},
            })
            for await (const part of result.fullStream) {
              if (part.type === "error") throw part.error
            }
            return result.object
          })
        }

        return yield* Effect.promise(() => generateObject(params).then((r) => r.object))
      }),
    })
  }),
)

const locationServiceMapNode = LayerNode.make({
  service: LocationServiceMap.Service,
  layer: locationServiceMapLayer,
  deps: [],
})

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Config.node, Auth.node, Plugin.node, Skill.node, Provider.node, locationServiceMapNode],
})

export * as Agent from "./agent"
