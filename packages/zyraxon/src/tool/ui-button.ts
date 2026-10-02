// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * UI BUTTON INSPECTION TOOLS
 *
 * Gives the agent eyes on its own interface. Every button declared in APP_BUTTONS below
 * becomes its own tool, so the agent can verify a control by name instead of guessing at
 * screen coordinates or screenshotting blindly.
 *
 * Each generated tool answers three questions about one button: does it exist, is it
 * enabled, and where is it. Pass click to press it, or screenshot to capture the window so
 * the agent can look at the result of doing so.
 *
 * Inspection goes through the accessibility tree, so it works on a minimised or
 * off-screen window and does not steal focus unless a click is actually requested.
 */

import { Effect, Schema } from "effect"
import { Tool } from "../tool/tool"

type Metadata = { [key: string]: unknown }

interface ButtonSpec {
  key: string
  label: string
  query: string
  description: string
}

// Keep this list in sync with the interface. Each entry generates one tool.
const APP_BUTTONS: ButtonSpec[] = [
  {
    key: "send",
    label: "Send",
    query: "Send",
    description: "the control that submits the prompt in the chatbox",
  },
  {
    key: "stop",
    label: "Stop",
    query: "Stop",
    description: "the control that aborts the running turn",
  },
  {
    key: "new_session",
    label: "New Session",
    query: "New Session",
    description: "the control that opens a fresh session",
  },
  {
    key: "review",
    label: "Review Toggle",
    query: "review",
    description: "the control that opens or closes the review panel",
  },
  {
    key: "preview",
    label: "Preview",
    query: "Preview",
    description: "the control that opens the in-app website preview panel",
  },
  {
    key: "sidebar",
    label: "Sidebar Toggle",
    query: "sidebar",
    description: "the control that shows or hides the sidebar",
  },
  {
    key: "mode",
    label: "Mode Switcher",
    query: "mode",
    description: "the control that switches agent mode",
  },
  {
    key: "model",
    label: "Model Picker",
    query: "model",
    description: "the control that picks the model",
  },
  {
    key: "terminal",
    label: "Terminal",
    query: "terminal",
    description: "the control that opens the terminal panel",
  },
  {
    key: "attach",
    label: "Attach File",
    query: "Attach",
    description: "the control that attaches a file to the prompt",
  },
  {
    key: "todo",
    label: "Todo Toggle",
    query: "todo",
    description: "the control that shows or hides the todo list",
  },
  {
    key: "settings",
    label: "Settings",
    query: "Settings",
    description: "the control that opens settings",
  },
  {
    key: "plan_exit",
    label: "Plan Exit",
    query: "Exit Plan",
    description: "the control that leaves plan mode",
  },
]

const DEFAULT_APP = "ZYRAXON"

interface ElementRow {
  element_id?: string
  name?: string
  role?: string
  enabled?: boolean
  offscreen?: boolean
  x?: number
  y?: number
  width?: number
  height?: number
}

async function toolHandlers() {
  const mod = await import("@/x/mcp-tool-handlers")
  return mod.toolHandlers
}

async function findButtons(query: string, app: string, role = "Button"): Promise<ElementRow[]> {
  const handlers = await toolHandlers()
  const handler = handlers["tp_find"]
  if (!handler) return []
  const result = await handler({ query, app, role })
  if (!result.ok) return []
  const data = result.data as { matches?: ElementRow[] } | ElementRow[] | undefined
  if (Array.isArray(data)) return data
  return data?.matches ?? []
}

async function listButtons(app: string): Promise<ElementRow[]> {
  const handlers = await toolHandlers()
  const handler = handlers["tp_elements"]
  if (!handler) return []
  const result = await handler({ app, role: "Button" })
  if (!result.ok) return []
  const data = result.data as { elements?: ElementRow[] } | ElementRow[] | undefined
  if (Array.isArray(data)) return data
  return data?.elements ?? []
}

async function clickElement(elementId: string): Promise<boolean> {
  const handlers = await toolHandlers()
  const handler = handlers["tp_action"]
  if (!handler) return false
  const result = await handler({ element_id: elementId, action: "click" })
  return result.ok
}

async function screenshotWindow(app: string) {
  const handlers = await toolHandlers()
  const handler = handlers["tp_screenshot"]
  if (!handler) return undefined
  const result = await handler({ app })
  return result.ok ? result.data : undefined
}

const InspectParameters = Schema.Struct({
  app: Schema.optional(Schema.String).annotate({
    description: `Process or window name to scope to (default "${DEFAULT_APP}")`,
  }),
  click: Schema.optional(Schema.Boolean).annotate({
    description: "true to press the button instead of only inspecting it",
  }),
  screenshot: Schema.optional(Schema.Boolean).annotate({
    description: "true to capture the window after inspecting",
  }),
})

function makeTool(spec: ButtonSpec) {
  return Tool.define<typeof InspectParameters, Metadata, never>(
    `ui_button_${spec.key}`,
    Effect.gen(function* () {
      return {
        description: `Inspect ${spec.description} in the running ZYRAXON window.

Reports whether the button exists, whether it is enabled, and its on-screen position, so you
can verify the interface without guessing at coordinates. Pass click to press it, and
screenshot to capture the window afterwards.`,
        parameters: InspectParameters,
        execute: (params: { app?: string; click?: boolean; screenshot?: boolean }) =>
          Effect.gen(function* () {
            const app = params.app || DEFAULT_APP
            const matches = yield* Effect.promise(() => findButtons(spec.query, app))
            const target = matches[0]

            if (!target) {
              return {
                title: `${spec.label}: not found`,
                metadata: { found: false },
                output: JSON.stringify(
                  {
                    found: false,
                    button: spec.label,
                    hint: `No element matching "${spec.query}" with role Button was found in "${app}". Check the window is open, or list every button with ui_buttons_list.`,
                  },
                  null,
                  2,
                ),
              }
            }

            const clicked = params.click
              ? yield* Effect.promise(() => clickElement(target.element_id ?? ""))
              : false
            const shot = params.screenshot ? yield* Effect.promise(() => screenshotWindow(app)) : undefined

            return {
              title: `${spec.label}: ${target.enabled === false ? "disabled" : "available"}`,
              metadata: { found: true, clicked, enabled: target.enabled },
              output: JSON.stringify(
                {
                  found: true,
                  button: spec.label,
                  name: target.name,
                  enabled: target.enabled ?? true,
                  offscreen: target.offscreen ?? false,
                  position: { x: target.x, y: target.y, width: target.width, height: target.height },
                  elementId: target.element_id,
                  clicked,
                  screenshot: shot ? "captured" : "not requested",
                  otherMatches: matches.slice(1, 5).map((m) => m.name),
                },
                null,
                2,
              ),
            }
          }),
      }
    }),
  )
}

export const UIButtonTools = APP_BUTTONS.map(makeTool)

const ListButtonsParameters = Schema.Struct({
  app: Schema.optional(Schema.String).annotate({
    description: `Process or window name to scope to (default "${DEFAULT_APP}")`,
  }),
})

export const UIButtonsListTool = Tool.define<typeof ListButtonsParameters, Metadata, never>(
  "ui_buttons_list",
  Effect.gen(function* () {
    return {
      description: `List every button currently present in the running ZYRAXON window, with its
enabled state and position. Use this to discover what the interface is showing right now
before inspecting a specific control.`,
      parameters: ListButtonsParameters,
      execute: (params: { app?: string }) =>
        Effect.gen(function* () {
          const app = params.app || DEFAULT_APP
          const buttons = yield* Effect.promise(() => listButtons(app))
          return {
            title: `Found ${buttons.length} button(s)`,
            metadata: { count: buttons.length },
            output: JSON.stringify(
              {
                count: buttons.length,
                app,
                buttons: buttons.map((b) => ({
                  name: b.name,
                  enabled: b.enabled ?? true,
                  offscreen: b.offscreen ?? false,
                  position: { x: b.x, y: b.y, width: b.width, height: b.height },
                })),
              },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

export const UIButtonToolIds = APP_BUTTONS.map((spec) => `ui_button_${spec.key}`)
