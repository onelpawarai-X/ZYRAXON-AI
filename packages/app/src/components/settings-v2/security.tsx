// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, Show } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { Switch } from "@zyraxon-ai/ui/v2/switch-v2"
import "./settings-v2.css"

export const SettingsSecurityV2: Component = () => {
  const language = useLanguage()
  const settings = useSettings()

  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.security.permissions")}</h3>
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.permission.title")}
          description={language.t("settings.security.permissions.description")}
        >
          <Switch
            checked={settings.permissions.autoApprove()}
            onChange={(value) => settings.permissions.setAutoApprove(value)}
            data-action="settings-security-autopermit"
          />
        </SettingsRowV2>
      </SettingsListV2>

      <h3 class="settings-v2-section-title">{language.t("settings.security.secrets")}</h3>
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.security.credentials.title")}
          description={language.t("settings.security.credentials.description")}
        >
          <div class="settings-v2-mono">{language.t("settings.security.credentials.location")}</div>
        </SettingsRowV2>
        <SettingsRowV2
          title={language.t("settings.security.git.title")}
          description={language.t("settings.security.git.description")}
        >
          <div class="settings-v2-mono">~/.ssh/id_*.pub</div>
        </SettingsRowV2>
      </SettingsListV2>

      <h3 class="settings-v2-section-title">{language.t("settings.security.network")}</h3>
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.security.network.title")}
          description={language.t("settings.security.network.description")}
        >
          <Show when={false}>
            <Icon name="zy-status" size="small" />
          </Show>
          <div class="settings-v2-mono">127.0.0.1</div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}