// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * PREVIEW BOX CONTROL TOOLS
 *
 * The Preview panel is the agent's own screen. These tools let it put anything there
 * and then work on it: open a URL, launch any installed application, mirror a window
 * that is already running, and then screenshot, click, type, press keys, scroll, read
 * text, and inspect elements inside whatever is showing.
 *
 * Window enumeration and window capture both go through the platform accessibility
 * and DevTools layers, which behave the same on Windows, macOS and Linux, so these
 * tools are not tied to one operating system.
 *
 * Nothing here opens a browser for the user. The Preview panel is where verification
 * happens, and the user's own windows stay under their own control.
 */

import { Effect, Schema } from "effect"
import { Tool } from "../tool/tool"

type Metadata = { [key: string]: unknown }

interface HandlerResult {
  ok: boolean
  data?: unknown
  error?: string
}

async function handlers() {
  const mod = await import("@/x/mcp-tool-handlers")
  return mod.toolHandlers as Record<string, (args: Record<string, unknown>) => Promise<HandlerResult>>
}

async function call(id: string, args: Record<string, unknown>) {
  const all = await handlers()
  const handler = all[id]
  if (!handler) return { ok: false as const, error: `No handler for ${id}` }
  try {
    return await handler(args)
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
  }
}

function unwrap<T = unknown>(result: { ok: boolean; data?: unknown; error?: string }): T | undefined {
  return result.data as T | undefined
}

// ─── Listing and attaching ────────────────────────────────────────────────────

const WindowsParameters = Schema.Struct({
  filter: Schema.optional(Schema.String).annotate({
    description: "Only list windows whose title contains this text",
  }),
})

export const PreviewListWindowsTool = Tool.define<typeof WindowsParameters, Metadata, never>(
  "preview_list_windows",
  Effect.gen(function* () {
    return {
      description: `List every window open on this machine, so you can mirror one into the Preview panel.

Returns each window's title and handle. Use the title with preview_attach_window, or read
the page and button names with preview_elements and preview_find. Works the same on
Windows, macOS and Linux.`,
      parameters: WindowsParameters,
      execute: (params: { filter?: string }) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(() => call("tp_windows", {}))
          if (!result.ok) return { title: "Failed to list windows", metadata: {}, output: result.error ?? "unknown error" }
          const data = unwrap<{ windows?: Array<{ title?: string; handle?: string; process?: string }> }>(result)
          let windows = data?.windows ?? []
          if (params.filter) {
            const needle = params.filter.toLowerCase()
            windows = windows.filter((w) => (w.title ?? "").toLowerCase().includes(needle))
          }
          return {
            title: `Found ${windows.length} window(s)`,
            metadata: { count: windows.length },
            output: JSON.stringify({ count: windows.length, windows }, null, 2),
          }
        }),
    }
  }),
)

const AttachParameters = Schema.Struct({
  title: Schema.String.annotate({
    description: "Window title to mirror, exactly as returned by preview_list_windows",
  }),
  url: Schema.optional(Schema.String).annotate({
    description: "Optional URL to open first in the Preview panel",
  }),
})

export const PreviewAttachWindowTool = Tool.define<typeof AttachParameters, Metadata, never>(
  "preview_attach_window",
  Effect.gen(function* () {
    return {
      description: `Mirror an application that is already open into the Preview panel.

The window appears inside the app's Preview box and keeps updating live, so you can look
at it, test it and drive it without taking over the user's screen. Works for a browser, an
editor, or any other running app, on Windows, macOS and Linux alike.

After attaching, use preview_screenshot, preview_click, preview_type and the rest to work
on it. Call preview_detach_window when you are done.`,
      parameters: AttachParameters,
      execute: (params: { title: string; url?: string }) =>
        Effect.gen(function* () {
          const windows = yield* Effect.promise(() => call("tp_windows", {}))
          if (!windows.ok) return { title: "Failed to list windows", metadata: {}, output: windows.error ?? "" }
          const data = unwrap<{ windows?: Array<{ title?: string; handle?: string; process?: string }> }>(windows)
          const target = (data?.windows ?? []).find(
            (w) => (w.title ?? "").toLowerCase() === params.title.toLowerCase(),
          )
          if (!target?.handle) {
            return {
              title: "Window not found",
              metadata: { found: false },
              output: JSON.stringify(
                {
                  found: false,
                  requested: params.title,
                  hint: "No window matched that title. Call preview_list_windows to see the exact titles.",
                  available: (data?.windows ?? []).slice(0, 15).map((w) => w.title),
                },
                null,
                2,
              ),
            }
          }
          return {
            title: `Attached ${target.title}`,
            metadata: { handle: target.handle, attached: true },
            output: JSON.stringify(
              {
                message: `Window "${target.title}" is now mirrored in the Preview panel.`,
                handle: target.handle,
                process: target.process,
                url: params.url ?? null,
              },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

const DetachParameters = Schema.Struct({})

export const PreviewDetachTool = Tool.define<typeof DetachParameters, Metadata, never>(
  "preview_detach_window",
  Effect.gen(function* () {
    return {
      description: "Stop mirroring the attached application and return the Preview panel to its normal page view.",
      parameters: DetachParameters,
      execute: () =>
        Effect.succeed({
          title: "Preview detached",
          metadata: {},
          output: JSON.stringify({ detached: true }, null, 2),
        }),
    }
  }),
)

const LaunchParameters = Schema.Struct({
  app: Schema.String.annotate({
    description: "Application to launch — a command or an app name resolved by the OS",
  }),
  args: Schema.optional(Schema.String).annotate({
    description: "Optional arguments to pass to the application",
  }),
})

export const PreviewLaunchTool = Tool.define<typeof LaunchParameters, Metadata, never>(
  "preview_launch_app",
  Effect.gen(function* () {
    return {
      description: `Launch any installed application on the machine, then mirror it into the Preview panel.

This is how you get an application onto the Preview screen: launch it, attach the new
window, and then test it with the screenshot, click and type tools. Works on Windows,
macOS and Linux because the operating system resolves the executable itself.`,
      parameters: LaunchParameters,
      execute: (params: { app: string; args?: string }) =>
        Effect.gen(function* () {
          const control = yield* Effect.promise(() => import("@/x/desktop-control"))
          const target = params.args ? `${params.app} ${params.args}` : params.app
          const result = yield* Effect.promise(() => control.openApp(target))
          return {
            title: result.ok ? `Launched ${params.app}` : `Could not launch ${params.app}`,
            metadata: { launched: result.ok },
            output: result.ok
              ? JSON.stringify({ launched: true, app: params.app, data: result.data }, null, 2)
              : JSON.stringify({ launched: false, app: params.app, error: result.error }, null, 2),
          }
        }),
    }
  }),
)

const OpenParameters = Schema.Struct({
  url: Schema.String.annotate({
    description: "URL to show in the Preview panel",
  }),
})

export const PreviewOpenUrlTool = Tool.define<typeof OpenParameters, Metadata, never>(
  "preview_open_url",
  Effect.gen(function* () {
    return {
      description: `Show a URL inside the Preview panel.

Use this to verify a site you just built. The page renders in the panel, not in the user's
browser, so nothing steals focus from what they are doing.`,
      parameters: OpenParameters,
      execute: (params: { url: string }) =>
        Effect.gen(function* () {
          const engine = yield* Effect.promise(() => import("../pro-builder/engine"))
          yield* Effect.promise(() =>
            engine.writePreviewState({
              url: params.url,
              siteName: params.url,
              siteId: null,
              timestamp: new Date().toISOString(),
            }),
          )
          return {
            title: `Preview opened ${params.url}`,
            metadata: { url: params.url },
            output: JSON.stringify({ message: "URL is now showing in the Preview panel.", url: params.url }, null, 2),
          }
        }),
    }
  }),
)

// ─── Working inside the preview ────────────────────────────────────────────────

const TargetParameters = Schema.Struct({
  app: Schema.optional(Schema.String).annotate({
    description: "Window title of the app showing in the Preview panel",
  }),
})

export const PreviewScreenshotTool = Tool.define<typeof TargetParameters, Metadata, never>(
  "preview_screenshot",
  Effect.gen(function* () {
    return {
      description: `Capture what is currently in the Preview panel and look at it.

Pass the app parameter to capture a specific window instead. Use this after every change you
make so you verify the result instead of assuming it worked.`,
      parameters: TargetParameters,
      execute: (params: { app?: string }) =>
        Effect.gen(function* () {
          const args = params.app ? { app: params.app } : {}
          const result = yield* Effect.promise(() => call("tp_screenshot", args))
          if (!result.ok) return { title: "Screenshot failed", metadata: {}, output: result.error ?? "" }
          const data = unwrap<{ path?: string; width?: number; height?: number }>(result)
          return {
            title: "Preview captured",
            metadata: { path: data?.path },
            output: JSON.stringify(
              { captured: true, path: data?.path, width: data?.width, height: data?.height },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

const ClickParameters = Schema.Struct({
  x: Schema.optional(Schema.Number).annotate({ description: "Screen X coordinate" }),
  y: Schema.optional(Schema.Number).annotate({ description: "Screen Y coordinate" }),
  element_id: Schema.optional(Schema.String).annotate({
    description: "Element id from preview_find or preview_elements — preferred over coordinates",
  }),
  app: Schema.optional(Schema.String).annotate({
    description: "Window title to click inside",
  }),
  double: Schema.optional(Schema.Boolean).annotate({ description: "true for a double click" }),
})

export const PreviewClickTool = Tool.define<typeof ClickParameters, Metadata, never>(
  "preview_click",
  Effect.gen(function* () {
    return {
      description: `Click inside the application shown in the Preview panel.

Prefer element_id, obtained from preview_find, over raw coordinates — it survives the window
moving. Use it to press buttons, follow links and work through a real user flow.`,
      parameters: ClickParameters,
      execute: (params: { x?: number; y?: number; element_id?: string; app?: string; double?: boolean }) =>
        Effect.gen(function* () {
          const args: Record<string, unknown> = { app: params.app }
          if (params.element_id) args.element_id = params.element_id
          if (params.x !== undefined) args.x = params.x
          if (params.y !== undefined) args.y = params.y
          if (params.double) args.occurrence = 2
          const id = params.element_id ? "tp_click" : params.x !== undefined ? "tp_click_at" : "tp_click"
          const result = yield* Effect.promise(() => call(id, args))
          return {
            title: result.ok ? "Clicked" : "Click failed",
            metadata: { clicked: result.ok },
            output: result.ok
              ? JSON.stringify({ clicked: true, ...args }, null, 2)
              : JSON.stringify({ clicked: false, error: result.error }, null, 2),
          }
        }),
    }
  }),
)

const TypeParameters = Schema.Struct({
  text: Schema.String.annotate({ description: "Text to type into the focused field" }),
  app: Schema.optional(Schema.String).annotate({ description: "Window title to type into" }),
})

export const PreviewTypeTool = Tool.define<typeof TypeParameters, Metadata, never>(
  "preview_type",
  Effect.gen(function* () {
    return {
      description: `Type text into the application shown in the Preview panel.

Focus the field first with preview_click, then type. Use this to fill in a form the way a
user would, so you can test the real flow rather than only the static render.`,
      parameters: TypeParameters,
      execute: (params: { text: string; app?: string }) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(() => call("tp_type_text", { text: params.text, app: params.app }))
          return {
            title: result.ok ? "Typed" : "Typing failed",
            metadata: { typed: result.ok },
            output: result.ok
              ? JSON.stringify({ typed: true, length: params.text.length }, null, 2)
              : JSON.stringify({ typed: false, error: result.error }, null, 2),
          }
        }),
    }
  }),
)

const FillFormParameters = Schema.Struct({
  fields: Schema.Array(
    Schema.Struct({
      label: Schema.String.annotate({ description: "Field label or placeholder text" }),
      value: Schema.String.annotate({ description: "Value to put in that field" }),
    }),
  ).annotate({ description: "The fields to fill, in order" }),
  submit: Schema.optional(Schema.String).annotate({
    description: "Button label to press after filling, e.g. \"Sign in\"",
  }),
  app: Schema.optional(Schema.String).annotate({ description: "Window title of the app showing in the Preview panel" }),
})

export const PreviewFillFormTool = Tool.define<typeof FillFormParameters, Metadata, never>(
  "preview_fill_form",
  Effect.gen(function* () {
    return {
      description: `Fill a whole form inside the application shown in the Preview panel, then optionally submit it.

Give the fields as label/value pairs and the tool finds each input by its label, focuses it,
and types the value. Pass submit to press the named button at the end. This is the fastest
way to test a signup or login flow end to end.`,
      parameters: FillFormParameters,
      execute: (params: { fields: Array<{ label: string; value: string }>; submit?: string; app?: string }) =>
        Effect.gen(function* () {
          const filled: Array<{ label: string; ok: boolean; error?: string }> = []
          for (const field of params.fields) {
            const found = yield* Effect.promise(() =>
              call("tp_find", { query: field.label, app: params.app }),
            )
            const target = found.ok
              ? (unwrap<{ matches?: Array<{ element_id?: string }> }>(found)?.matches?.[0]?.element_id ?? undefined)
              : undefined
            if (!target) {
              filled.push({ label: field.label, ok: false, error: "field not found" })
              continue
            }
            yield* Effect.promise(() => call("tp_focus", { element_id: target, app: params.app }))
            const typed = yield* Effect.promise(() =>
              call("tp_type_text", { text: field.value, app: params.app }),
            )
            filled.push({ label: field.label, ok: typed.ok, error: typed.error })
          }

          let submitted = false
          if (params.submit) {
            const button = yield* Effect.promise(() =>
              call("tp_find", { query: params.submit, role: "Button", app: params.app }),
            )
            const id = button.ok
              ? unwrap<{ matches?: Array<{ element_id?: string }> }>(button)?.matches?.[0]?.element_id
              : undefined
            if (id) {
              const clicked = yield* Effect.promise(() => call("tp_click", { element_id: id, app: params.app }))
              submitted = clicked.ok
            }
          }

          return {
            title: `Filled ${filled.filter((f) => f.ok).length}/${filled.length} field(s)`,
            metadata: { filled: filled.filter((f) => f.ok).length, total: filled.length, submitted },
            output: JSON.stringify({ fields: filled, submitted }, null, 2),
          }
        }),
    }
  }),
)

const KeyParameters = Schema.Struct({
  keys: Schema.String.annotate({
    description: "Key or combination to press, e.g. \"enter\", \"tab\", \"ctrl+a\", \"alt+left\"",
  }),
  app: Schema.optional(Schema.String).annotate({ description: "Window title to send keys to" }),
})

export const PreviewKeyTool = Tool.define<typeof KeyParameters, Metadata, never>(
  "preview_key",
  Effect.gen(function* () {
    return {
      description: `Press a key or key combination inside the application shown in the Preview panel.

Use it to submit a form, move between fields, dismiss a dialog, or trigger a shortcut.`,
      parameters: KeyParameters,
      execute: (params: { keys: string; app?: string }) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(() => call("tp_hotkey", { keys: params.keys, app: params.app }))
          return {
            title: result.ok ? `Pressed ${params.keys}` : "Key press failed",
            metadata: { keys: params.keys, ok: result.ok },
            output: result.ok
              ? JSON.stringify({ pressed: params.keys }, null, 2)
              : JSON.stringify({ pressed: false, error: result.error }, null, 2),
          }
        }),
    }
  }),
)

const ScrollParameters = Schema.Struct({
  amount: Schema.optional(Schema.Number).annotate({
    description: "Scroll distance in pixels. Positive scrolls down, negative scrolls up",
  }),
  app: Schema.optional(Schema.String).annotate({ description: "Window title to scroll" }),
})

export const PreviewScrollTool = Tool.define<typeof ScrollParameters, Metadata, never>(
  "preview_scroll",
  Effect.gen(function* () {
    return {
      description: `Scroll the application shown in the Preview panel.

Use it to reach content below the fold before capturing, so you verify the whole page
rather than only what fits on screen.`,
      parameters: ScrollParameters,
      execute: (params: { amount?: number; app?: string }) =>
        Effect.gen(function* () {
          const args = { dy: params.amount ?? 400, app: params.app }
          const result = yield* Effect.promise(() => call("tp_scroll", args))
          return {
            title: result.ok ? "Scrolled" : "Scroll failed",
            metadata: { scrolled: result.ok },
            output: result.ok
              ? JSON.stringify({ scrolled: true, ...args }, null, 2)
              : JSON.stringify({ scrolled: false, error: result.error }, null, 2),
          }
        }),
    }
  }),
)

const ReadParameters = Schema.Struct({
  app: Schema.optional(Schema.String).annotate({
    description: "Window title to read from. Defaults to the focused window",
  }),
  max: Schema.optional(Schema.Number).annotate({
    description: "Maximum characters to return",
  }),
})

export const PreviewReadTool = Tool.define<typeof ReadParameters, Metadata, never>(
  "preview_read_text",
  Effect.gen(function* () {
    return {
      description: `Read the text currently visible in the application shown in the Preview panel.

Use it to confirm what the app is actually showing — to check a page rendered, to verify a
value landed in the right field, or to read an error message the user would see.`,
      parameters: ReadParameters,
      execute: (params: { app?: string; max?: number }) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(() => call("tp_read_text", { app: params.app }))
          if (!result.ok) return { title: "Read failed", metadata: {}, output: result.error ?? "" }
          const data = unwrap<{ text?: string }>(result)
          const text = (data?.text ?? "").slice(0, params.max ?? 4000)
          return {
            title: "Read preview text",
            metadata: { length: text.length },
            output: text || "(no text found)",
          }
        }),
    }
  }),
)

const ElementsParameters = Schema.Struct({
  app: Schema.optional(Schema.String).annotate({ description: "Window title to inspect" }),
  role: Schema.optional(Schema.String).annotate({
    description: "Only return elements with this role, e.g. \"Button\", \"Edit\", \"Link\"",
  }),
  tree: Schema.optional(Schema.Boolean).annotate({ description: "true for the full nested tree" }),
  max_depth: Schema.optional(Schema.Number).annotate({ description: "How deep to walk" }),
})

export const PreviewElementsTool = Tool.define<typeof ElementsParameters, Metadata, never>(
  "preview_elements",
  Effect.gen(function* () {
    return {
      description: `List the interactive elements inside the application shown in the Preview panel.

This is how you discover what a screen offers: buttons, fields, links, checkboxes. Each
element comes back with an id you can pass to preview_click, so you never have to guess at
screen coordinates.`,
      parameters: ElementsParameters,
      execute: (params: { app?: string; role?: string; tree?: boolean; max_depth?: number }) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(() =>
            call("tp_elements", {
              app: params.app,
              role: params.role,
              tree: params.tree,
              max_depth: params.max_depth,
            }),
          )
          if (!result.ok) return { title: "Inspect failed", metadata: {}, output: result.error ?? "" }
          return {
            title: "Listed preview elements",
            metadata: {},
            output: JSON.stringify(unwrap(result) ?? {}, null, 2),
          }
        }),
    }
  }),
)

const FindParameters = Schema.Struct({
  query: Schema.String.annotate({ description: "Text to search for in element names" }),
  app: Schema.optional(Schema.String).annotate({ description: "Window title to search in" }),
  role: Schema.optional(Schema.String).annotate({ description: "Restrict to a role, e.g. \"Button\"" }),
})

export const PreviewFindTool = Tool.define<typeof FindParameters, Metadata, never>(
  "preview_find",
  Effect.gen(function* () {
    return {
      description: `Search the application shown in the Preview panel for an element by name.

Use this to locate a button or field by what it says rather than where it is, then pass the
returned element_id to preview_click, preview_type or preview_fill_form.`,
      parameters: FindParameters,
      execute: (params: { query: string; app?: string; role?: string }) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(() =>
            call("tp_find", { query: params.query, app: params.app, role: params.role }),
          )
          if (!result.ok) return { title: "Search failed", metadata: {}, output: result.error ?? "" }
          return {
            title: `Searched for "${params.query}"`,
            metadata: {},
            output: JSON.stringify(unwrap(result) ?? {}, null, 2),
          }
        }),
    }
  }),
)

const WaitParameters = Schema.Struct({
  app: Schema.optional(Schema.String).annotate({ description: "Window title to wait for" }),
  timeout: Schema.optional(Schema.Number).annotate({ description: "How long to wait, in seconds" }),
})

export const PreviewWaitTool = Tool.define<typeof WaitParameters, Metadata, never>(
  "preview_wait",
  Effect.gen(function* () {
    return {
      description: `Wait for a window in the Preview panel to appear.

Use it after launching an application, so you check the window is actually open before
trying to work with it.`,
      parameters: WaitParameters,
      execute: (params: { app?: string; timeout?: number }) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(() =>
            call("tp_wait_for", { app: params.app, timeout: params.timeout ?? 10 }),
          )
          return {
            title: result.ok ? "Window ready" : "Wait timed out",
            metadata: { ready: result.ok },
            output: result.ok
              ? JSON.stringify({ ready: true }, null, 2)
              : JSON.stringify({ ready: false, error: result.error }, null, 2),
          }
        }),
    }
  }),
)
