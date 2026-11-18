// Copyright (c) 2026 onelpawarai. All rights reserved.

import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import { createQuery, useQueryClient } from "@tanstack/solid-query"
import { createMemo, createSignal, For, Show } from "solid-js"

type Job = {
  id: string
  type: string
  title?: string
  status: "running" | "completed" | "error" | "cancelled"
  started_at: number
  completed_at?: number
  output?: string
  error?: string
}

const STATUS_STYLE: Record<Job["status"], string> = {
  running: "text-v2-text-text-accent border-v2-border-border-focus bg-v2-background-bg-accent/10",
  completed: "text-v2-text-text-base border-v2-border-border-base bg-v2-background-bg-layer-02",
  error: "text-red-600 border-red-500/40 bg-red-500/10",
  cancelled: "text-v2-text-text-muted border-v2-border-border-muted bg-v2-background-bg-layer-01",
}

/**
 * Live view of the work ZYRAXON is doing in the background.
 *
 * It reads the server's own job registry, so a running job stays listed for as
 * long as it runs and a finished one keeps its final status and output. A
 * running job can be stopped from here; the work is interrupted at its next safe
 * point and whatever it produced so far is kept.
 */
export function BackgroundMonitor() {
  const language = useLanguage()
  const sdk = useSDK()
  const queryClient = useQueryClient()
  const [open, setOpen] = createSignal(false)
  const [expanded, setExpanded] = createSignal<string | undefined>(undefined)
  const [stopping, setStopping] = createSignal<string | undefined>(undefined)

  const directory = createMemo(() => sdk().directory)
  const jobsQuery = createQuery(() => ({
    queryKey: ["background-jobs", directory()],
    queryFn: () =>
      sdk()
        .client.experimental.background.jobs.list({ directory: directory() })
        .then((r) => (r.data ?? []) as Job[]),
    refetchInterval: 2000,
  }))

  const jobs = createMemo(() => jobsQuery.data ?? [])
  const running = createMemo(() => jobs().filter((job) => job.status === "running"))

  const stop = async (job: Job) => {
    setStopping(job.id)
    try {
      await sdk().client.experimental.background.jobs.stop({ jobID: job.id, directory: directory() })
      await queryClient.invalidateQueries({ queryKey: ["background-jobs", directory()] })
      showToast({ title: language.t("background.stopped"), description: job.title ?? job.type })
    } finally {
      setStopping(undefined)
    }
  }

  return (
    <Show when={jobs().length > 0}>
      <div class="pointer-events-auto fixed bottom-5 right-5 z-[80] hidden select-none md:block">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open()}
          class="flex items-center gap-2.5 rounded-xl border border-v2-border-border-base bg-v2-background-bg-layer-02 py-2 pl-3 pr-2 text-[12px] text-v2-text-text-base shadow-[var(--v2-elevation-raised)] backdrop-blur-xl transition-colors hover:bg-v2-overlay-simple-overlay-hover"
        >
          <span class="flex size-2.5 items-center justify-center">
            <Show when={running().length > 0}>
              <span class="absolute size-2.5 animate-ping rounded-full bg-v2-icon-icon-accent/25" />
            </Show>
            <span class="size-2 rounded-full bg-v2-icon-icon-accent" />
          </span>
          <span class="font-medium text-v2-text-text-base">{language.t("background.title")}</span>
          <span class="flex h-5 min-w-5 items-center justify-center rounded-md bg-v2-background-bg-layer-04 px-1.5 text-[10px] font-semibold text-v2-text-text-muted">
            {jobs().length}
          </span>
          <span class="text-v2-text-text-faint">
            {open() ? language.t("background.hide") : language.t("background.open")}
          </span>
        </button>

        <Show when={open()}>
          <div class="mt-2 w-80 overflow-hidden rounded-2xl border border-v2-border-border-base bg-v2-background-bg-layer-01 shadow-[var(--v2-elevation-floating)] backdrop-blur-2xl">
            <div class="border-b border-v2-border-border-muted px-4 py-3">
              <div class="text-[10px] font-semibold uppercase tracking-[0.2em] text-v2-text-text-muted">
                {language.t("background.subtitle")}
              </div>
              <div class="mt-1 text-[13px] font-medium text-v2-text-text-base">{language.t("background.heading")}</div>
            </div>
            <div class="max-h-80 overflow-y-auto p-2">
              <For each={jobs()}>
                {(job) => (
                  <div class="rounded-xl transition-colors hover:bg-v2-overlay-simple-overlay-hover">
                    <button
                      type="button"
                      onClick={() => setExpanded((value) => (value === job.id ? undefined : job.id))}
                      aria-expanded={expanded() === job.id}
                      class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                    >
                      <span class="relative flex size-8 shrink-0 items-center justify-center rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-03 text-v2-icon-icon-base">
                        <span
                          class="size-1.5 rounded-full bg-v2-icon-icon-accent"
                          classList={{ "animate-pulse": job.status === "running" }}
                        />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-[12px] font-semibold capitalize text-v2-text-text-base">
                          {job.title ?? job.type}
                        </span>
                        <span class="mt-0.5 block truncate text-[11px] leading-4 text-v2-text-text-muted">
                          {job.error ?? job.output ?? job.type}
                        </span>
                      </span>
                      <span class="flex shrink-0 flex-col items-end gap-1">
                        <span
                          class={`border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${STATUS_STYLE[job.status]}`}
                        >
                          {language.t(`background.status.${job.status}`)}
                        </span>
                        <span class="text-[9px] font-medium uppercase tracking-wider text-v2-text-text-faint">
                          {expanded() === job.id ? language.t("background.hide") : language.t("background.details")}
                        </span>
                      </span>
                    </button>
                    <Show when={expanded() === job.id}>
                      <div class="mx-3 mb-2 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 py-2 text-[10px] leading-4 text-v2-text-text-muted">
                        <Show when={job.output || job.error}>
                          {(text) => (
                            <pre class="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md bg-v2-background-bg-layer-01 p-2 font-mono text-[9.5px] leading-4 text-v2-text-text-base">
                              {text()}
                            </pre>
                          )}
                        </Show>
                        <Show when={job.status === "running"}>
                          <button
                            type="button"
                            disabled={stopping() === job.id}
                            onClick={() => void stop(job)}
                            class="mt-2 flex w-full items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                          >
                            {stopping() === job.id ? language.t("background.stopping") : language.t("background.stop")}
                          </button>
                        </Show>
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
