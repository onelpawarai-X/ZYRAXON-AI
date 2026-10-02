// MCP Hub - the connect panel.
// Rendered by the Hub's plugin entry. Uses ZYRAXON's own UI primitives so it
// looks native, and keeps every piece of state inside this folder.

import { For, Show, createMemo, createSignal, onMount } from "solid-js"
import type { AppEntry } from "../catalog/seed"
import { allSeedApps, categories } from "../catalog/seed"
import { connectApp, describe, type ConnectionState, type McpRuntime } from "../lib/connect"
import { searchRegistry, supportsZeroSetup, type RegistryServer } from "../lib/registry"

export interface McpHubPanelProps {
  runtime: McpRuntime
  /** close the panel */
  onClose?: () => void
}

const authLabel: Record<string, string> = {
  none: "No sign-in needed",
  oauth: "Sign in with the browser",
  token: "Needs an access token",
  local: "Runs on this machine",
}

export function McpHubPanel(props: McpHubPanelProps) {
  const apps = allSeedApps()
  const cats = categories(apps)

  const [query, setQuery] = createSignal("")
  const [category, setCategory] = createSignal<string>("All")
  const [states, setStates] = createSignal<Record<string, ConnectionState>>({})
  const [busy, setBusy] = createSignal<string | null>(null)
  const [tokenFor, setTokenFor] = createSignal<AppEntry | null>(null)
  const [tokenValue, setTokenValue] = createSignal("")
  const [registryHits, setRegistryHits] = createSignal<RegistryServer[]>([])
  const [registryTerm, setRegistryTerm] = createSignal("")

  const filtered = createMemo(() =>
    apps.filter((a) => {
      if (category() !== "All" && a.category !== category()) return false
      const q = query().trim().toLowerCase()
      if (!q) return true
      return (a.name + " " + a.description + " " + a.category).toLowerCase().includes(q)
    }),
  )

  const setState = (id: string, s: ConnectionState) => setStates((prev) => ({ ...prev, [id]: s }))

  onMount(() => {
    // pick up anything already connected in this session
    const live = props.runtime.statuses()
    for (const app of apps) {
      if (live[app.id]?.status === "connected") {
        setState(app.id, { status: "connected", toolCount: 0 })
      }
    }
  })

  const onConnect = async (app: AppEntry) => {
    if (busy()) return
    if (app.kind === "token") {
      setTokenFor(app)
      return
    }
    setBusy(app.id)
    setState(app.id, { status: "connecting" })
    const result = await connectApp(props.runtime, app)
    setState(app.id, result)
    if (result.status === "needs_auth") window.open(result.authorizationUrl, "_blank", "noopener")
    setBusy(null)
  }

  const submitToken = async () => {
    const app = tokenFor()
    const token = tokenValue().trim()
    if (!app || !token) return
    setBusy(app.id)
    setState(app.id, { status: "connecting" })
    const result = await connectApp(props.runtime, app, token)
    setState(app.id, result)
    if (result.status === "needs_auth") window.open(result.authorizationUrl, "_blank", "noopener")
    setBusy(null)
    setTokenFor(null)
    setTokenValue("")
  }

  const runRegistrySearch = async () => {
    const term = registryTerm().trim()
    if (!term) return
    setBusy("registry")
    try {
      const hits = await searchRegistry(term, 30)
      setRegistryHits(hits)
    } catch {
      setRegistryHits([])
    }
    setBusy(null)
  }

  const stateFor = (id: string): ConnectionState => states()[id] ?? { status: "disconnected" }

  const connectedCount = createMemo(() => Object.values(states()).filter((s) => s.status === "connected").length)

  return (
    <div
      class="flex h-full w-full flex-col overflow-hidden bg-[var(--surface-stronger-non-alpha,#0b1020)] text-[var(--text-strong,#e6ebf5)]"
      style={{ "font-family": "var(--v2-font-family-sans, system-ui, sans-serif)" }}
    >
      {/* header */}
      <div class="flex items-center justify-between gap-4 border-b border-[var(--border-weak-base,#1e2740)] px-6 py-4">
        <div class="flex flex-col">
          <span class="text-[17px] font-[600] tracking-[-0.2px]">MCP Connect</span>
          <span class="text-[12px] text-[var(--text-weak,#8b95ad)]">
            {connectedCount()} connected · {apps.length} apps ready · thousands more in the registry
          </span>
        </div>
        <Show when={props.onClose}>
          <button
            type="button"
            aria-label="Close"
            class="rounded-md px-3 py-1.5 text-[13px] hover:bg-white/5"
            onClick={() => props.onClose?.()}
          >
            Close
          </button>
        </Show>
      </div>

      {/* search + filters */}
      <div class="flex flex-wrap items-center gap-2 px-6 py-3">
        <input
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search apps"
          class="h-8 min-w-[220px] flex-1 rounded-md border border-[var(--border-weak-base,#1e2740)] bg-transparent px-3 text-[13px] outline-none placeholder:text-[var(--text-weak,#8b95ad)]"
        />
        <div class="flex flex-wrap gap-1.5">
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-[12px] ${category() === "All" ? "bg-white/10" : "hover:bg-white/5"}`}
            onClick={() => setCategory("All")}
          >
            All
          </button>
          <For each={cats}>
            {(c) => (
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-[12px] ${category() === c ? "bg-white/10" : "hover:bg-white/5"}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* app grid */}
      <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <For each={filtered()}>
            {(app) => {
              const st = () => stateFor(app.id)
              return (
                <div class="flex flex-col gap-3 rounded-xl border border-[var(--border-weak-base,#1e2740)] bg-white/[0.02] p-4">
                  <div class="flex items-start gap-3">
                    <div
                      class="flex size-10 shrink-0 items-center justify-center rounded-lg text-[16px] font-[700] text-white"
                      style={{ background: app.color }}
                    >
                      {app.name.slice(0, 1)}
                    </div>
                    <div class="flex min-w-0 flex-col">
                      <span class="truncate text-[14px] font-[600]">{app.name}</span>
                      <span class="truncate text-[12px] text-[var(--text-weak,#8b95ad)]">{app.description}</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 text-[11px] text-[var(--text-weak,#8b95ad)]">
                    <span class="rounded-full bg-white/5 px-2 py-0.5">{app.category}</span>
                    <Show when={app.zeroSetup}>
                      <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">No setup</span>
                    </Show>
                  </div>

                  <div class="mt-auto flex items-center justify-between gap-2">
                    <span class="truncate text-[12px] text-[var(--text-weak,#8b95ad)]">{describe(st())}</span>
                    <Show
                      when={st().status !== "connected"}
                      fallback={<span class="text-[12px] font-[600] text-emerald-400">Connected</span>}
                    >
                      <button
                        type="button"
                        disabled={busy() === app.id}
                        class="rounded-md bg-white/10 px-3 py-1.5 text-[12px] font-[600] hover:bg-white/15 disabled:opacity-50"
                        onClick={() => onConnect(app)}
                      >
                        {busy() === app.id ? "Working…" : "Connect"}
                      </button>
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>
        </div>

        {/* registry search */}
        <div class="mt-8 flex flex-col gap-3 rounded-xl border border-[var(--border-weak-base,#1e2740)] p-4">
          <span class="text-[13px] font-[600]">Search the full MCP registry</span>
          <span class="text-[12px] text-[var(--text-weak,#8b95ad)]">
            18,000+ servers published by the community. Search, then add any of them.
          </span>
          <div class="flex gap-2">
            <input
              value={registryTerm()}
              onInput={(e) => setRegistryTerm(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && runRegistrySearch()}
              placeholder="e.g. youtube, postgres, slack"
              class="h-8 flex-1 rounded-md border border-[var(--border-weak-base,#1e2740)] bg-transparent px-3 text-[13px] outline-none"
            />
            <button
              type="button"
              class="rounded-md bg-white/10 px-3 py-1.5 text-[12px] font-[600] hover:bg-white/15"
              onClick={runRegistrySearch}
            >
              Search
            </button>
          </div>
          <For each={registryHits()}>
            {(hit) => (
              <div class="flex items-center justify-between gap-3 border-t border-[var(--border-weak-base,#1e2740)] pt-2">
                <div class="flex min-w-0 flex-col">
                  <span class="truncate text-[13px]">{hit.title ?? hit.name}</span>
                  <span class="truncate text-[11px] text-[var(--text-weak,#8b95ad)]">{hit.description ?? hit.name}</span>
                </div>
                <Show when={hit.remote}>
                  <span class="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300">Hosted</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* token dialog */}
      <Show when={tokenFor()}>
        {(app) => (
          <div class="absolute inset-0 flex items-center justify-center bg-black/60 p-6">
            <div class="w-full max-w-[460px] rounded-xl border border-[var(--border-weak-base,#1e2740)] bg-[#0d1424] p-5">
              <div class="mb-1 text-[15px] font-[600]">Connect {app().name}</div>
              <div class="mb-4 text-[12px] text-[var(--text-weak,#8b95ad)]">
                Paste an access token. Create one at{" "}
                <a class="underline" href={app().tokenUrl} target="_blank" rel="noopener">
                  {app().tokenUrl}
                </a>
                . It is stored locally and sent straight to the agent.
              </div>
              <input
                value={tokenValue()}
                onInput={(e) => setTokenValue(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && submitToken()}
                placeholder="Paste token"
                class="mb-4 h-9 w-full rounded-md border border-[var(--border-weak-base,#1e2740)] bg-transparent px-3 text-[13px] outline-none"
              />
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-md px-3 py-1.5 text-[13px] hover:bg-white/5"
                  onClick={() => {
                    setTokenFor(null)
                    setTokenValue("")
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded-md bg-white/10 px-3 py-1.5 text-[13px] font-[600] hover:bg-white/15"
                  onClick={submitToken}
                >
                  Connect
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}

export { authLabel, supportsZeroSetup }
