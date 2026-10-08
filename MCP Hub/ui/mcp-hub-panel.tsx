// MCP Hub - the connect panel.
// Rendered by the Hub's plugin entry. Uses ZYRAXON's own UI primitives so it
// looks native, and keeps every piece of state inside this folder.

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { AppEntry } from "../catalog/seed"
import { allSeedApps, appIcon, browserApps, categories, docsByApp } from "../catalog/seed"
import { LANGUAGES, REDIRECT, catalogText, detectLanguage, guideFor, line } from "../catalog/guide"
import { connectApp, describe, type ConnectionState, type McpRuntime } from "../lib/connect"
import type { Resolution } from "../lib/resolve"
import { searchRegistry, supportsZeroSetup, type RegistryServer } from "../lib/registry"

export interface McpHubPanelProps {
  runtime: McpRuntime
  /** resolve an app to a real server when the catalog has no endpoint for it */
  resolve: (app: AppEntry) => Promise<Resolution>
  /** close the panel */
  onClose?: () => void
}

const authLabel: Record<string, string> = {
  none: "No sign-in needed",
  oauth: "Sign in with the browser",
  token: "Needs an access token",
  local: "Runs on this machine",
}

/**
 * Which language the guide is read in, remembered between openings.
 *
 * The guide is the document that takes the place of the vendor's own
 * documentation, so it is offered in the reader's language rather than only in
 * the panel's. The first choice comes from the browser; after that the saved
 * one wins, so a Bengali reader does not have to pick বাংলা again every time
 * a card is opened.
 */
const GUIDE_LANG_KEY = "zyraxon.mcp.guide.lang"

function readGuideLang(): string {
  try {
    const saved = localStorage.getItem(GUIDE_LANG_KEY)
    if (saved && LANGUAGES.some((lang) => lang.code === saved)) return saved
  } catch {
    // no storage in this context — fall through to the browser's own answer
  }
  return detectLanguage()
}

/**
 * Registry copy is only true while it stays true.
 *
 * These numbers used to be typed in by hand and drifted every time the registry moved:
 * the header said 9,580 while the box below it promised "18,000+", on the same screen.
 * Now the summary written by the build script decides, and if it is missing the caption
 * says so plainly instead of quoting a figure nobody checked.
 */
const REGISTRY_FALLBACK = "thousands more in the official registry"

function registryCaption(count: number | undefined): string {
  if (count === undefined) return REGISTRY_FALLBACK
  if (count === 0) return "registry cache empty — run scripts/build-registry-cache.mjs"
  return `${count.toLocaleString("en-US")} servers in the official registry`
}

/**
 * Track the app's colour scheme.
 *
 * The panel used to hardcode a near-black backdrop, so switching the app to light
 * mode left this screen dark — it looked like a different application entirely.
 * The theme lives on the document root as a data attribute, so reading it and
 * watching it for changes is enough to stay in step with the rest of the app.
 */
function useColorScheme() {
  const root = document.documentElement
  const [scheme, setScheme] = createSignal(root.dataset.colorScheme === "light" ? "light" : "dark")

  onMount(() => {
    const observer = new MutationObserver(() => {
      setScheme(root.dataset.colorScheme === "light" ? "light" : "dark")
    })
    observer.observe(root, { attributes: true, attributeFilter: ["data-color-scheme", "data-theme"] })
    onCleanup(() => observer.disconnect())
  })

  return scheme
}

/**
 * Second chance for a card icon.
 *
 * The catalog asks Simple Icons for a brand mark by slug, but that slug does not
 * exist for every app (Canva, Prisma) so the request 404s and the card shows an
 * empty box with no way to tell which app it was. Every entry also carries the
 * app's own domain, so the favicon is a reliable second try.
 */
function faviconUrl(app: AppEntry) {
  if (!app.iconDomain) return ""
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(app.iconDomain)}&sz=128`
}

/**
 * Connection state shared by every mount of the panel. The MCP servers themselves live
 * in the server process, so closing this panel or navigating to another route must not
 * make a still-connected app look disconnected the moment it comes back.
 */
const persistedStates: Record<string, ConnectionState> = {}

/** fast enough that a card updates the moment the server settles */
const LIVE_POLL_MS = 1500
/** nothing connected yet, so there is nothing worth watching */
const IDLE_POLL_MS = 10_000

/**
 * The three ways an app can be connected, in the order the user meets them.
 *
 * Mixing them in one list was the mistake: a card that needs a browser, a card
 * that needs a pasted token and a card that needs nothing at all look identical,
 * so nothing explained why one worked and the next did not.
 */
const FLOW_BROWSER = "oauth"
const FLOW_TOKEN = "token"
const FLOW_DIRECT = "direct"

function flowOf(app: AppEntry): string {
  if (app.kind === "local") return FLOW_DIRECT
  if (app.kind === "oauth") return FLOW_BROWSER
  if (app.kind === "token") return FLOW_TOKEN
  return FLOW_DIRECT
}

const FLOW_TITLE: Record<string, string> = {
  [FLOW_BROWSER]: "Sign in with your browser",
  [FLOW_TOKEN]: "Needs an access token",
  [FLOW_DIRECT]: "Connect instantly",
}
const FLOW_HINT: Record<string, string> = {
  [FLOW_BROWSER]: "Opens Chrome, you press Allow, and it connects itself.",
  [FLOW_TOKEN]: "Paste a token once and it connects itself.",
  [FLOW_DIRECT]: "No sign-in at all. One click and it is live.",
}
const FLOW_ORDER = [FLOW_BROWSER, FLOW_TOKEN, FLOW_DIRECT]

export function McpHubPanel(props: McpHubPanelProps) {
  const apps = allSeedApps()
  const cats = categories(apps)
  const scheme = useColorScheme()
  const dark = () => scheme() === "dark"

  /**
   * Surfaces that have to be opaque cannot be expressed with Tailwind's white/xx
   * overlays, because those vanish against a light background. They follow the
   * scheme explicitly instead.
   */
  const surface = createMemo(() => (dark() ? "rgba(10,10,11,0.92)" : "rgba(250,250,250,0.94)"))
  const raised = createMemo(() => (dark() ? "#18181b" : "#ffffff"))
  const overlayTint = createMemo(() => (dark() ? "rgba(0,0,0,0.72)" : "rgba(24,24,27,0.42)"))
  // Neutral fills, not white/black, so the same class reads correctly in both themes.
  const fill = createMemo(() => (dark() ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)"))
  const fillHover = createMemo(() => (dark() ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.10)"))
  const cardFill = createMemo(() => (dark() ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)"))
  // Zinc-scale borders. The previous values were navy (#1e2740 / #2a3550), which is what
  // made the whole panel read as blue in light mode even though every surface was neutral.
  const border = createMemo(() => (dark() ? "#2a2a2e" : "#e4e4e7"))
  const borderStrong = createMemo(() => (dark() ? "#3f3f46" : "#d4d4d8"))
  const textWeak = createMemo(() => (dark() ? "#a1a1aa" : "#71717a"))
  const accent = createMemo(() => (dark() ? "#e4e4e7" : "#18181b"))

  const [query, setQuery] = createSignal("")
  const [category, setCategory] = createSignal<string>("All")

  /**
   * Browser used for OAuth sign-in and for links the agent opens. Empty means the
   * server discovers installed browsers on its own. Kept light: the value rides in
   * one config key the server already reads, so nothing here reaches into the app.
   */
  const [browserPath, setBrowserPath] = createSignal("")
  const [browserState, setBrowserState] = createSignal<"idle" | "saving" | "saved">("idle")
  let browserFileInput: HTMLInputElement | undefined

  onMount(() => {
    props.runtime
      .getBrowserPath()
      .then((value) => setBrowserPath(value ?? ""))
      .catch(() => {})
  })

  function pickBrowserFile() {
    browserFileInput?.click()
  }

  function onBrowserFilePicked(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    const legacy = file as (File & { path?: string }) | undefined
    const web = window as unknown as { webUtils?: { getPathForFile?: (f: File) => string } }
    const path = (legacy?.path || (file ? web.webUtils?.getPathForFile?.(file) : "") || "").trim()
    if (path) setBrowserPath(path)
  }

  async function saveBrowserPath() {
    const path = browserPath().trim()
    setBrowserState("saving")
    try {
      await props.runtime.setBrowserPath(path)
      setBrowserState("saved")
      window.setTimeout(() => {
        if (browserState() === "saved") setBrowserState("idle")
      }, 1600)
    } catch {
      setBrowserState("idle")
    }
  }
  /**
   * Connection state outlives this panel. The servers themselves live in the server
   * process, so navigating to another route and coming back used to wipe the local
   * signal and show every app as disconnected while they were in fact still connected.
   * A module-level cache is shared by every mount, and the poll fills it again anyway.
   */
  const [states, setStates] = createSignal<Record<string, ConnectionState>>(persistedStates)
  createEffect(() => setStates((prev) => Object.assign(persistedStates, prev)))
  const [busy, setBusy] = createSignal<string | null>(null)
  const [busySince, setBusySince] = createSignal<number>(0)
  const [tick, setTick] = createSignal(0)
  const [tokenFor, setTokenFor] = createSignal<AppEntry | null>(null)
  const [detailsFor, setDetailsFor] = createSignal<AppEntry | null>(null)
  const [tokenValue, setTokenValue] = createSignal("")
  /**
   * The client credentials a console-issued app needs, keyed by app.
   *
   * These live here rather than in the catalog because they belong to the person who owns
   * the vendor account, not to the app list: one user's Slack client ID is nobody else's.
   * Holding them for the session is enough — the server keeps the registration once a
   * handshake completes.
   */
  const [clientIds, setClientIds] = createSignal<Record<string, { id: string; secret?: string }>>({})
  /** the app whose sign-in link is being built, so the button can say so */
  const [generating, setGenerating] = createSignal<string | null>(null)
  /** the sign-in link produced by Generate, shown with copy and open */
  const [consentUrl, setConsentUrl] = createSignal<string | null>(null)
  const [registryHits, setRegistryHits] = createSignal<RegistryServer[]>([])
  const [registryTerm, setRegistryTerm] = createSignal("")
  /** which registry server each app resolved to */
  const [resolved, setResolved] = createSignal<Record<string, string>>({})

  /**
   * Whether one-click sign-in is actually possible for an app, checked against the live
   * server instead of the catalog.
   *
   * The catalog used to carry a hand-set `zeroSetup` flag, and a live pass over every
   * OAuth app showed 29 of them redirect the sign-in to a different host than the
   * endpoint, with 9 offering no dynamic client registration at all. A badge that says
   * "No setup" for those apps is a promise the connector cannot keep, so the badge is
   * now only shown once the discovery chain has actually answered for that endpoint.
   */
  const [oneClick, setOneClick] = createSignal<Record<string, boolean>>({})

  /**
   * How many servers the registry actually holds, read from the summary written next to
   * the cache.
   *
   * Loaded lazily because the panel must paint before it touches the filesystem, and the
   * count is only ever decoration. It used to be typed into this markup twice — once as
   * 9,580 and once as "18,000+", on the same screen.
   */
  const [registryCount, setRegistryCount] = createSignal<number | undefined>(undefined)

  /**
   * The language a Details card reads its guide in.
   *
   * Chosen once and remembered, so the guide a person starts in is the guide
   * they keep. The translations are already in the bundle, so changing it is
   * instant — there is no request to wait for and nothing to get wrong offline.
   */
  const [guideLang, setGuideLang] = createSignal(readGuideLang())

  const changeGuideLang = (code: string) => {
    setGuideLang(code)
    try {
      localStorage.setItem(GUIDE_LANG_KEY, code)
    } catch {
      // no storage here — the choice still applies to this opening
    }
  }

  onMount(() => {
    let stopped = false

    void (async () => {
      const { registryCount: count } = await import("../catalog/registry-cache")
      if (!stopped) setRegistryCount(count())
    })()

    onCleanup(() => {
      stopped = true
    })
  })

  onMount(() => {
    let stopped = false
    const controller = new AbortController()

    void (async () => {
      const checked: Record<string, boolean> = {}
      // Sequential on purpose: firing 53 discovery chains at once looks like an attack
      // and gets the whole panel rate-limited by the servers it is asking.
      for (const app of browserApps) {
        if (stopped || !app.url) continue
        checked[app.id] = await supportsZeroSetup(app.url).catch(() => false)
        if (stopped) return
        setOneClick((prev) => ({ ...prev, ...checked }))
      }
    })()

    onCleanup(() => {
      stopped = true
      controller.abort()
    })
  })

  const filtered = createMemo(() =>
    apps.filter((a) => {
      if (category() !== "All" && a.category !== category()) return false
      const q = query().trim().toLowerCase()
      if (!q) return true
      return (a.name + " " + a.description + " " + a.category).toLowerCase().includes(q)
    }),
  )

  /** the filtered apps grouped into the three connect flows, in a fixed order */
  const sections = createMemo(() =>
    FLOW_ORDER.map((flow) => ({
      flow,
      apps: filtered()
        .filter((app) => flowOf(app) === flow)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((section) => section.apps.length > 0),
  )

  const setState = (id: string, s: ConnectionState) => setStates((prev) => ({ ...prev, [id]: s }))

  /** the catalog app being connected right now, if any */
  const busyApp = createMemo(() => {
    const id = busy()
    // "registry" is the registry search box, not an app, so it never takes over the body.
    if (!id || id === "registry") return undefined
    return apps.find((a) => a.id === id)
  })

  /**
   * Progress the user can trust.
   *
   * There is no honest total here, so nothing is faked. The first stretch is real
   * work with a known end — resolving the server, finding its OAuth endpoints and
   * opening the consent page — and it is worth 70%. After that the wait belongs to
   * the person reading the consent page, so it creeps toward 95% and stops rather
   * than continuing to promise progress that only the user can make.
   */
  const EXPECTED_WORK_MS = 4_000
  const WAIT_CEILING_MS = 30_000

  const progress = createMemo(() => {
    void tick()
    const elapsed = Math.max(0, Date.now() - busySince())
    if (elapsed <= 0) return { percent: 0, label: "Starting…", elapsed: 0 }

    const workDone = Math.min(1, elapsed / EXPECTED_WORK_MS)
    const state = busyApp() ? states()[busyApp()!.id] : undefined
    const waitingOnUser = state?.status === "needs_auth"

    if (!waitingOnUser && workDone < 1) {
      return { percent: Math.round(workDone * 70), label: "Reaching the server", elapsed: Math.floor(elapsed / 1000) }
    }

    const wait = elapsed - EXPECTED_WORK_MS
    const creep = Math.min(1, wait / WAIT_CEILING_MS)
    return {
      percent: Math.round(70 + creep * 25),
      label: waitingOnUser ? "Waiting for you to approve" : "Finishing up",
      elapsed: Math.floor(elapsed / 1000),
    }
  })

  // Repaint the elapsed counter. A one-second interval is enough for a number that
  // only shows whole seconds, and it stops the moment nothing is connecting.
  createEffect(() => {
    if (!busy()) return
    const id = setInterval(() => setTick((n) => n + 1), 250)
    onCleanup(() => clearInterval(id))
  })

  const cancel = (id: string) => {
    busyIds.delete(id)
    setBusy(null)
    setBusySince(0)
    setState(id, { status: "disconnected" })
  }

  /** app ids with a connect in flight, so the status poll leaves those cards alone */
  let busyIds = new Set<string>()

  /**
   * Keep every card honest while the panel is open.
   *
   * A card used to freeze whatever it was last told, so a server that finished
   * connecting a second later kept saying "Connecting…", and the only way to see
   * the truth was to close the panel and open it again. The server owns the
   * transport, so the server's status is the only thing worth showing.
   *
   * Cards the user is actively working on are left alone, so this poll cannot
   * fight an in-flight connect with its own intermediate state.
   */

  onMount(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (stopped) return
      let connected = 0
      try {
        const live = await props.runtime.statuses()
        if (stopped) return
        connected = Object.values(live).filter((entry) => entry.status === "connected").length
        if (!busyIds.size)
          setStates((prev) => {
            const next = { ...prev }
            let changed = false
            for (const app of apps) {
              const entry = live[app.id]
              const current = next[app.id]
              const write = (state: ConnectionState) => {
                if (current?.status === state.status && JSON.stringify(current) === JSON.stringify(state)) return
                next[app.id] = state
                changed = true
              }

              // The server is the only source of truth, in BOTH directions. This
              // poll used to only ever upgrade a card to connected and ignored
              // failed/disabled entirely, so a server that dropped kept claiming to
              // be connected until the panel was closed and reopened.
              if (!entry || entry.status === "disabled") {
                if (current?.status === "connected") write({ status: "disconnected" })
                continue
              }
              if (entry.status === "connected") {
                // Keep an existing tool count rather than flashing 0 every tick.
                write(
                  current?.status === "connected"
                    ? { status: "connected", toolCount: current.toolCount }
                    : { status: "connected", toolCount: 0 },
                )
                continue
              }
              if (entry.status === "failed") {
                write({ status: "failed", error: entry.error ?? "the server refused the connection" })
                continue
              }
              // needs_auth / needs_client_registration: the server is up but not
              // authorized. Only downgrade a card that wrongly claimed success.
              if (current?.status === "connected") write({ status: "disconnected" })
            }
            return changed ? next : prev
          })
      } catch {
        /* the server may be restarting; try again on the next tick */
      }
      if (stopped) return
      // Nothing is connected yet, so there is nothing to watch for. Ease off
      // rather than polling a local server sixty times a minute for no reason.
      timer = setTimeout(tick, connected ? LIVE_POLL_MS : IDLE_POLL_MS)
    }

    void tick()
    onCleanup(() => {
      stopped = true
      if (timer) clearTimeout(timer)
    })
  })

  /**
   * Connect an app.
   *
   * Apps with a first-party endpoint go straight to OAuth. Apps without one are
   * resolved against the registry first, so an app like Facebook or Gmail still
   * connects instead of showing a card that cannot work.
   *
   * No browser is opened from here. The server opens it, in the real profile
   * that already carries the app's session, so the sign-in that follows lands
   * straight in ZYRAXON's own data.
   */
  const onConnect = async (app: AppEntry) => {
    if (busy()) return
    busyIds.add(app.id)
    setBusy(app.id)
    setBusySince(Date.now())
    setState(app.id, { status: "connecting" })

    try {
      // 1. find the real endpoint when the catalog does not know one
      let resolved = app
      if (!app.url && app.kind !== "local") {
        const hit = await props.resolve(app)
        if (!hit.url) {
          setState(app.id, {
            status: "failed",
            error: hit.reason ?? "no connectable server found",
          })
          return
        }
        resolved = { ...app, url: hit.url, zeroSetup: hit.server ? undefined : app.zeroSetup }
        setResolved((prev) => ({ ...prev, [app.id]: hit.server?.name ?? hit.url! }))
      }

      // 2. a token app needs the token before anything else
      if (app.kind === "token") {
        setTokenFor(resolved)
        return
      }

      // 3. OAuth apps. This awaits the whole handshake, including the Allow click.
      setState(app.id, await connectApp(props.runtime, resolved, { onProgress: (s) => setState(app.id, s) }))
    } finally {
      busyIds.delete(app.id)
      setBusy(null)
      setBusySince(0)
    }
  }

/**
       * Detach an app.
       *
       * The runtime owns the transport, so the panel asks it to drop the server and then
       * clears the card. Leaving the local signal alone was what made a disconnected
       * server look connected until the panel was reopened.
       *
       * `forgetCredentials` is what the button means. Without it the stored tokens and
       * the client registration stay on disk and the next start quietly signs the app
       * back in, so a user who pressed Disconnect finds the account reattached with no
       * explanation.
       */
      const onDisconnect = async (app: AppEntry) => {
        if (busy()) return
        setBusy(app.id)
        setBusySince(Date.now())
        setState(app.id, { status: "disconnected" })
        try {
          await props.runtime.disconnect(app.id, { forgetCredentials: true })
        } catch {
          // The card is already marked disconnected and the server is gone from the
          // runtime's view either way; a failure here has nothing left to report.
        } finally {
          busyIds.delete(app.id)
          setBusy(null)
          setBusySince(0)
        }
      }

  const submitToken = async () => {
    const app = tokenFor()
    const token = tokenValue().trim()
    if (!app || !token) return
    busyIds.add(app.id)
    setBusy(app.id)
    setBusySince(Date.now())
    setState(app.id, { status: "connecting" })
    try {
      setState(app.id, await connectApp(props.runtime, app, { token, onProgress: (s) => setState(app.id, s) }))
    } finally {
      busyIds.delete(app.id)
      setBusy(null)
      setTokenFor(null)
      setTokenValue("")
    }
  }

  /**
   * Connect an app that needs a client its vendor's console issued.
   *
   * The client is written into the server's config as part of the connect, so the
   * handshake has something to ask for consent with. Without it the server tries to
   * register one itself, which the publishers behind these consoles refuse — so this
   * field is the whole difference between them working and not.
   */
  const submitClientId = async () => {
    const app = detailsFor()
    const credentials = app ? clientIds()[app.id] : undefined
    if (!app || !credentials?.id?.trim()) return
    busyIds.add(app.id)
    setBusy(app.id)
    setBusySince(Date.now())
    setState(app.id, { status: "connecting" })
    try {
      setState(
        app.id,
        await connectApp(props.runtime, app, {
          clientId: credentials.id.trim(),
          clientSecret: credentials.secret?.trim(),
          onProgress: (s) => setState(app.id, s),
        }),
      )
      if (states()[app.id]?.status === "connected") setDetailsFor(null)
    } finally {
      busyIds.delete(app.id)
      setBusy(null)
      setBusySince(0)
    }
  }

  /**
   * Build the sign-in link without opening it.
   *
   * Discovery, client registration and PKCE all happen on the server, so what comes back
   * is a complete consent URL. Handing it over instead of opening it is the point: the
   * account is often already signed in somewhere other than the default browser, and
   * approving there still delivers the reply to ZYRAXON's loopback. Opening it is offered
   * right beside the link for the other case.
   */
  const generateConsentUrl = async (app: AppEntry) => {
    setGenerating(app.id)
    setConsentUrl(null)
    try {
      const url = await props.runtime.startAuth(app.id)
      setConsentUrl(url || null)
    } catch {
      setConsentUrl(null)
    } finally {
      setGenerating(null)
    }
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

  const connectedCount = createMemo(() => {
    const all: ConnectionState[] = Object.values(states())
    return all.filter((s) => s.status === "connected").length
  })

  return (
    // The critical layout and the backdrop are inline rather than utilities. This
    // folder sits outside packages/, so its arbitrary-value Tailwind classes are
    // easy to drop silently, and a panel that renders with no background and no
    // full-screen sizing lets the home page show straight through it. Inline
    // styles cannot fail that way.
    //
    // pointer-events has to be opted into because the dialog layer sets
    // pointer-events:none so clicks fall through to the overlay that closes it.
    <div
      style={{
        position: "fixed",
        inset: "0",
        "z-index": "2147483000",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        padding: "clamp(12px, 3vh, 40px) clamp(12px, 4vw, 56px)",
        background: overlayTint(),
        "pointer-events": "auto",
        "font-family": "var(--v2-font-family-sans, system-ui, sans-serif)",
        "--mcp-border": border(),
        "--mcp-border-strong": borderStrong(),
        "--mcp-text-weak": textWeak(),
      }}
    >
     <div
      style={{
        position: "relative",
        display: "flex",
        "flex-direction": "column",
        width: "100%",
        "max-width": "1080px",
        height: "100%",
        "max-height": "760px",
        overflow: "hidden",
        "border-radius": "16px",
        border: `1px solid ${border()}`,
        background: surface(),
        color: dark() ? "#fafafa" : "#18181b",
        "box-shadow": dark() ? "0 32px 80px rgba(0,0,0,0.6)" : "0 24px 64px rgba(0,0,0,0.18)",
      }}
    >
      {/* header */}
      <div class="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--mcp-border)] px-6 py-4">
        <div class="flex flex-col">
          <span class="text-[17px] font-[600] tracking-[-0.2px]">MCP Connect</span>
          <span class="text-[12px] text-[var(--text-weak,#8b95ad)]">
            {connectedCount()} connected · {apps.length} MCP servers/apps ready · {registryCaption(registryCount())}
          </span>
        </div>
        <Show when={props.onClose}>
          {/* The panel is its own centred box with a margin all round, so this no
              longer shares space with the window's own titlebar close button and
              needs no compensating margin. */}
          <button
            type="button"
            aria-label="Close MCP Connect"
            class="shrink-0 rounded-md border border-[var(--mcp-border-strong)] px-4 py-1.5 text-[13px] font-[600] transition-colors"
            style={{ background: fill() }}
            onMouseEnter={(e) => (e.currentTarget.style.background = fillHover())}
            onMouseLeave={(e) => (e.currentTarget.style.background = fill())}
            onClick={() => props.onClose?.()}
          >
            Cancel
          </button>
        </Show>
      </div>

      {/* browser for sign-in */}
      <div class="flex items-center gap-2 border-b border-[var(--mcp-border)] px-6 py-3">
        <input
          ref={browserFileInput}
          type="file"
          accept=".exe,.app,.bin,application/octet-stream"
          class="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={onBrowserFilePicked}
        />
        <span class="shrink-0 text-[12px] text-[var(--text-weak,#8b95ad)]">Sign-in browser</span>
        <input
          value={browserPath()}
          onInput={(e) => {
            setBrowserPath(e.currentTarget.value)
            if (browserState() === "saved") setBrowserState("idle")
          }}
          placeholder="C:\Program Files\Google\Chrome\Application\chrome.exe"
          spellcheck={false}
          class="h-8 min-w-[240px] flex-1 rounded-md border border-[var(--mcp-border)] bg-transparent px-3 font-mono text-[12px] outline-none placeholder:text-[var(--mcp-text-weak)]"
        />
        <button
          type="button"
          onClick={pickBrowserFile}
          class="h-8 shrink-0 rounded-md border border-[var(--mcp-border-strong)] px-3 text-[12px] font-[600] transition-colors"
          style={{ background: fill() }}
          onMouseEnter={(e) => (e.currentTarget.style.background = fillHover())}
          onMouseLeave={(e) => (e.currentTarget.style.background = fill())}
        >
          Browse…
        </button>
        <button
          type="button"
          onClick={saveBrowserPath}
          disabled={browserState() === "saving"}
          class="h-8 shrink-0 rounded-md border px-3 text-[12px] font-[600] transition-colors"
          style={{
            background: browserState() === "saved" ? "transparent" : fill(),
            color: browserState() === "saved" ? "var(--accent,#4ade80)" : undefined,
            "border-color": browserState() === "saved" ? "var(--accent,#4ade80)" : "var(--mcp-border-strong)",
          }}
        >
          {browserState() === "saving" ? "Saving…" : browserState() === "saved" ? "Saved" : "Save"}
        </button>
        <Show when={browserPath().trim().length > 0}>
          <button
            type="button"
            onClick={() => setBrowserPath("")}
            class="h-8 shrink-0 rounded-md border border-[var(--mcp-border)] px-2 text-[12px] text-[var(--text-weak,#8b95ad)] transition-colors"
            title="Use the browser ZYRAXON finds on its own"
          >
            Clear
          </button>
        </Show>
      </div>

      {/* search + filters */}
      <div class="flex flex-wrap items-center gap-2 px-6 py-3">
        <input
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search apps"
          class="h-8 min-w-[220px] flex-1 rounded-md border border-[var(--mcp-border)] bg-transparent px-3 text-[13px] outline-none placeholder:text-[var(--mcp-text-weak)]"
        />
        <div class="flex flex-wrap gap-1.5">
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-[12px] ${category() === "All" ? "font-[600]" : ""}`}
            style={{ background: category() === "All" ? fill() : "transparent" }}
            onClick={() => setCategory("All")}
          >
            All
          </button>
          <For each={cats}>
            {(c) => (
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-[12px] ${category() === c ? "font-[600]" : ""}`}
                style={{ background: category() === c ? fill() : "transparent" }}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Connecting takes over the body. Sitting on the grid meant a slow or hung
          handshake looked like a dead button, and the user had no way to tell
          whether anything was happening at all. */}
      <Show when={busyApp()}>
        {(app) => (
          <div
            class="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 text-center"
            style={{ background: dark() ? "#09090b" : "#fafafa" }}
          >
            {/* A real spinner rather than a pulsing icon: the icon stops moving the
                moment it fails to load, which read as a frozen screen. */}
            <div class="relative flex size-20 items-center justify-center">
              <div
                class="absolute inset-0 rounded-full border-2 opacity-20"
                style={{ "border-color": accent() }}
              />
              <div
                class="absolute inset-0 animate-spin rounded-full border-2 border-transparent"
                style={{
                  "border-top-color": accent(),
                  animation: "spin 0.9s linear infinite",
                }}
              />
              <div class="flex size-11 items-center justify-center overflow-hidden rounded-xl" style={{ background: fill() }}>
                <img
                  src={appIcon(app()) || faviconUrl(app())}
                  width={40}
                  height={40}
                  alt=""
                  class="size-9 object-contain"
                  onError={(e) => {
                    const img = e.currentTarget
                    const fallback = faviconUrl(app())
                    if (!fallback || img.dataset.fellBack === "1") {
                      img.style.visibility = "hidden"
                      return
                    }
                    img.dataset.fellBack = "1"
                    img.src = fallback
                  }}
                />
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <span class="text-[16px] font-[600]">Connecting {app().name}</span>
              <span class="text-[13px] text-[var(--mcp-text-weak)]">{describe(stateFor(app().id))}</span>
            </div>

            {/* One honest line per auth kind, because the user is looking at a
                screen and needs to know where to act. */}
            <Show when={app().kind === "oauth"}>
              <span class="max-w-[420px] text-[12px] text-[var(--mcp-text-weak)]">
                A sign-in page is opening in Chrome. Approve it there and this screen updates by itself.
              </span>
            </Show>
            <Show when={app().kind === "token"}>
              <span class="max-w-[420px] text-[12px] text-[var(--mcp-text-weak)]">
                Checking your access token against the server.
              </span>
            </Show>

            <div
              class="h-1 w-56 overflow-hidden rounded-full"
              style={{ background: fill() }}
              role="progressbar"
              aria-label={`Connecting ${app().name}`}
              aria-valuenow={progress().percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {/* The bar used to sit at a third forever, which looked like progress
                  and never was. The width now tracks the actual phase: reaching the
                  consent page is real work that completes, while the wait for the
                  user to press Allow is genuinely unbounded and creeps toward the
                  limit instead of pretending to be a percentage of a known total. */}
              <div
                class="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${progress().percent}%`, background: accent() }}
              />
            </div>

            <div class="flex items-center gap-2 text-[12px] text-[var(--mcp-text-weak)]">
              <span class="font-[600] tabular-nums" style={{ color: accent() }}>
                {progress().percent}%
              </span>
              <span>·</span>
              <span>{progress().label}</span>
              <span>·</span>
              <span class="tabular-nums">{progress().elapsed}s</span>
            </div>

            {/* A wait the user is in control of needs a way out. Without this the
                only escape was closing the whole panel and losing every card. */}
            <button
              type="button"
              class="rounded-md border border-[var(--mcp-border-strong)] px-3 py-1.5 text-[12px] font-[600]"
              style={{ background: fill() }}
              onMouseEnter={(e) => (e.currentTarget.style.background = fillHover())}
              onMouseLeave={(e) => (e.currentTarget.style.background = fill())}
              onClick={() => cancel(app().id)}
            >
              Cancel this connection
            </button>
          </div>
        )}
      </Show>

      {/* app grid, split by how each app connects */}
      <Show when={!busyApp()}>
        <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        <div class="flex flex-col gap-8">
          <For each={sections()}>
            {(section) => (
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-0.5">
                  <span class="text-[14px] font-[600]">{FLOW_TITLE[section.flow]}</span>
                  <span class="text-[12px] text-[var(--mcp-text-weak)]">{FLOW_HINT[section.flow]}</span>
                </div>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <For each={section.apps}>
            {(app) => {
              const st = () => stateFor(app.id)
              return (
                <div class="flex flex-col gap-3 rounded-xl border border-[var(--mcp-border)] p-4" style={{ background: cardFill() }}>
                  <div class="flex items-start gap-3">
                    {/* Several brand marks (Vercel, Notion, X) are solid black, so
                        they need a light plate in dark mode to be visible at all. */}
                    <div
                      class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                      style={{ background: fill() }}
                    >
                      {/* Show when no icon source exists at all (the bundled local
                          servers) or when every source failed, so a card is never
                          an empty box. */}
                      <Show
                        when={appIcon(app) !== "" || faviconUrl(app) !== ""}
                        fallback={
                          <span class="text-[15px] font-[700]" style={{ color: app.color }}>
                            {app.name.slice(0, 1).toUpperCase()}
                          </span>
                        }
                      >
                        <img
                          src={appIcon(app)}
                          width={40}
                          height={40}
                          alt=""
                          class="size-10 object-contain"
                          loading="lazy"
                          onError={(e) => {
                            const img = e.currentTarget
                            const fallback = faviconUrl(app)
                            if (!fallback || img.dataset.fellBack === "1") {
                              img.style.display = "none"
                              return
                            }
                            img.dataset.fellBack = "1"
                            img.src = fallback
                          }}
                        />
                      </Show>
                    </div>
                    <div class="flex min-w-0 flex-col">
                      <span class="truncate text-[14px] font-[600]">{app.name}</span>
                      <span class="truncate text-[12px] text-[var(--mcp-text-weak)]">{app.description}</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 text-[11px] text-[var(--mcp-text-weak)]">
                    <span class="rounded-full px-2 py-0.5" style={{ background: fill() }}>
                      {app.category}
                    </span>
                    <Show when={oneClick()[app.id] === true}>
                      <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-600 dark:text-emerald-300">
                        One click
                      </span>
                    </Show>
                    <Show when={app.kind === "oauth" && oneClick()[app.id] === false}>
                      {/* Saying this up front is the whole point. These apps hand the
                          sign-in to another host and expect their own client id, so the
                          card would otherwise look broken rather than explained. */}
                      <span
                        class="rounded-full px-2 py-0.5"
                        style={{ background: fill() }}
                        title="Sign-in happens on another host, so it may ask you to paste an app id"
                      >
                        Extra step
                      </span>
                    </Show>
                    {/* Say who actually runs the endpoint. More than half the catalog
                        is hosted by a third party, and a card that hides that reads as
                        a first-party integration when it is not. */}
                    <Show when={app.via}>
                      <span
                        class="truncate rounded-full px-2 py-0.5"
                        style={{ background: fill() }}
                        title={`Hosted by ${app.via}`}
                      >
                        via {app.via}
                      </span>
                    </Show>
                  </div>

                  <Show when={resolved()[app.id]}>
                    <span class="truncate text-[11px] text-[var(--mcp-text-weak)]">
                      via {resolved()[app.id]}
                    </span>
                  </Show>

                  <div class="mt-auto flex items-center justify-between gap-2">
                    <span class="truncate text-[12px] text-[var(--mcp-text-weak)]">{describe(st())}</span>
                    <Show
                      when={st().status !== "connected"}
                      fallback={
                        <div class="flex shrink-0 items-center gap-1.5">
                          {/* Being able to detach an account matters as much as being
                              able to attach one: a server left connected keeps its
                              tools callable by the agent forever. */}
                          <button
                            type="button"
                            aria-label={`Disconnect ${app.name}`}
                            class="rounded-md border border-[var(--mcp-border-strong)] px-2.5 py-1.5 text-[12px] font-[600]"
                            style={{ background: fill() }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = fillHover())}
                            onMouseLeave={(e) => (e.currentTarget.style.background = fill())}
                            onClick={() => onDisconnect(app)}
                          >
                            Disconnect
                          </button>
                        </div>
                      }
                    >
                      <div class="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Details for ${app.name}`}
                          title={`What ${app.name} can do, and what it needs`}
                          class="rounded-md border border-[var(--mcp-border)] px-2.5 py-1.5 text-[12px] font-[600]"
                          style={{ background: fill() }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = fillHover())}
                          onMouseLeave={(e) => (e.currentTarget.style.background = fill())}
                          onClick={() => setDetailsFor(app)}
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          disabled={busy() === app.id}
                          class="rounded-md px-3 py-1.5 text-[12px] font-[600] disabled:opacity-50"
                          style={{ background: fill() }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = fillHover())}
                          onMouseLeave={(e) => (e.currentTarget.style.background = fill())}
                          onClick={() => onConnect(app)}
                        >
                          {busy() === app.id ? "Working…" : "Connect"}
                        </button>
                      </div>
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>
                </div>
              </div>
            )}
          </For>

          {/* registry search */}
          <div class="flex flex-col gap-3 rounded-xl border border-[var(--mcp-border)] p-4">
          <span class="text-[13px] font-[600]">Search the full MCP registry</span>
          <span class="text-[12px] text-[var(--mcp-text-weak)]">
            {registryCaption(registryCount())}. Search, then add any of them.
          </span>
          <div class="flex gap-2">
            <input
              value={registryTerm()}
              onInput={(e) => setRegistryTerm(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && runRegistrySearch()}
              placeholder="e.g. youtube, postgres, slack"
              class="h-8 flex-1 rounded-md border border-[var(--mcp-border)] bg-transparent px-3 text-[13px] outline-none"
            />
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-[13px]"
              style={{ background: fill() }}
              onClick={runRegistrySearch}
            >
              Search
            </button>
          </div>
          <For each={registryHits()}>
            {(hit) => (
              <div class="flex items-center justify-between gap-3 border-t border-[var(--mcp-border)] pt-2">
                <div class="flex min-w-0 flex-col">
                  <span class="truncate text-[13px]">{hit.title ?? hit.name}</span>
                  <span class="truncate text-[11px] text-[var(--mcp-text-weak)]">{hit.description ?? hit.name}</span>
                </div>
                <Show when={hit.remote}>
                  <span class="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300">Hosted</span>
                </Show>
              </div>
            )}
          </For>
        </div>
        </div>
        </div>
      </Show>


      {/* token dialog */}
      <Show when={tokenFor()}>
        {(app) => (
          <div
          style={{
            position: "fixed",
            inset: "0",
            "z-index": "2147483100",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            // Nearly opaque, but not quite: the grid has to stay faintly visible
            // behind it, otherwise the dialog reads as a stray dropdown floating
            // on a black screen rather than a modal on top of this panel.
            background: overlayTint(),
            padding: "1.5rem",
            "pointer-events": "auto",
          }}
        >
            <div
              class="w-full max-w-[460px] rounded-xl border border-[var(--mcp-border-strong)] p-5"
              style={{ background: raised(), "box-shadow": "0 24px 64px rgba(0,0,0,0.35)" }}
            >
              <div class="mb-1 text-[15px] font-[600]">Connect {app().name}</div>
              <div class="mb-4 text-[12px] text-[var(--mcp-text-weak)]">
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
                class="mb-4 h-9 w-full rounded-md border border-[var(--mcp-border)] bg-transparent px-3 text-[13px] outline-none"
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
                  class="rounded-md px-3 py-1.5 text-[13px] font-[600] disabled:opacity-50"
                  disabled={!tokenValue().trim()}
                  style={{ background: fill() }}
                  onClick={submitToken}
                >
                  Connect
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={detailsFor()}>
        {(app) => (
          <div
            style={{
              position: "fixed",
              inset: "0",
              "z-index": "2147483100",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: overlayTint(),
              padding: "1.5rem",
              "pointer-events": "auto",
            }}
          >
            <div
              class="w-full max-w-[560px] overflow-y-auto rounded-xl border border-[var(--mcp-border-strong)] p-5"
              style={{ background: raised(), "box-shadow": "0 24px 64px rgba(0,0,0,0.35)" }}
            >
              <div class="mb-1 flex items-center gap-2 text-[15px] font-[600]">
                <img src={appIcon(app(), 18)} alt="" class="h-[18px] w-[18px] rounded" />
                {app().name}
                <span class="text-[12px] font-[400] text-[var(--mcp-text-weak)]">{app().category}</span>
              </div>
              <div class="mb-4 text-[12px] text-[var(--mcp-text-weak)]">{app().description}</div>

              <div class="mb-1 flex items-center justify-between gap-2">
                <div class="text-[12px] font-[600] text-[var(--mcp-text-weak)]">{line(guideLang(), "title")}</div>
                <label class="flex items-center gap-1.5 text-[11px] text-[var(--mcp-text-weak)]">
                  {line(guideLang(), "language")}
                  <select
                    class="rounded-md border border-[var(--mcp-border)] bg-transparent px-1.5 py-0.5 text-[11px] outline-none"
                    value={guideLang()}
                    onChange={(event) => changeGuideLang(event.currentTarget.value)}
                  >
                    <For each={LANGUAGES}>
                      {(lang) => (
                        <option value={lang.code}>
                          {lang.native} ({lang.english})
                        </option>
                      )}
                    </For>
                  </select>
                </label>
              </div>
              <ul class="mb-4 ml-4 list-disc space-y-1 text-[12px]">
                <For each={guideFor(app(), guideLang())}>
                  {(guideLine) => <li>{guideLine}</li>}
                </For>
              </ul>

              <Show when={docsByApp[app().id]}>
                <div class="mb-1 text-[12px] font-[600] text-[var(--mcp-text-weak)]">{line(guideLang(), "docs")}</div>
                <a
                  class="mb-4 block break-all text-[12px] underline"
                  href={docsByApp[app().id]}
                  target="_blank"
                  rel="noopener"
                >
                  {docsByApp[app().id]}
                </a>
              </Show>

              <Show when={app().note}>
                <div class="mb-1 text-[12px] font-[600] text-[var(--mcp-text-weak)]">
                  {line(guideLang(), "goodToKnow")}
                </div>
                <div class="mb-4 rounded-md border border-[var(--mcp-border)] p-3 text-[12px]">
                  {catalogText(app().note ?? "", guideLang())}
                </div>
              </Show>

              <div class="mb-1 text-[12px] font-[600] text-[var(--mcp-text-weak)]">{line(guideLang(), "endpoint")}</div>
              <div class="mb-4 select-all break-all rounded-md border border-[var(--mcp-border)] p-2 font-mono text-[11px]">
                {app().url ?? app().command?.command ?? line(guideLang(), "endpointLocal")}
              </div>

              <div class="mb-1 text-[12px] font-[600] text-[var(--mcp-text-weak)]">{line(guideLang(), "howto")}</div>
              <ol class="mb-4 ml-4 list-decimal space-y-1 text-[12px]">
                <Show
                  when={app().steps?.length}
                  fallback={
                    <li>
                      {app().kind === "none"
                        ? line(guideLang(), "howNone")
                        : app().kind === "local"
                          ? line(guideLang(), "howLocal")
                          : app().kind === "token"
                            ? line(guideLang(), "howToken")
                            : line(guideLang(), "howOAuth")}
                    </li>
                  }
                >
                  {app().steps!.map((step) => (
                    <li>{catalogText(step, guideLang())}</li>
                  ))}
                </Show>
              </ol>

              <Show when={app().scope}>
                <div class="mb-1 text-[12px] font-[600] text-[var(--mcp-text-weak)]">{line(guideLang(), "scopes")}</div>
                <div class="mb-4 select-all break-all rounded-md border border-[var(--mcp-border)] p-2 font-mono text-[11px]">
                  {app().scope}
                </div>
              </Show>

              <Show when={app().kind === "oauth" && app().consoleUrl}>
                <div class="mb-1 text-[12px] font-[600] text-[var(--mcp-text-weak)]">
                  {line(guideLang(), "oauthClient")}
                </div>
                <div class="mb-2 text-[11px] text-[var(--mcp-text-weak)]">
                  <For
                    each={line(guideLang(), "oauthHelp", {
                      console: app().consoleUrl ?? "",
                      redirect: REDIRECT,
                    }).split(app().consoleUrl ?? "\u0000")}
                  >
                    {(part, index) => (
                      <>
                        <Show when={index() > 0 && app().consoleUrl}>
                          <a class="underline" href={app().consoleUrl} target="_blank" rel="noopener">
                            {app().consoleUrl}
                          </a>
                        </Show>
                        {part}
                      </>
                    )}
                  </For>
                </div>
                <input
                  value={clientIds()[app().id]?.id ?? ""}
                  onInput={(e) =>
                    setClientIds((prev) => ({
                      ...prev,
                      [app().id]: { ...prev[app().id], id: e.currentTarget.value },
                    }))
                  }
                  placeholder={line(guideLang(), "pasteClientId")}
                  class="mb-2 h-9 w-full rounded-md border border-[var(--mcp-border)] bg-transparent px-3 text-[13px] outline-none"
                />
                <input
                  value={clientIds()[app().id]?.secret ?? ""}
                  onInput={(e) =>
                    setClientIds((prev) => ({
                      ...prev,
                      [app().id]: { id: prev[app().id]?.id ?? "", secret: e.currentTarget.value },
                    }))
                  }
                  placeholder={line(guideLang(), "pasteSecret")}
                  class="mb-3 h-9 w-full rounded-md border border-[var(--mcp-border)] bg-transparent px-3 text-[13px] outline-none"
                />
              </Show>

              <div class="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  class="rounded-md px-3 py-1.5 text-[13px] hover:bg-white/5"
                  onClick={() => setDetailsFor(null)}
                >
                  {line(guideLang(), "close")}
                </button>
                <Show when={app().consoleUrl}>
                  <button
                    type="button"
                    class="rounded-md px-3 py-1.5 text-[13px] hover:bg-white/5"
                    onClick={() => window.open(app().consoleUrl, "_blank", "noopener")}
                  >
                    {line(guideLang(), "openConsole")}
                  </button>
                </Show>
                <button
                  type="button"
                  class="rounded-md px-3 py-1.5 text-[13px] hover:bg-white/5 disabled:opacity-50"
                  disabled={busy() !== null}
                  title="Build the sign-in link so it can be opened in whichever browser holds your account"
                  onClick={() => generateConsentUrl(app())}
                >
                  {generating() === app().id ? line(guideLang(), "generating") : line(guideLang(), "generateLink")}
                </button>
                <button
                  type="button"
                  class="rounded-md px-3 py-1.5 text-[13px] font-[600] disabled:opacity-50"
                  disabled={busy() !== null}
                  style={{ background: fill() }}
                  onClick={() => submitClientId()}
                >
                  Connect
                </button>
              </div>

              <Show when={consentUrl()}>
                {(url) => (
                  <div class="mt-4 rounded-md border border-[var(--mcp-border)] p-3">
                    <div class="mb-1 text-[12px] font-[600]">Sign-in link</div>
                    <div class="mb-2 text-[11px] text-[var(--mcp-text-weak)]">
                      Open it in the browser where you are signed in, approve the app, then come back here. ZYRAXON
                      receives the reply automatically.
                    </div>
                    <div class="select-all break-all font-mono text-[11px]">{url()}</div>
                    <div class="mt-2 flex gap-2">
                      <button
                        type="button"
                        class="rounded-md border border-[var(--mcp-border)] px-2 py-1 text-[12px] hover:bg-white/5"
                        onClick={() => navigator.clipboard?.writeText(url())}
                      >
                        Copy link
                      </button>
                      <button
                        type="button"
                        class="rounded-md border border-[var(--mcp-border)] px-2 py-1 text-[12px] hover:bg-white/5"
                        onClick={() => window.open(url(), "_blank", "noopener")}
                      >
                        Open link
                      </button>
                    </div>
                  </div>
                )}
              </Show>
            </div>
          </div>
        )}
      </Show>
     </div>
    </div>
  )
}

export { authLabel, supportsZeroSetup }
