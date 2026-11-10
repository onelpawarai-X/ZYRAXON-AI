// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, Show, createMemo } from "solid-js"
import { Link } from "../link"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

const WEBSITE_URL = "https://zyraxonai.lovable.app"
const GITHUB_URL = "https://github.com/onelpawarai-X/ZYRAXON-AI"

export const SettingsAboutV2: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()

  const build = createMemo(() => {
    if (platform.platform === "web") return "web"
    return platform.os ? `desktop · ${platform.os}` : "desktop"
  })

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.about")}</h2>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <div class="settings-v2-section-title">{language.t("app.name.desktop")}</div>
          <p class="settings-v2-hint">{language.t("settings.about.tagline")}</p>
        </div>

        <div class="settings-v2-section">
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.about.row.app.title")}
              description={language.t("settings.about.row.app.description")}
            >
              <span class="text-13-regular text-v2-text-text-muted">{language.t("app.name.desktop")}</span>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.about.row.version.title")}
              description={language.t("settings.about.row.version.description")}
            >
              <Show when={platform.version} fallback={<span class="text-13-regular text-v2-text-text-muted">—</span>}>
                <span class="text-13-regular text-v2-text-text-muted">v{platform.version}</span>
              </Show>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.about.row.platform.title")}
              description={language.t("settings.about.row.platform.description")}
            >
              <span class="text-13-regular text-v2-text-text-muted">{build()}</span>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.about.row.copyright.title")}
              description={language.t("settings.about.row.copyright.description")}
            >
              <span class="text-13-regular text-v2-text-text-muted">{language.t("settings.about.footer.copyright")}</span>
            </SettingsRowV2>
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <div class="settings-v2-section-title">{language.t("settings.about.links.title")}</div>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.about.link.website")}
              description={language.t("settings.about.row.website.description")}
            >
              <Link class="settings-v2-link" href={WEBSITE_URL}>
                zyraxonai.lovable.app
              </Link>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.about.link.github")}
              description={language.t("settings.about.row.github.description")}
            >
              <Link class="settings-v2-link" href={GITHUB_URL}>
                github.com/onelpawarai-X/ZYRAXON-AI
              </Link>
            </SettingsRowV2>
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <div class="settings-v2-section-title">{language.t("settings.about.description.title")}</div>
          <p class="settings-v2-hint">{language.t("settings.about.description")}</p>
        </div>
      </div>
    </>
  )
}