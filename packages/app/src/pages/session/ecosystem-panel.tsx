import { createSignal, Show } from "solid-js"

const MARKETPLACE_URL = "https://agent-ecosystem-hub.lovable.app"

export function EcosystemPanel() {
  const [tab, setTab] = createSignal<"marketplace" | "website">("marketplace")

  return (
    <div class="flex h-full flex-col overflow-hidden rounded-lg border border-v2-border-border-base bg-v2-background-bg-base">
      <div class="flex items-center gap-1 border-b border-v2-border-border-base px-3 py-2">
        <button
          type="button"
          class={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            tab() === "marketplace"
              ? "bg-v2-background-bg-base-inset text-v2-text-text-base"
              : "text-v2-text-text-muted hover:text-v2-text-text-base"
          }`}
          onClick={() => setTab("marketplace")}
        >
          Marketplace
        </button>
        <button
          type="button"
          class={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            tab() === "website"
              ? "bg-v2-background-bg-base-inset text-v2-text-text-base"
              : "text-v2-text-text-muted hover:text-v2-text-text-base"
          }`}
          onClick={() => setTab("website")}
        >
          Website
        </button>
      </div>

      <Show when={tab() === "marketplace"}>
        <iframe
          src={MARKETPLACE_URL}
          class="h-full w-full flex-1 border-0"
          allow="clipboard-read; clipboard-write"
          title="ZYRAXON Marketplace"
        />
      </Show>

      <Show when={tab() === "website"}>
        <iframe
          src={MARKETPLACE_URL}
          class="h-full w-full flex-1 border-0"
          allow="clipboard-read; clipboard-write"
          title="ZYRAXON Ecosystem Website"
        />
      </Show>
    </div>
  )
}
