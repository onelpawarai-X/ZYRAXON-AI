// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Accessor, type Component, For, Show, createMemo, createSignal } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { Switch } from "@zyraxon-ai/ui/v2/switch-v2"
import { useDialog } from "@zyraxon-ai/ui/context/dialog"
import type { McpClientLike } from "../../../../../MCP Hub/plugin"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { usePrompt } from "@/context/prompt"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import type { DirectorySync } from "@/context/sync"
import { useServiceStatus } from "@/components/sidebar/sidebar-status"
import { showToast } from "@/utils/toast"
import { SettingsLocationsV2 } from "./storage-locations"

/**
 * The settings page is not directory scoped, so mirror the fallback chain the
 * general panel uses and borrow the directory sync context for the workspace.
 */
function useSettingsDirectorySync(): Accessor<DirectorySync | undefined> {
  const serverSync = useServerSync()
  const layout = useLayout()
  const directory = createMemo(
    () => layout.home.selection().directory ?? layout.projects.list()[0]?.worktree ?? serverSync().data.path.home,
  )
  return createMemo(() => {
    const value = directory()
    if (!value) return
    return serverSync().ensureDirSyncContext(value)
  })
}

type Pane = "mcp" | "plugins" | "skills" | "lsp" | "marketplace"

/**
 * Where each extension kind is configured, relative to the project root. Kept
 * together so the footer of every pane names the same files the CLI reads.
 */
const CONFIG_PATHS = {
  mcp: ".zyraxon/zyraxon.jsonc",
  plugins: ".zyraxon/plugin",
  skills: ".zyraxon/skills",
  lsp: ".zyraxon/lsp.jsonc",
} as const

const PANES: readonly { value: Pane; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { value: "mcp", icon: "zy-mcp" },
  { value: "plugins", icon: "zy-plugins" },
  { value: "skills", icon: "zy-skills" },
  { value: "lsp", icon: "zy-code" },
  { value: "marketplace", icon: "zy-ecosystem" },
]

/**
 * How a status reads on screen. The server reports several distinct states and
 * collapsing them all to a green or red dot was what made "needs sign-in" and
 * "crashed" look identical. Each one gets its own word and its own colour so the
 * row tells the user what to do next.
 */
const STATUS_TONE: Record<string, "positive" | "warning" | "danger" | "muted"> = {
  connected: "positive",
  needs_auth: "warning",
  needs_client_registration: "warning",
  disabled: "muted",
  failed: "danger",
}

export const SettingsExtensionsV2: Component = () => {
  const language = useLanguage()
  const dialog = useDialog()
  const sdk = useServerSDK()
  const serverSync = useServerSync()
  const layout = useLayout()
  const platform = usePlatform()
  const directory = createMemo(
    () => layout.home.selection().directory ?? layout.projects.list()[0]?.worktree ?? serverSync().data.path.home,
  )
  const service = useServiceStatus(useSettingsDirectorySync())
  const [pane, setPane] = createSignal<Pane>("mcp")
  const [busy, setBusy] = createSignal<string | undefined>(undefined)
  const [skillName, setSkillName] = createSignal("")
  const prompt = usePrompt()

  async function openPath(absolute: string) {
    if (platform.revealPath) {
      const revealed = await platform.revealPath(absolute).catch(() => false)
      if (revealed) return
    }
    if (platform.openPath) {
      await platform.openPath(absolute).catch(() => {})
      return
    }
    platform.openLink(`file://${absolute}`)
  }

  function currentConfigPath() {
    if (pane() === "plugins") return CONFIG_PATHS.plugins
    if (pane() === "skills") return CONFIG_PATHS.skills
    if (pane() === "lsp") return CONFIG_PATHS.lsp
    return CONFIG_PATHS.mcp
  }

  function openCurrentConfig() {
    const root = directory()
    if (!root) return
    return openPath(`${root}/${currentConfigPath()}`)
  }

  function createExtensionPrompt(kind: "skill" | "plugin" | "lsp") {
    const raw = skillName().trim() || (kind === "plugin" ? "new-plugin" : kind === "lsp" ? "new-lsp-adapter" : "custom-skill")
    const id = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new-extension"
    const body =
      kind === "skill"
        ? [
            `Create a new skill named "${raw}" for this repository.`,
            "",
            `Use id: ${id}`,
            `Write it to .zyraxon/skills/${id}/SKILL.md.`,
            "The completed SKILL.md must include valid YAML frontmatter with name and description, then concise operational instructions, required inputs, example prompts, and verification steps.",
            "After writing it, verify the file exists and explain how to invoke the skill.",
          ].join("\n")
        : kind === "plugin"
          ? [
              `Create a new ZYRAXON plugin named "${raw}" for this repository.`,
              "",
              `Use id: ${id}`,
              `Write it to .zyraxon/plugin/${id}/ with any manifest, source, README, and smoke test it needs.`,
              "The plugin must register its tools, commands, and configuration clearly.",
              "After writing it, verify the files exist and explain how to enable the plugin.",
            ].join("\n")
          : [
              `Create a new LSP/adapter configuration named "${raw}" for this repository.`,
              "",
              `Use id: ${id}`,
              `Write it to .zyraxon/lsp.jsonc with a complete, documented entry for the target language.`,
              "Include command, args, language ids, initialization options, and an environment-variable-safe configuration.",
              "After writing it, verify the configuration parses and explain how to enable it.",
            ].join("\n")
    prompt.set([{ type: "text", content: body, start: 0, end: body.length }], body.length)
    setSkillName("")
    dialog.close()
  }

  const createSkillPrompt = () => createExtensionPrompt("skill")

  /**
   * The Hub is a plugin loaded from the repository, so it is imported only when
   * the user actually asks for it. It needs a directory-scoped client, because
   * MCP configuration is written per project.
   */
  function openMcpHub() {
    const path = directory()
    if (!path) return
    void import("../../../../../MCP Hub/plugin").then((hub) => {
      const client = sdk().createClient({ directory: path, throwOnError: true })
      const runtime = hub.bindRuntime({
        client: client as unknown as McpClientLike,
        updateConfig: (patch: Record<string, unknown>) => serverSync().updateConfig(patch),
      })
      const hubApi = hub.createMcpHub(runtime)
      dialog.push(() => <hub.McpHubPanel runtime={runtime} resolve={hubApi.resolve} onClose={() => dialog.close()} />)
    })
  }

  /**
   * Flip one server on or off from the list itself.
   *
   * `mcp.toggle` already knows the right action for every status — connect a
   * disabled or failed server, sign in one that needs auth, drop one that is
   * live — so the switch hands it the current state and waits for the refresh.
   * The name is tracked in `busy` so only the row that was clicked shows a
   * pending state instead of every switch flickering at once.
   */
  async function toggle(name: string) {
    const path = directory()
    if (!path || busy()) return
    setBusy(name)
    try {
      await serverSync().mcp.toggle(path, name)
    } catch (error) {
      showToast({
        variant: "error",
        title: "Couldn’t update MCP server",
        description: error instanceof Error ? error.message : `Failed to toggle ${name}`,
      })
    } finally {
      setBusy(undefined)
    }
  }

  /**
   * Take the person to the file a server is written in.
   *
   * Every MCP entry lives in the project config, so "open" reveals that file in
   * the system file manager on desktop and falls back to a `file://` link in the
   * browser on web, where there is no native reveal.
   */
  async function openConfig() {
    const root = directory()
    if (!root) return
    const absolute = `${root}/${CONFIG_PATHS.mcp}`
    if (platform.revealPath) {
      const revealed = await platform.revealPath(absolute).catch(() => false)
      if (revealed) return
    }
    if (platform.openPath) {
      await platform.openPath(absolute).catch(() => {})
      return
    }
    platform.openLink(`file://${absolute}`)
  }

  const mcpItems = createMemo(() =>
    service.mcpNames().map((name) => {
      const status = service.mcpStatus(name) ?? "disabled"
      return {
        id: name,
        label: name,
        status,
        tone: STATUS_TONE[status] ?? "muted",
        on: status === "connected",
      }
    }),
  )
  const pluginItems = createMemo(() =>
    service.plugins().map((name) => ({ id: name, label: name, status: "connected" as const })),
  )
  const lspItems = createMemo(() =>
    service.lspItems().map((item) => ({ id: item.id, label: item.name || item.id, status: item.status })),
  )

  return (
    <div class="zy-extensions-wrap">
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.extensions")}</h2>
      </div>
      <div class="zy-extensions">
        <nav class="zy-extensions-nav" aria-label={language.t("settings.extensions.nav")}>
        <For each={PANES}>
          {(entry) => (
            <button
              type="button"
              class="zy-extensions-tab"
              data-action={`settings-extensions-${entry.value}`}
              data-active={pane() === entry.value}
              onClick={() => setPane(entry.value)}
            >
              <Icon name={entry.icon} size="small" />
              <span>{language.t(`settings.extensions.pane.${entry.value}`)}</span>
              <span class="zy-extensions-tab-count">
                <Show when={entry.value === "mcp" && mcpItems().length > 0}>{mcpItems().length}</Show>
                <Show when={entry.value === "plugins" && pluginItems().length > 0}>{pluginItems().length}</Show>
                <Show when={entry.value === "lsp" && lspItems().length > 0}>{lspItems().length}</Show>
              </span>
            </button>
          )}
        </For>
      </nav>

      <div class="zy-extensions-body">
        <Show when={pane() === "mcp"}>
          <section class="zy-ext-pane">
            <header class="zy-ext-pane-head">
              <div class="zy-ext-pane-heading">
                <h3 class="zy-ext-pane-title">{language.t("settings.extensions.pane.mcp")}</h3>
                <p class="zy-ext-pane-sub">
                  {language.t("settings.extensions.mcp.summary", {
                    connected: service.mcpConnected(),
                    total: mcpItems().length,
                  })}
                </p>
              </div>
              <ButtonV2 size="small" variant="neutral" icon="plus" onClick={openMcpHub}>
                {language.t("settings.extensions.action.connectMcp")}
              </ButtonV2>
            </header>

            <Show
              when={mcpItems().length > 0}
              fallback={
                <div class="zy-ext-empty">
                  <Icon name="zy-mcp" size="large" />
                  <p>{language.t("dialog.mcp.empty")}</p>
                  <ButtonV2 size="small" variant="neutral" onClick={openMcpHub}>
                    {language.t("settings.extensions.action.connectMcp")}
                  </ButtonV2>
                </div>
              }
            >
              <ul class="zy-ext-list">
                <For each={mcpItems()}>
                  {(item) => (
                    <li class="zy-ext-row" data-tone={item.tone} data-busy={busy() === item.id}>
                      <span class="zy-ext-dot" data-tone={item.tone} />
                      <span class="zy-ext-row-text">
                        <span class="zy-ext-row-name">{item.label}</span>
                        <span class="zy-ext-row-status">{language.t(`settings.extensions.status.${item.status}`)}</span>
                      </span>
                      <button
                        type="button"
                        class="zy-ext-open"
                        data-action="settings-extensions-mcp-open"
                        onClick={() => void openConfig()}
                      >
                        <Icon name="zy-code" size="small" />
                        <span>{language.t("settings.extensions.action.open")}</span>
                      </button>
                      <Switch
                        hideLabel
                        class="zy-ext-switch"
                        checked={item.on}
                        disabled={busy() !== undefined}
                        onChange={() => void toggle(item.id)}
                      >
                        {item.label}
                      </Switch>
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            <footer class="zy-ext-foot flex flex-wrap items-center gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-v2-text-text-faint">
                  <span>{language.t("settings.extensions.config.hint")}</span>
                  <code class="rounded bg-black/25 px-1.5 py-0.5">{CONFIG_PATHS.mcp}</code>
                </div>
                <button
                  type="button"
                  class="mt-1 text-left text-[11px] text-v2-text-text-faint underline decoration-white/10 underline-offset-2 hover:text-v2-text-text-muted"
                  onClick={() => void openPath(`${serverSync().data.path.config ?? "~/.config/zyraxon"}/zyraxon.jsonc`)}
                >
                  Global: {serverSync().data.path.config ?? "~/.config/zyraxon"}/zyraxon.jsonc
                </button>
              </div>
              <button type="button" class="zy-ext-open ml-auto shrink-0" data-action="settings-extensions-open-path" onClick={openConfig}>
                <Icon name="zy-code" size="small" />
                <span>Project</span>
              </button>
              <button type="button" class="zy-ext-open shrink-0" data-action="settings-extensions-open-path" onClick={() => void openPath(`${serverSync().data.path.config ?? "~/.config/zyraxon"}/zyraxon.jsonc`)}>
                <Icon name="zy-code" size="small" />
                <span>Global</span>
              </button>
            </footer>

            <SettingsLocationsV2
              kinds={["mcp", "config"]}
              title={language.t("settings.extensions.mcp.files.title")}
              description={language.t("settings.extensions.mcp.files.description")}
            />
          </section>
        </Show>

        <Show when={pane() === "plugins"}>
          <section class="zy-ext-pane">
            <header class="zy-ext-pane-head">
              <div class="zy-ext-pane-heading">
                <h3 class="zy-ext-pane-title">{language.t("settings.extensions.pane.plugins")}</h3>
                <p class="zy-ext-pane-sub">
                  {language.t("settings.extensions.plugins.summary", { total: pluginItems().length })}
                </p>
              </div>
              <button
                type="button"
                class="zy-ext-open shrink-0"
                data-action="settings-extensions-create-plugin"
                onClick={() => createExtensionPrompt("plugin")}
              >
                <Icon name="zy-add" size="small" />
                <span>Create</span>
              </button>
            </header>
            <Show
              when={pluginItems().length > 0}
              fallback={
                <div class="zy-ext-empty">
                  <Icon name="zy-plugins" size="large" />
                  <p>{language.t("dialog.plugins.empty")}</p>
                </div>
              }
            >
              <ul class="zy-ext-list">
                <For each={pluginItems()}>
                  {(item) => (
                    <li class="zy-ext-row" data-tone="positive">
                      <span class="zy-ext-dot" data-tone="positive" />
                      <span class="zy-ext-row-text">
                        <span class="zy-ext-row-name">{item.label}</span>
                        <span class="zy-ext-row-status">{language.t("settings.extensions.status.loaded")}</span>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <footer class="zy-ext-foot flex flex-wrap items-center gap-2">
              <span>{language.t("settings.extensions.config.hint")} <code>{CONFIG_PATHS.plugins}</code></span>
              <button type="button" class="zy-ext-open ml-auto" data-action="settings-extensions-open-path" onClick={() => void openPath(`${directory()}/${CONFIG_PATHS.plugins}`)}>
                <Icon name="zy-code" size="small" />
                <span>Open location</span>
              </button>
            </footer>
          </section>
        </Show>

        <Show when={pane() === "skills"}>
          <section class="zy-ext-pane">
            <header class="zy-ext-pane-head">
              <div class="zy-ext-pane-heading">
                <h3 class="zy-ext-pane-title">Skills</h3>
                <p class="zy-ext-pane-sub">Composable AI playbooks with direct file access and one-click creation.</p>
              </div>
              <button
                type="button"
                class="zy-ext-open shrink-0"
                data-action="settings-extensions-open-path"
                onClick={() => {
                  const root = directory()
                  if (root) void openPath(`${root}/${CONFIG_PATHS.skills}`)
                }}
              >
                <Icon name="zy-code" size="small" />
                <span>Open folder</span>
              </button>
            </header>

            <div class="mx-5 mb-4 rounded-xl border border-cyan-400/10 bg-[linear-gradient(135deg,rgba(0,212,255,0.075),rgba(20,184,166,0.03)_50%,rgba(255,255,255,0.018))] p-3">
              <div class="flex items-center gap-3">
                <div class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                  <Icon name="zy-skills" size="small" />
                </div>
                <div class="min-w-0">
                  <div class="text-[12px] font-semibold text-v2-text-text-base">Create a new skill with AI</div>
                  <div class="mt-0.5 text-[11px] leading-4 text-v2-text-text-faint">Pick a name, then AI will write SKILL.md, wire triggers, and verify the skill.</div>
                </div>
              </div>

              <form
                class="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  createSkillPrompt()
                }}
              >
                <input
                  value={skillName()}
                  onInput={(event) => setSkillName(event.currentTarget.value)}
                  placeholder="e.g. release-engineer, security-audit"
                  class="h-9 min-w-0 flex-1 rounded-lg border border-v2-border-border-weaker-base bg-black/25 px-3 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10"
                />
                <button type="submit" class="h-9 shrink-0 rounded-lg bg-cyan-400 px-3 text-[12px] font-semibold text-black transition-all hover:brightness-110">
                  Create
                </button>
              </form>
            </div>

            <div class="grid gap-2 px-5">
              <div class="text-[10px] font-semibold uppercase tracking-[0.2em] text-v2-text-text-faint">Starter blueprints</div>
              <div class="grid grid-cols-1 gap-2">
                <For each={[
                  { name: "release-engineer", description: "Draft release plans, changelogs, and verification steps" },
                  { name: "security-audit", description: "Scan code, configs, secrets, and unsafe dependencies" },
                  { name: "web-debugger", description: "Inspect frontend states, logs, and broken flows" },
                ]}>
                  {(starter) => (
                    <button
                      type="button"
                      class="group flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.025] px-3 py-2 text-left transition-all hover:border-cyan-400/20 hover:bg-cyan-400/[0.045]"
                      onClick={() => setSkillName(starter.name)}
                    >
                      <Icon name="zy-skills" size="small" class="text-v2-icon-icon-interactive-base" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-[12px] font-medium text-v2-text-text-base">{starter.name}</span>
                        <span class="block truncate text-[11px] text-v2-text-text-faint">{starter.description}</span>
                      </span>
                      <Icon name="zy-add" size="small" class="opacity-50 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="mt-auto px-5 pb-4 pt-3 text-[11px] leading-5 text-v2-text-text-faint">
              Skills are loaded from <code class="px-1 py-0.5 rounded bg-black/25 text-v2-text-text-muted">.zyraxon/skills</code>. Each skill folder needs <code class="px-1 py-0.5 rounded bg-black/25 text-v2-text-text-muted">SKILL.md</code> with YAML frontmatter.
            </div>
          </section>
        </Show>

        <Show when={pane() === "lsp"}>
          <section class="zy-ext-pane">
            <header class="zy-ext-pane-head">
              <div class="zy-ext-pane-heading">
                <h3 class="zy-ext-pane-title">{language.t("settings.extensions.pane.lsp")}</h3>
                <p class="zy-ext-pane-sub">
                  {language.t("settings.extensions.lsp.summary", { total: lspItems().length })}
                </p>
              </div>
              <button
                type="button"
                class="zy-ext-open shrink-0"
                data-action="settings-extensions-create-lsp"
                onClick={() => createExtensionPrompt("lsp")}
              >
                <Icon name="zy-add" size="small" />
                <span>Create</span>
              </button>
            </header>
            <Show
              when={lspItems().length > 0}
              fallback={
                <div class="zy-ext-empty">
                  <Icon name="zy-code" size="large" />
                  <p>{language.t("dialog.lsp.empty")}</p>
                </div>
              }
            >
              <ul class="zy-ext-list">
                <For each={lspItems()}>
                  {(item) => (
                    <li class="zy-ext-row" data-tone={STATUS_TONE[item.status ?? "connected"] ?? "muted"}>
                      <span class="zy-ext-dot" data-tone={STATUS_TONE[item.status ?? "connected"] ?? "muted"} />
                      <span class="zy-ext-row-text">
                        <span class="zy-ext-row-name">{item.label}</span>
                        <span class="zy-ext-row-status">{item.status}</span>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <footer class="zy-ext-foot flex flex-wrap items-center gap-2">
              <span>{language.t("settings.extensions.config.hint")} <code>{CONFIG_PATHS.lsp}</code></span>
              <button type="button" class="zy-ext-open ml-auto" data-action="settings-extensions-open-path" onClick={() => {
                const root = directory()
                if (root) void openPath(`${root}/${CONFIG_PATHS.lsp}`)
              }}>
                <Icon name="zy-code" size="small" />
                <span>Open file</span>
              </button>
            </footer>
          </section>
        </Show>

        <Show when={pane() === "marketplace"}>
          <section class="zy-ext-pane">
            <header class="zy-ext-pane-head">
              <div class="zy-ext-pane-heading">
                <h3 class="zy-ext-pane-title">{language.t("settings.extensions.pane.marketplace")}</h3>
                <p class="zy-ext-pane-sub">{language.t("settings.extensions.marketplace.hint")}</p>
              </div>
              <ButtonV2 size="small" variant="neutral" icon="zy-ecosystem" onClick={openMcpHub}>
                {language.t("settings.extensions.action.connectMcp")}
              </ButtonV2>
            </header>
            <div class="zy-ext-empty">
              <Icon name="zy-ecosystem" size="large" />
              <p>{language.t("settings.extensions.marketplace.empty")}</p>
            </div>
          </section>
        </Show>
      </div>
      </div>
    </div>
  )
}
