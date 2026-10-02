// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * MULTI-SESSION CONTROL TOOLS
 *
 * Lets the agent work across every session in the project instead of being boxed
 * into the one it was started in:
 *
 * - session_list       discover every session and its state
 * - session_open       create a new session
 * - session_send       send a prompt into any session's chatbox and get its reply
 * - session_subagent   launch a subagent inside a chosen session
 * - session_switch     point the UI at a chosen session
 * - session_remove     delete a session
 *
 * session_send and session_subagent are designed to be issued together: open several
 * sessions, then fire one prompt into each of them in a single assistant message so all
 * of them run concurrently instead of one after another.
 */

import { Effect, Schema } from "effect"
import { Tool } from "../tool/tool"
import { Session } from "@/session/session"
import type { SessionPrompt } from "@/session/prompt"
import { MessageID, SessionID } from "../session/schema"

type Metadata = { [key: string]: unknown }

interface PromptOps {
  cancel(sessionID: SessionID): Effect.Effect<void>
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(input: SessionPrompt.PromptInput): Effect.Effect<unknown, never, never>
}

function opsOf(ctx: Tool.Context): PromptOps {
  const ops = ctx.extra?.promptOps as PromptOps | undefined
  if (!ops) throw new Error("session control tools require promptOps in ctx.extra")
  return ops
}

function lastText(result: unknown): string {
  const parts = (result as { parts?: Array<{ type: string; text?: string }> })?.parts ?? []
  return parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n").trim()
}

function summarise(session: Session.Info) {
  return {
    id: session.id,
    title: session.title,
    agent: session.agent,
    parentID: session.parentID ?? null,
    directory: session.directory,
  }
}

const ListParameters = Schema.Struct({
  search: Schema.optional(Schema.String).annotate({
    description: "Filter sessions by title or id substring",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Maximum sessions to return (default 100)",
  }),
})

export const SessionListTool = Tool.define<typeof ListParameters, Metadata, Session.Service>(
  "session_list",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    return {
      description: `List every session in this project so you can work across them.

Returns each session's id, title, agent, parent, and directory. Use the id from here with
session_send, session_subagent, session_switch, and session_remove.`,
      parameters: ListParameters,
      execute: (params, _ctx) =>
        Effect.gen(function* () {
          const all = yield* sessions.list()
          const needle = params.search?.toLowerCase()
          const filtered = needle
            ? all.filter((s) => s.title.toLowerCase().includes(needle) || s.id.toLowerCase().includes(needle))
            : all
          const limited = filtered.slice(0, params.limit ?? 100)
          return {
            title: `Listed ${limited.length} session(s)`,
            metadata: { count: limited.length },
            output: JSON.stringify({ count: limited.length, sessions: limited.map(summarise) }, null, 2),
          }
        }),
    }
  }),
)

const OpenParameters = Schema.Struct({
  title: Schema.optional(Schema.String).annotate({
    description: "Title for the new session",
  }),
  agent: Schema.optional(Schema.String).annotate({
    description: "Agent mode for the new session (build, plan, pro, ...)",
  }),
  child: Schema.optional(Schema.Boolean).annotate({
    description: "true to make it a child of the current session (default true)",
  }),
})

export const SessionOpenTool = Tool.define<typeof OpenParameters, Metadata, Session.Service>(
  "session_open",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    return {
      description: `Create a new session and return its id.

Open several sessions in one assistant message, then send a different prompt into each one
in a single parallel batch. Independent sessions run concurrently, which is far faster than
working through them one at a time.`,
      parameters: OpenParameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const created = yield* sessions.create({
            title: params.title,
            agent: params.agent,
            parentID: params.child === false ? undefined : ctx.sessionID,
          })
          return {
            title: `Opened session ${created.title}`,
            metadata: { sessionID: created.id },
            output: JSON.stringify(
              { message: `Session created. Use this id with session_send or session_subagent.`, ...summarise(created) },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

const SendParameters = Schema.Struct({
  sessionID: Schema.String.annotate({
    description: "Target session id from session_list or session_open",
  }),
  prompt: Schema.String.annotate({
    description: "The prompt text to send into that session's chatbox",
  }),
  agent: Schema.optional(Schema.String).annotate({
    description: "Agent mode to run the prompt with",
  }),
  background: Schema.optional(Schema.Boolean).annotate({
    description: "true to fire and forget without waiting for the reply (default false)",
  }),
})

export const SessionSendTool = Tool.define<typeof SendParameters, Metadata, Session.Service>(
  "session_send",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    return {
      description: `Send a prompt into any other session's chatbox and return that session's reply.

This is the tool for parallel work. Send independent prompts to several sessions in one
assistant message — they run concurrently and you get every result in that same turn,
instead of waiting for each session to finish before starting the next one.

Set background to true to deliver the prompt without waiting for the reply.`,
      parameters: SendParameters,
      execute: (params, _ctx) =>
        Effect.gen(function* () {
          const target = yield* sessions.get(SessionID.make(params.sessionID)).pipe(Effect.orDie)
          const ops = opsOf(_ctx)
          const parts = yield* ops.resolvePromptParts(params.prompt)
          const input: SessionPrompt.PromptInput = {
            sessionID: target.id,
            messageID: MessageID.ascending(),
            agent: params.agent ?? target.agent,
            parts,
            noReply: params.background === true ? true : undefined,
          }

          const result = yield* ops.prompt(input)
          if (params.background) {
            return {
              title: `Sent prompt to ${target.title}`,
              metadata: { sessionID: target.id, background: true },
              output: JSON.stringify(
                { message: "Prompt delivered and running in the background.", sessionID: target.id, sessionTitle: target.title },
                null,
                2,
              ),
            }
          }

          return {
            title: `Replied in ${target.title}`,
            metadata: { sessionID: target.id },
            output: JSON.stringify(
              { sessionID: target.id, sessionTitle: target.title, reply: lastText(result) },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

const SubagentParameters = Schema.Struct({
  sessionID: Schema.String.annotate({
    description: "Session that should host the subagent (defaults to the current session)",
  }),
  description: Schema.String.annotate({
    description: "Short label describing the subagent's job",
  }),
  prompt: Schema.String.annotate({
    description: "The task for the subagent to carry out",
  }),
  agent: Schema.optional(Schema.String).annotate({
    description: "Subagent type (build, plan, explore, pro, ...)",
  }),
})

export const SessionSubagentTool = Tool.define<typeof SubagentParameters, Metadata, Session.Service>(
  "session_subagent",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    return {
      description: `Launch a subagent inside a chosen session so it works there in parallel.

Combine with session_open and session_send to fan work out: open sessions, drop a subagent
into each one, and let them all run at the same time. Launch several subagents across
different sessions in a single assistant message rather than one after another.`,
      parameters: SubagentParameters,
      execute: (params, _ctx) =>
        Effect.gen(function* () {
          const host = yield* sessions.get(SessionID.make(params.sessionID ?? _ctx.sessionID)).pipe(Effect.orDie)
          const ops = opsOf(_ctx)
          const child = yield* sessions.create({
            parentID: host.id,
            title: `${params.description} (@${params.agent ?? "build"} subagent)`,
            agent: params.agent,
          })
          const parts = yield* ops.resolvePromptParts(params.prompt)
          yield* ops.prompt({
            sessionID: child.id,
            messageID: MessageID.ascending(),
            agent: params.agent ?? child.agent,
            parts,
            noReply: true,
          })
          return {
            title: `Launched subagent: ${params.description}`,
            metadata: { sessionID: child.id, hostID: host.id },
            output: JSON.stringify(
              {
                message: "Subagent launched and running in parallel.",
                hostSessionID: host.id,
                subagentSessionID: child.id,
                description: params.description,
              },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

const SwitchParameters = Schema.Struct({
  sessionID: Schema.String.annotate({
    description: "Session id to focus",
  }),
})

export const SessionSwitchTool = Tool.define<typeof SwitchParameters, Metadata, Session.Service>(
  "session_switch",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    return {
      description: `Point the interface at a different session and return that session's details.

Fails clearly when the session does not exist, so use it to confirm a session is real before
sending work into it.`,
      parameters: SwitchParameters,
      execute: (params, _ctx) =>
        Effect.gen(function* () {
          const target = yield* sessions.get(SessionID.make(params.sessionID)).pipe(Effect.orDie)
          const children = yield* sessions.children(target.id)
          return {
            title: `Switched to ${target.title}`,
            metadata: { sessionID: target.id },
            output: JSON.stringify(
              {
                message: `Now focused on "${target.title}".`,
                route: `/session/${target.id}`,
                ...summarise(target),
                childSessions: children.map(summarise),
              },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

const RemoveParameters = Schema.Struct({
  sessionID: Schema.String.annotate({
    description: "Session id to delete (removes its children too)",
  }),
})

export const SessionRemoveTool = Tool.define<typeof RemoveParameters, Metadata, Session.Service>(
  "session_remove",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    return {
      description: "Delete a session and everything under it. Use it to clean up scratch sessions.",
      parameters: RemoveParameters,
      execute: (params, _ctx) =>
        Effect.gen(function* () {
          const target = yield* sessions.get(SessionID.make(params.sessionID)).pipe(Effect.orDie)
          yield* sessions.remove(target.id).pipe(Effect.orDie)
          return {
            title: `Removed ${target.title}`,
            metadata: {},
            output: JSON.stringify({ message: `Deleted session ${target.id}.` }, null, 2),
          }
        }),
    }
  }),
)
