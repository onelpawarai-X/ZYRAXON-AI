// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Accessor, type Component, For, Show, createMemo } from "solid-js"
import { ServiceStatusDot, useServiceStatus } from "@/components/sidebar/sidebar-status"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServerSync } from "@/context/server-sync"
import type { DirectorySync } from "@/context/sync"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

// The settings page is not directory scoped, so mirror the fallback chain the general
// panel uses and borrow the directory sync context for the current workspace.
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

const EmptyStatusList: Component<{ message: string }> = (props) => {
  return <div class="text-13-regular text-v2-text-text-muted px-1 py-2">{props.message}</div>
}

export const SettingsMcpV2: Component = () => {
  const language = useLanguage()
  const service = useServiceStatus(useSettingsDirectorySync())

  const statusLabel = (status?: string) => {
    if (status === "connected") return language.t("mcp.status.connected")
    if (status === "failed") return language.t("mcp.status.failed")
    if (status === "disabled") return language.t("mcp.status.disabled")
    if (status === "needs_auth" || status === "needs_client_registration")
      return language.t("mcp.status.needs_auth")
    return ""
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.mcp")}</h2>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <SettingsListV2>
            <Show
              when={service.mcpNames().length > 0}
              fallback={<EmptyStatusList message={language.t("dialog.mcp.empty")} />}
            >
              <For each={service.mcpNames()}>
                {(name) => (
                  <SettingsRowV2 title={name} description={statusLabel(service.mcpStatus(name))}>
                    <ServiceStatusDot status={service.mcpStatus(name)} />
                  </SettingsRowV2>
                )}
              </For>
            </Show>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}

export const SettingsPluginsV2: Component = () => {
  const language = useLanguage()
  const service = useServiceStatus(useSettingsDirectorySync())

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.plugins")}</h2>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("status.popover.tab.plugins")}</h3>
          <SettingsListV2>
            <Show
              when={service.plugins().length > 0}
              fallback={<EmptyStatusList message={language.t("dialog.plugins.empty")} />}
            >
              <For each={service.plugins()}>
                {(plugin) => (
                  <SettingsRowV2 title={plugin} description="">
                    <ServiceStatusDot status="connected" />
                  </SettingsRowV2>
                )}
              </For>
            </Show>
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("status.popover.tab.lsp")}</h3>
          <SettingsListV2>
            <Show
              when={service.lspItems().length > 0}
              fallback={<EmptyStatusList message={language.t("dialog.lsp.empty")} />}
            >
              <For each={service.lspItems()}>
                {(item) => (
                  <SettingsRowV2 title={item.name || item.id} description="">
                    <ServiceStatusDot status={item.status} />
                  </SettingsRowV2>
                )}
              </For>
            </Show>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}