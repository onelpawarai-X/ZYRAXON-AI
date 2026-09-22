import { useNavigate } from "@solidjs/router"

const MARKETPLACE_URL = "https://agent-ecosystem-hub.lovable.app"

export function EcosystemAuthCallback() {
  const navigate = useNavigate()
  navigate("/ecosystem")
  return null
}

export function EcosystemItemRoute() {
  return (
    <div class="h-screen w-screen bg-v2-background-bg-base">
      <div class="flex h-full items-center justify-center">
        <iframe
          src={MARKETPLACE_URL}
          class="h-full w-full border-0"
          allow="clipboard-read; clipboard-write"
          title="ZYRAXON Marketplace"
        />
      </div>
    </div>
  )
}

export function EcosystemRoute() {
  return (
    <div class="h-screen w-screen bg-v2-background-bg-base">
      <div class="flex h-full items-center justify-center">
        <iframe
          src={MARKETPLACE_URL}
          class="h-full w-full border-0"
          allow="clipboard-read; clipboard-write"
          title="ZYRAXON Marketplace"
        />
      </div>
    </div>
  )
}

export function EcosystemButton() {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      onClick={() => navigate("/ecosystem")}
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
      <span>Ecosystem</span>
    </button>
  )
}
