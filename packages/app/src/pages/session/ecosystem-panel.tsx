import { createSignal, For, Show, onMount, onCleanup } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { IconButtonV2 } from "@zyraxon-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"

const ZYRAXON_ENDPOINT = "https://agent-ecosystem-hub.lovable.app/api/public/v1"
const ZYRAXON_KEY_STORAGE = "zyraxon_agent_key"

type ItemCategory = "website" | "sdk" | "pdf" | "ai_bot" | "plugin" | "template" | "mobile_app" | "api"

type ItemStatus = "draft" | "published" | "scanning" | "blocked"

interface CreatedItem {
  id: string
  name: string
  slug: string
  category: ItemCategory
  status: ItemStatus
  createdAt: string
  description?: string
  liveUrl?: string
  repoUrl?: string
  coverUrl?: string
  tags?: string[]
  agentMode?: string
  scanScore?: number
  scanFindings?: string
}

interface PublishedProject {
  id: string
  name: string
  slug: string
  tagline: string
  description: string
  category: string
  author_name: string
  cover_url: string | null
  live_url: string | null
  repo_url: string | null
  version: string
  tags: string[]
  score: number
  published_at: string
}

const CATEGORY_CONFIG: Record<ItemCategory, { icon: string; label: string; color: string; description: string }> = {
  website: { icon: "globe", label: "Website", color: "#238636", description: "Full website built with ZYRAXON" },
  sdk: { icon: "package", label: "SDK", color: "#8957e5", description: "Software Development Kit" },
  pdf: { icon: "file-text", label: "PDF", color: "#f85149", description: "Generated document or report" },
  ai_bot: { icon: "bot", label: "AI Bot", color: "#1f6feb", description: "Custom AI assistant" },
  plugin: { icon: "puzzle", label: "Plugin", color: "#e3b341", description: "Extension or add-on" },
  template: { icon: "layout", label: "Template", color: "#3fb950", description: "Reusable project template" },
  mobile_app: { icon: "smartphone", label: "Mobile App", color: "#f778ba", description: "Cross-platform mobile application" },
  api: { icon: "terminal", label: "API", color: "#79c0ff", description: "REST/GraphQL API endpoint" },
}

const AGENT_MODES = [
  { id: "build", label: "Build", icon: "code", color: "#58a6ff" },
  { id: "plan", label: "Plan", icon: "list-unordered", color: "#d2a8ff" },
  { id: "beast", label: "Beast", icon: "zap", color: "#f85149" },
  { id: "pro", label: "PRO", icon: "shield", color: "#3fb950" },
  { id: "apex", label: "APEX", icon: "alert", color: "#e3b341" },
  { id: "dark", label: "DARK", icon: "moon", color: "#8b949e" },
  { id: "vision", label: "VISION", icon: "eye", color: "#f778ba" },
  { id: "probuilder", label: "PRO BUILDER", icon: "rocket", color: "#79c0ff" },
  { id: "general", label: "General", icon: "comment", color: "#c9d1d9" },
]

const LOCAL_STORAGE_KEY = "zyraxon_ecosystem_items"
const GITHUB_USER_KEY = "zyraxon_github_user"

export function EcosystemPanel() {
  const [items, setItems] = createSignal<CreatedItem[]>([])
  const [marketplaceItems, setMarketplaceItems] = createSignal<PublishedProject[]>([])
  const [selectedCategory, setSelectedCategory] = createSignal<ItemCategory | "all">("all")
  const [selectedAgent, setSelectedAgent] = createSignal<string | "all">("all")
  const [publishingId, setPublishingId] = createSignal<string | null>(null)
  const [showCreateMenu, setShowCreateMenu] = createSignal(false)
  const [githubUser, setGithubUser] = createSignal<{ login: string; avatar_url: string } | null>(null)
  const [apiKey, setApiKey] = createSignal<string>("")
  const [showSettings, setShowSettings] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal<"my-items" | "marketplace">("my-items")
  const [marketplaceSearch, setMarketplaceSearch] = createSignal("")

  onMount(() => {
    loadItems()
    loadGithubUser()
    loadApiKey()
    fetchMarketplace()

    const handler = (event: CustomEvent<CreatedItem>) => {
      setItems((prev) => [event.detail, ...prev])
      saveItems()
    }
    window.addEventListener("zyraxon:item-created", handler as EventListener)
    onCleanup(() => window.removeEventListener("zyraxon:item-created", handler as EventListener))
  })

  const loadItems = () => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (stored) setItems(JSON.parse(stored))
    } catch {}
  }

  const saveItems = () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items()))
  }

  const loadGithubUser = () => {
    try {
      const stored = localStorage.getItem(GITHUB_USER_KEY)
      if (stored) setGithubUser(JSON.parse(stored))
    } catch {}
  }

  const saveGithubUser = (user: { login: string; avatar_url: string } | null) => {
    if (user) {
      localStorage.setItem(GITHUB_USER_KEY, JSON.stringify(user))
      setGithubUser(user)
    } else {
      localStorage.removeItem(GITHUB_USER_KEY)
      setGithubUser(null)
    }
  }

  const loadApiKey = () => {
    try {
      const stored = localStorage.getItem(ZYRAXON_KEY_STORAGE)
      if (stored) setApiKey(stored)
    } catch {}
  }

  const saveApiKey = (key: string) => {
    localStorage.setItem(ZYRAXON_KEY_STORAGE, key)
    setApiKey(key)
  }

  const connectGithub = async () => {
    try {
      const user = await (window as any).electronAPI?.github?.getUser()
      if (user) {
        saveGithubUser(user)
      }
    } catch {}
  }

  const disconnectGithub = () => {
    saveGithubUser(null)
  }

  const fetchMarketplace = async () => {
    try {
      const res = await fetch(`${ZYRAXON_ENDPOINT}/apps`)
      if (res.ok) {
        const data = await res.json()
        setMarketplaceItems(data.projects || data || [])
      }
    } catch {}
  }

  const filteredItems = () => {
    let result = items()
    if (selectedCategory() !== "all") {
      result = result.filter((item) => item.category === selectedCategory())
    }
    if (selectedAgent() !== "all") {
      result = result.filter((item) => item.agentMode === selectedAgent())
    }
    return result
  }

  const filteredMarketplace = () => {
    const q = marketplaceSearch().toLowerCase()
    if (!q) return marketplaceItems()
    return marketplaceItems().filter(
      (p) => p.name.toLowerCase().includes(q) || p.tagline?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
    )
  }

  const draftItems = () => filteredItems().filter((item) => item.status === "draft")
  const publishedItems = () => filteredItems().filter((item) => item.status === "published")

  const createItem = (category: ItemCategory) => {
    const newItem: CreatedItem = {
      id: `item-${Date.now()}`,
      name: `New ${CATEGORY_CONFIG[category].label}`,
      slug: `new-${category}-${Date.now()}`,
      category,
      status: "draft",
      createdAt: new Date().toISOString(),
      agentMode: "general",
    }
    setItems((prev) => [newItem, ...prev])
    saveItems()
    setShowCreateMenu(false)

    window.dispatchEvent(new CustomEvent("zyraxon:item-created", { detail: newItem }))
  }

  const publishItem = async (itemId: string) => {
    const key = apiKey()
    if (!key) {
      setShowSettings(true)
      return
    }

    setPublishingId(itemId)
    const item = items().find((i) => i.id === itemId)
    if (!item) return

    try {
      const res = await fetch(`${ZYRAXON_ENDPOINT}/ingest`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-zyraxon-key": key,
        },
        body: JSON.stringify({
          name: item.name,
          slug: item.slug,
          tagline: item.description || `${item.name} built with ZYRAXON`,
          description: item.description || "",
          category: item.category,
          source_agent: "desktop",
          author_name: githubUser()?.login || "Anonymous",
          live_url: item.liveUrl || null,
          repo_url: item.repoUrl || null,
          tags: item.tags || [],
          publish: true,
        }),
      })

      const data = await res.json()

      if (data.scan?.blocked) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? { ...i, status: "blocked" as ItemStatus, scanScore: data.scan.score, scanFindings: data.scan.summary }
              : i
          )
        )
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? { ...i, status: "published" as ItemStatus, scanScore: data.scan?.score }
              : i
          )
        )
        fetchMarketplace()
      }
    } catch (err) {
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, scanFindings: `Error: ${err}` } : i))
      )
    }

    saveItems()
    setPublishingId(null)
  }

  const deleteItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId))
    saveItems()
  }

  const formatTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const getAgentInfo = (agentMode?: string) => {
    return AGENT_MODES.find((a) => a.id === agentMode) ?? AGENT_MODES[8]
  }

  return (
    <div class="h-full flex flex-col overflow-hidden p-3 gap-3">
      {/* Header */}
      <div class="shrink-0 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icon name="globe" size="small" class="text-text" />
          <span class="text-14-medium text-text">Ecosystem</span>
          <Show when={draftItems().length > 0}>
            <span class="px-1.5 py-0.5 rounded-full bg-surface-raised text-10-regular text-text-weak">
              {draftItems().length} draft
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-1">
          <TooltipV2 value="Settings" placement="bottom">
            <IconButtonV2
              icon={<Icon name="gear" size="small" />}
              variant="ghost-muted"
              size="normal"
              onClick={() => setShowSettings(!showSettings())}
            />
          </TooltipV2>
          <div class="relative">
            <TooltipV2 value="Create new item" placement="bottom">
              <IconButtonV2
                icon={<Icon name="plus-small" />}
                variant="ghost-muted"
                size="normal"
                onClick={() => setShowCreateMenu(!showCreateMenu())}
              />
            </TooltipV2>
            <Show when={showCreateMenu()}>
              <div class="absolute right-0 top-full mt-1 z-50 w-56 py-1 rounded-xl border border-border-weaker-base bg-surface-raised shadow-lg">
                <div class="px-2 py-1 text-10-regular text-text-faint">Create from Agent</div>
                <For each={Object.entries(CATEGORY_CONFIG)}>
                  {([key, config]) => (
                    <button
                      onClick={() => createItem(key as ItemCategory)}
                      class="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-surface-raised-base-active transition-colors"
                    >
                      <div
                        class="w-6 h-6 rounded-md flex items-center justify-center"
                        style={{ "background-color": `${config.color}20` }}
                      >
                        <Icon name={config.icon as any} size="small" style={{ color: config.color }} />
                      </div>
                      <div class="text-left">
                        <div class="text-12-medium text-text">{config.label}</div>
                        <div class="text-10-regular text-text-weak">{config.description}</div>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <Show when={showSettings()}>
        <div class="shrink-0 p-3 rounded-xl border border-border-weaker-base bg-surface-raised gap-3 flex flex-col">
          <div class="flex items-center justify-between">
            <span class="text-12-medium text-text">Settings</span>
            <IconButtonV2
              icon={<Icon name="x" size="small" />}
              variant="ghost-muted"
              size="normal"
              onClick={() => setShowSettings(false)}
            />
          </div>

          {/* GitHub Connection */}
          <div class="flex flex-col gap-2">
            <div class="text-11-regular text-text-weak">GitHub Account</div>
            <Show
              when={githubUser()}
              fallback={
                <button
                  onClick={connectGithub}
                  class="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-weaker-base hover:bg-surface-raised-base-active transition-colors"
                >
                  <Icon name="mark-github" size="small" class="text-text" />
                  <span class="text-12-medium text-text">Connect GitHub</span>
                </button>
              }
            >
              <div class="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-900/30 bg-green-900/10">
                <img
                  src={githubUser()!.avatar_url}
                  alt=""
                  class="w-5 h-5 rounded-full"
                />
                <span class="text-12-medium text-text flex-1">{githubUser()!.login}</span>
                <button
                  onClick={disconnectGithub}
                  class="text-10-regular text-text-weak hover:text-text"
                >
                  Disconnect
                </button>
              </div>
            </Show>
          </div>

          {/* API Key */}
          <div class="flex flex-col gap-2">
            <div class="text-11-regular text-text-weak">ZYRAXON API Key</div>
            <input
              type="password"
              value={apiKey()}
              onInput={(e) => saveApiKey(e.currentTarget.value)}
              placeholder="Paste your ZYRAXON key..."
              class="w-full px-3 py-2 rounded-lg border border-border-weaker-base bg-surface-base text-12-regular text-text placeholder:text-text-faint outline-none focus:border-border-default-base"
            />
          </div>
        </div>
      </Show>

      {/* Tab Switch */}
      <div class="shrink-0 flex items-center gap-1 p-0.5 rounded-lg bg-surface-raised">
        <button
          onClick={() => setActiveTab("my-items")}
          class={`flex-1 px-2 py-1.5 rounded-md text-11-medium transition-colors ${
            activeTab() === "my-items"
              ? "bg-surface-raised-base text-text shadow-sm"
              : "text-text-weak hover:text-text"
          }`}
        >
          My Items ({items().length})
        </button>
        <button
          onClick={() => setActiveTab("marketplace")}
          class={`flex-1 px-2 py-1.5 rounded-md text-11-medium transition-colors ${
            activeTab() === "marketplace"
              ? "bg-surface-raised-base text-text shadow-sm"
              : "text-text-weak hover:text-text"
          }`}
        >
          Marketplace ({marketplaceItems().length})
        </button>
      </div>

      {/* Agent Mode Filter (My Items tab only) */}
      <Show when={activeTab() === "my-items"}>
        <div class="shrink-0 flex items-center gap-1 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedAgent("all")}
            class={`px-2 py-1 rounded-lg text-10-regular whitespace-nowrap transition-colors ${
              selectedAgent() === "all"
                ? "bg-surface-raised text-text"
                : "text-text-weak hover:text-text"
            }`}
          >
            All Modes
          </button>
          <For each={AGENT_MODES}>
            {(agent) => (
              <button
                onClick={() => setSelectedAgent(agent.id)}
                class={`px-2 py-1 rounded-lg text-10-regular whitespace-nowrap transition-colors flex items-center gap-1 ${
                  selectedAgent() === agent.id
                    ? "bg-surface-raised text-text"
                    : "text-text-weak hover:text-text"
                }`}
              >
                <Icon name={agent.icon as any} size="small" style={{ color: agent.color }} />
                {agent.label}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Category Filter */}
      <div class="shrink-0 flex items-center gap-1 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedCategory("all")}
          class={`px-2 py-1 rounded-lg text-11-regular whitespace-nowrap transition-colors ${
            selectedCategory() === "all"
              ? "bg-surface-raised text-text"
              : "text-text-weak hover:text-text"
          }`}
        >
          All
        </button>
        <For each={Object.entries(CATEGORY_CONFIG)}>
          {([key, config]) => (
            <button
              onClick={() => setSelectedCategory(key as ItemCategory)}
              class={`px-2 py-1 rounded-lg text-11-regular whitespace-nowrap transition-colors ${
                selectedCategory() === key
                  ? "bg-surface-raised text-text"
                  : "text-text-weak hover:text-text"
              }`}
            >
              {config.label}
            </button>
          )}
        </For>
      </div>

      {/* Search (Marketplace tab) */}
      <Show when={activeTab() === "marketplace"}>
        <div class="shrink-0">
          <input
            type="text"
            value={marketplaceSearch()}
            onInput={(e) => setMarketplaceSearch(e.currentTarget.value)}
            placeholder="Search marketplace..."
            class="w-full px-3 py-2 rounded-lg border border-border-weaker-base bg-surface-base text-12-regular text-text placeholder:text-text-faint outline-none focus:border-border-default-base"
          />
        </div>
      </Show>

      {/* Content */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        {/* My Items Tab */}
        <Show when={activeTab() === "my-items"}>
          <Show
            when={filteredItems().length > 0}
            fallback={
              <div class="h-full flex flex-col items-center justify-center gap-3 text-center">
                <div class="w-14 h-14 rounded-2xl bg-surface-raised flex items-center justify-center">
                  <Icon name="globe" size="large" class="text-text-weak" />
                </div>
                <div class="flex flex-col gap-1">
                  <div class="text-13-medium text-text">No items yet</div>
                  <div class="text-12-regular text-text-weak max-w-[200px]">
                    Create something with any agent mode and it will appear here
                  </div>
                </div>
              </div>
            }
          >
            {/* Draft Items */}
            <Show when={draftItems().length > 0}>
              <div class="mb-3">
                <div class="text-11-regular text-text-weak mb-2 px-1">Drafts</div>
                <div class="flex flex-col gap-2">
                  <For each={draftItems()}>
                    {(item) => {
                      const agent = getAgentInfo(item.agentMode)
                      return (
                        <div class="flex items-center gap-2 p-2 rounded-xl border border-border-weaker-base bg-surface-raised hover:border-border-default-base transition-colors">
                          <div
                            class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ "background-color": `${CATEGORY_CONFIG[item.category].color}20` }}
                          >
                            <Icon
                              name={CATEGORY_CONFIG[item.category].icon as any}
                              size="small"
                              style={{ color: CATEGORY_CONFIG[item.category].color }}
                            />
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="text-12-medium text-text truncate">{item.name}</div>
                            <div class="flex items-center gap-1.5">
                              <span class="text-10-regular text-text-weak">
                                {CATEGORY_CONFIG[item.category].label}
                              </span>
                              <span class="text-10-regular text-text-faint">·</span>
                              <span class="flex items-center gap-0.5 text-10-regular" style={{ color: agent.color }}>
                                <Icon name={agent.icon as any} size="small" />
                                {agent.label}
                              </span>
                              <span class="text-10-regular text-text-faint">·</span>
                              <span class="text-10-regular text-text-weak">{formatTime(item.createdAt)}</span>
                            </div>
                          </div>
                          <div class="flex items-center gap-1 shrink-0">
                            <TooltipV2 value="Publish to marketplace" placement="bottom">
                              <IconButtonV2
                                icon={<Icon name="upload" size="small" />}
                                variant="ghost-muted"
                                size="normal"
                                loading={publishingId() === item.id}
                                onClick={() => publishItem(item.id)}
                              />
                            </TooltipV2>
                            <TooltipV2 value="Delete" placement="bottom">
                              <IconButtonV2
                                icon={<Icon name="trash" size="small" />}
                                variant="ghost-muted"
                                size="normal"
                                onClick={() => deleteItem(item.id)}
                              />
                            </TooltipV2>
                          </div>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </div>
            </Show>

            {/* Published Items */}
            <Show when={publishedItems().length > 0}>
              <div>
                <div class="text-11-regular text-text-weak mb-2 px-1">Published</div>
                <div class="flex flex-col gap-2">
                  <For each={publishedItems()}>
                    {(item) => {
                      const agent = getAgentInfo(item.agentMode)
                      return (
                        <div class="flex items-center gap-2 p-2 rounded-xl border border-green-900/30 bg-green-900/10">
                          <div
                            class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ "background-color": `${CATEGORY_CONFIG[item.category].color}20` }}
                          >
                            <Icon
                              name={CATEGORY_CONFIG[item.category].icon as any}
                              size="small"
                              style={{ color: CATEGORY_CONFIG[item.category].color }}
                            />
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="text-12-medium text-text truncate">{item.name}</div>
                            <div class="flex items-center gap-1.5">
                              <span class="text-10-regular text-green-400">Published</span>
                              <Show when={item.scanScore != null}>
                                <span class="text-10-regular text-text-faint">·</span>
                                <span class="text-10-regular text-text-weak">Score: {item.scanScore}</span>
                              </Show>
                              <span class="text-10-regular text-text-faint">·</span>
                              <span class="flex items-center gap-0.5 text-10-regular" style={{ color: agent.color }}>
                                <Icon name={agent.icon as any} size="small" />
                                {agent.label}
                              </span>
                            </div>
                          </div>
                          <div class="flex items-center gap-1 shrink-0">
                            <TooltipV2 value="View on marketplace" placement="bottom">
                              <IconButtonV2
                                icon={<Icon name="external-link" size="small" />}
                                variant="ghost-muted"
                                size="normal"
                                onClick={() => window.open(`https://zyraxonai.lovable.app/app/${item.slug}`, "_blank")}
                              />
                            </TooltipV2>
                          </div>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
        </Show>

        {/* Marketplace Tab */}
        <Show when={activeTab() === "marketplace"}>
          <Show
            when={filteredMarketplace().length > 0}
            fallback={
              <div class="h-full flex flex-col items-center justify-center gap-3 text-center">
                <div class="w-14 h-14 rounded-2xl bg-surface-raised flex items-center justify-center">
                  <Icon name="package" size="large" class="text-text-weak" />
                </div>
                <div class="flex flex-col gap-1">
                  <div class="text-13-medium text-text">No published projects yet</div>
                  <div class="text-12-regular text-text-weak max-w-[200px]">
                    Publish your first project to see it here
                  </div>
                </div>
              </div>
            }
          >
            <div class="flex flex-col gap-2">
              <For each={filteredMarketplace()}>
                {(project) => (
                  <div
                    class="flex items-center gap-2 p-2 rounded-xl border border-border-weaker-base bg-surface-raised hover:border-border-default-base transition-colors cursor-pointer"
                    onClick={() => project.live_url && window.open(project.live_url, "_blank")}
                  >
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-surface-base">
                      <Icon name="package" size="small" class="text-text-weak" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-12-medium text-text truncate">{project.name}</div>
                      <div class="flex items-center gap-1.5">
                        <span class="text-10-regular text-text-weak">{project.tagline || project.category}</span>
                        <Show when={project.score != null}>
                          <span class="text-10-regular text-text-faint">·</span>
                          <span class="text-10-regular text-green-400">Score: {project.score}</span>
                        </Show>
                        <Show when={project.author_name}>
                          <span class="text-10-regular text-text-faint">·</span>
                          <span class="text-10-regular text-text-weak">by {project.author_name}</span>
                        </Show>
                      </div>
                    </div>
                    <Show when={project.live_url}>
                      <TooltipV2 value="Visit live" placement="bottom">
                        <IconButtonV2
                          icon={<Icon name="external-link" size="small" />}
                          variant="ghost-muted"
                          size="normal"
                          onClick={(e: Event) => {
                            e.stopPropagation()
                            window.open(project.live_url!, "_blank")
                          }}
                        />
                      </TooltipV2>
                    </Show>
                    <Show when={project.repo_url}>
                      <TooltipV2 value="View source" placement="bottom">
                        <IconButtonV2
                          icon={<Icon name="mark-github" size="small" />}
                          variant="ghost-muted"
                          size="normal"
                          onClick={(e: Event) => {
                            e.stopPropagation()
                            window.open(project.repo_url!, "_blank")
                          }}
                        />
                      </TooltipV2>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      {/* Status Bar */}
      <div class="shrink-0 flex items-center justify-between px-2 py-1.5 rounded-lg border border-border-weaker-base bg-surface-base">
        <div class="text-10-regular text-text-faint">
          {items().length} items · {publishedItems().length} published · {marketplaceItems().length} on marketplace
        </div>
        <div class="text-10-regular text-text-faint">
          {githubUser() ? `@${githubUser()!.login}` : "GitHub disconnected"}
        </div>
      </div>
    </div>
  )
}
