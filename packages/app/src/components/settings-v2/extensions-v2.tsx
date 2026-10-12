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
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import type { DirectorySync } from "@/context/sync"
import { useServiceStatus } from "@/components/sidebar/sidebar-status"

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

type Pane = "mcp" | "plugins" | "lsp" | "marketplace"

/**
 * Where each extension kind is configured, relative to the project root. Kept
 * together so the footer of every pane names the same files the CLI reads.
 */
const CONFIG_PATHS = {
  mcp: ".zyraxon/zyraxon.jsonc",
  plugins: ".zyraxon/plugin",
  lsp: ".zyraxon/lsp.jsonc",
} as const

const PANES: readonly { value: Pane; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { value: "mcp", icon: "zy-mcp" },
  { value: "plugins", icon: "zy-plugins" },
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
                        disabled={busy() === item.id}
                        onChange={() => void toggle(item.id)}
                      >
                        {item.label}
                      </Switch>
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            <footer class="zy-ext-foot">
              {language.t("settings.extensions.config.hint")} <code>{CONFIG_PATHS.mcp}</code>
            </footer>
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
            <footer class="zy-ext-foot">
              {language.t("settings.extensions.config.hint")} <code>{CONFIG_PATHS.plugins}</code>
            </footer>
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
            <footer class="zy-ext-foot">
              {language.t("settings.extensions.config.hint")} <code>{CONFIG_PATHS.lsp}</code>
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
  )
}
