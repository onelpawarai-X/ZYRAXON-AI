// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Accessor, type Component, For, Show, createMemo, createSignal } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { useDialog } from "@zyraxon-ai/ui/context/dialog"
import type { McpClientLike } from "../../../../../MCP Hub/plugin"
import { ServiceSection } from "@/components/service-section"
import "@/components/service-section.css"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
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

export const SettingsExtensionsV2: Component = () => {
  const language = useLanguage()
  const dialog = useDialog()
  const sdk = useServerSDK()
  const serverSync = useServerSync()
  const layout = useLayout()
  const directory = createMemo(
    () => layout.home.selection().directory ?? layout.projects.list()[0]?.worktree ?? serverSync().data.path.home,
  )
  const service = useServiceStatus(useSettingsDirectorySync())
  const [pane, setPane] = createSignal<Pane>("mcp")

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
      dialog.push(() => (
        <hub.McpHubPanel runtime={runtime} resolve={hubApi.resolve} onClose={() => dialog.close()} />
      ))
    })
  }

  const mcpItems = createMemo(() =>
    service.mcpNames().map((name) => ({ id: name, label: name, status: service.mcpStatus(name) })),
  )
  const pluginItems = createMemo(() =>
    service.plugins().map((name) => ({ id: name, label: name, status: "connected" as const })),
  )
  const lspItems = createMemo(() =>
    service.lspItems().map((item) => ({
      id: item.id,
      label: item.name || item.id,
      status: item.status,
    })),
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
          <ServiceSection
            icon="zy-mcp"
            title={language.t("settings.extensions.pane.mcp")}
            count={mcpItems().length}
            empty={language.t("dialog.mcp.empty")}
            items={mcpItems()}
            action={
              <ButtonV2 size="small" variant="neutral" onClick={openMcpHub}>
                {language.t("settings.extensions.action.connectMcp")}
              </ButtonV2>
            }
            footer={
              <div>
                {language.t("settings.extensions.config.hint")}{" "}
                <span class="zy-service-path">{CONFIG_PATHS.mcp}</span>
              </div>
            }
          />
        </Show>

        <Show when={pane() === "plugins"}>
          <ServiceSection
            icon="zy-plugins"
            title={language.t("settings.extensions.pane.plugins")}
            count={pluginItems().length}
            empty={language.t("dialog.plugins.empty")}
            items={pluginItems()}
            footer={
              <div>
                {language.t("settings.extensions.config.hint")}{" "}
                <span class="zy-service-path">{CONFIG_PATHS.plugins}</span>
              </div>
            }
          />
        </Show>

        <Show when={pane() === "lsp"}>
          <ServiceSection
            icon="zy-code"
            title={language.t("settings.extensions.pane.lsp")}
            count={lspItems().length}
            empty={language.t("dialog.lsp.empty")}
            items={lspItems()}
            footer={
              <div>
                {language.t("settings.extensions.config.hint")}{" "}
                <span class="zy-service-path">{CONFIG_PATHS.lsp}</span>
              </div>
            }
          />
        </Show>

        <Show when={pane() === "marketplace"}>
          <ServiceSection
            icon="zy-ecosystem"
            title={language.t("settings.extensions.pane.marketplace")}
            empty={language.t("settings.extensions.marketplace.empty")}
            items={[]}
            footer={<div>{language.t("settings.extensions.marketplace.hint")}</div>}
          />
        </Show>
      </div>
    </div>
  )
}