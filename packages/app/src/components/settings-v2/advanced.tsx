// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, Show } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServerSync } from "@/context/server-sync"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

export const SettingsAdvancedV2: Component = () => {
  const language = useLanguage()
  const layout = useLayout()
  const serverSync = useServerSync()

  const worktree = () =>
    layout.home.selection().directory ?? layout.projects.list()[0]?.worktree ?? serverSync().data.path.home
  const instance = () => serverSync().data.path.directory

  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.advanced.paths")}</h3>
      <SettingsListV2>
        <SettingsRowV2 title={language.t("settings.advanced.project")} description={worktree()}>
          <div class="settings-v2-mono">{language.t("common.default")}</div>
        </SettingsRowV2>
        <SettingsRowV2 title={language.t("settings.advanced.instance")} description={instance()}>
          <div class="settings-v2-mono">—</div>
        </SettingsRowV2>
        <SettingsRowV2
          title={language.t("settings.advanced.config")}
          description={language.t("settings.advanced.config.description")}
        >
          <div class="settings-v2-mono">zyraxon.jsonc</div>
        </SettingsRowV2>
      </SettingsListV2>

      <h3 class="settings-v2-section-title">{language.t("settings.advanced.behaviour")}</h3>
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.advanced.telemetry.title")}
          description={language.t("settings.advanced.telemetry.description")}
        >
          <div class="settings-v2-mono">{language.t("settings.advanced.telemetry.state")}</div>
        </SettingsRowV2>
        <SettingsRowV2
          title={language.t("settings.advanced.layout.title")}
          description={language.t("settings.advanced.layout.description")}
        >
          <div class="settings-v2-mono">{language.t("settings.advanced.layout.state")}</div>
        </SettingsRowV2>
      </SettingsListV2>

      <Show when={false}>
        <Icon name="zy-terminal" size="small" />
      </Show>
    </div>
  )
}