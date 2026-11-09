// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createMemo, createSignal, For, Show } from "solid-js"
import type { ToolPart } from "@zyraxon-ai/sdk/v2"
import { useSync } from "@/context/sync"

function outputOf(part: ToolPart) {
  const state = part.state as { output?: string; metadata?: Record<string, unknown> }
  const output = state.output || (typeof state.metadata?.["output"] === "string" ? state.metadata["output"] : undefined)
  return output?.trim()
}

function describeTool(part: ToolPart) {
  const state = part.state as { input?: Record<string, unknown>; metadata?: Record<string, unknown> }
  const input = state.input
  const metadata = state.metadata
  const description = typeof input?.["description"] === "string" ? input["description"].trim() : ""
  const command = typeof input?.["command"] === "string" ? input["command"].trim() : ""
  const query = typeof input?.["query"] === "string" ? input["query"].trim() : ""
  const prefix = metadata?.["background"] === true || input?.["background"] === true ? "background · " : ""
  return prefix + (description || command || query || `${part.tool} is running`)
}

export function BackgroundMonitor() {
  const sync = useSync()
  const [open, setOpen] = createSignal(false)
  const [expanded, setExpanded] = createSignal<string | undefined>(undefined)

  const active = createMemo(() =>
    Object.values(sync().data.part)
      .flatMap((parts) => parts ?? [])
      .filter((part): part is ToolPart => part?.type === "tool")
      .filter((part) => part.state.status === "pending" || part.state.status === "running")
      .slice()
      .sort((a, b) => a.tool.localeCompare(b.tool)),
  )

  return (
    <Show when={active().length > 0}>
      <div class="pointer-events-auto fixed bottom-5 right-5 z-[80] hidden select-none md:block">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open()}
          class="group flex items-center gap-2.5 rounded-xl border border-cyan-400/20 bg-[#060b12]/90 py-2 pl-3 pr-2 text-[12px] text-cyan-100 shadow-[0_12px_40px_rgba(0,0,0,0.45),0_0_28px_rgba(0,212,255,0.08)] backdrop-blur-xl"
        >
          <span class="flex size-2.5 items-center justify-center">
            <span class="absolute size-2.5 animate-ping rounded-full bg-cyan-400/25" />
            <span class="size-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(0,212,255,0.75)]" />
          </span>
          <span class="font-medium text-cyan-50">Background</span>
          <span class="flex h-5 min-w-5 items-center justify-center rounded-md bg-cyan-400/15 px-1.5 text-[10px] font-semibold text-cyan-300">
            {active().length}
          </span>
          <span class="text-cyan-200/50">{open() ? "hide" : "open"}</span>
        </button>

        <Show when={open()}>
          <div class="mt-2 w-80 overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#070c14]/95 shadow-[0_18px_60px_rgba(0,0,0,0.55),0_0_40px_rgba(0,212,255,0.06)] backdrop-blur-2xl">
            <div class="border-b border-white/[0.06] px-4 py-3">
              <div class="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Live agents & tools</div>
              <div class="mt-1 text-[13px] font-medium text-cyan-50">Working in parallel</div>
            </div>
            <div class="max-h-80 overflow-y-auto p-2">
              <For each={active()}>
                {(part) => (
                  <div class="rounded-xl transition-colors hover:bg-cyan-400/[0.06]">
                    <button
                      type="button"
                      onClick={() => setExpanded((value) => value === part.id ? undefined : part.id)}
                      aria-expanded={expanded() === part.id}
                      class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                    >
                      <span class="relative flex size-8 shrink-0 items-center justify-center rounded-lg border border-cyan-400/15 bg-cyan-400/5 text-cyan-300">
                        <span class="absolute size-1.5 rounded-full bg-cyan-300 animate-pulse" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-[12px] font-semibold capitalize text-cyan-50">{part.tool}</span>
                        <span class="mt-0.5 block truncate text-[11px] leading-4 text-slate-400">{describeTool(part)}</span>
                      </span>
                      <span class="flex shrink-0 flex-col items-end gap-1">
                        <span class="border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-cyan-300">
                          {(part.state as { metadata?: Record<string, unknown> }).metadata?.["background"] === true ? "bg agent" : "live"}
                        </span>
                        <span class="text-[9px] font-medium uppercase tracking-wider text-cyan-400/60">
                          {expanded() === part.id ? "hide" : "details"}
                        </span>
                      </span>
                    </button>
                    <Show when={expanded() === part.id}>
                      <div class="mx-3 mb-2 rounded-lg border border-cyan-400/10 bg-black/25 px-3 py-2 text-[10px] leading-4 text-slate-400">
                        <div class="flex items-center justify-between gap-2">
                          <span class="uppercase tracking-wider text-cyan-300/70">{part.state.status}</span>
                          <span>live</span>
                        </div>
                        <Show when={outputOf(part)}>
                          {(output) => <pre class="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md bg-black/30 p-2 font-mono text-[9.5px] leading-4 text-slate-300">{output()}</pre>}
                        </Show>
                        <p class="mt-1 line-clamp-3">{describeTool(part)}</p>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}
