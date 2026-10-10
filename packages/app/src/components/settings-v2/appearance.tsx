// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, createMemo, onMount } from "solid-js"
import { SelectV2 } from "@zyraxon-ai/ui/v2/select-v2"
import { TextInputV2 } from "@zyraxon-ai/ui/v2/text-input-v2"
import { useTheme, type ColorScheme } from "@zyraxon-ai/ui/theme/context"
import { useLanguage } from "@/context/language"
import {
  monoDefault,
  monoFontFamily,
  monoInput,
  sansDefault,
  sansFontFamily,
  sansInput,
  terminalDefault,
  terminalFontFamily,
  terminalInput,
  useSettings,
} from "@/context/settings"
import { Link } from "../link"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

type ThemeOption = {
  id: string
  name: string
}

export const SettingsAppearanceV2: Component = () => {
  const theme = useTheme()
  const language = useLanguage()
  const settings = useSettings()

  onMount(() => {
    void theme.loadThemes()
  })

  const themeOptions = createMemo<ThemeOption[]>(() => theme.ids().map((id) => ({ id, name: theme.name(id) })))
  const colorSchemeOptions = createMemo((): { value: ColorScheme; label: string }[] => [
    { value: "system", label: language.t("theme.scheme.system") },
    { value: "light", label: language.t("theme.scheme.light") },
    { value: "dark", label: language.t("theme.scheme.dark") },
  ])

  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.appearance")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.row.colorScheme.title")}
          description={language.t("settings.general.row.colorScheme.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-color-scheme"
            options={colorSchemeOptions()}
            current={colorSchemeOptions().find((o) => o.value === theme.colorScheme())}
            placement="bottom-end"
            gutter={6}
            value={(o) => o.value}
            label={(o) => o.label}
            onSelect={(option) => option && theme.setColorScheme(option.value)}
          />
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.theme.title")}
          description={
            <>
              {language.t("settings.general.row.theme.description")}{" "}
              <Link class="settings-v2-link" href="https://zyraxonai.lovable.app/docs/themes/">
                {language.t("common.learnMore")}
              </Link>
            </>
          }
        >
          <SelectV2
            appearance="inline"
            data-action="settings-theme"
            options={themeOptions()}
            current={themeOptions().find((o) => o.id === theme.themeId())}
            placement="bottom-end"
            gutter={6}
            value={(o) => o.id}
            label={(o) => o.name}
            onSelect={(option) => {
              if (!option) return
              theme.setTheme(option.id)
            }}
          />
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.uiFont.title")}
          description={language.t("settings.general.row.uiFont.description")}
        >
          <div class="w-full sm:w-[220px]">
            <TextInputV2
              data-action="settings-ui-font"
              type="text"
              appearance="base"
              value={sansInput(settings.appearance.uiFont())}
              onInput={(event) => settings.appearance.setUIFont(event.currentTarget.value)}
              placeholder={sansDefault}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              aria-label={language.t("settings.general.row.uiFont.title")}
              style={{ "font-family": sansFontFamily(settings.appearance.uiFont()) }}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.font.title")}
          description={language.t("settings.general.row.font.description")}
        >
          <div class="w-full sm:w-[220px]">
            <TextInputV2
              data-action="settings-code-font"
              type="text"
              appearance="base"
              value={monoInput(settings.appearance.font())}
              onInput={(event) => settings.appearance.setFont(event.currentTarget.value)}
              placeholder={monoDefault}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              aria-label={language.t("settings.general.row.font.title")}
              style={{ "font-family": monoFontFamily(settings.appearance.font()) }}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.terminalFont.title")}
          description={language.t("settings.general.row.terminalFont.description")}
        >
          <div class="w-full sm:w-[220px]">
            <TextInputV2
              data-action="settings-terminal-font"
              type="text"
              appearance="base"
              value={terminalInput(settings.appearance.terminalFont())}
              onInput={(event) => settings.appearance.setTerminalFont(event.currentTarget.value)}
              placeholder={terminalDefault}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              aria-label={language.t("settings.general.row.terminalFont.title")}
              style={{ "font-family": terminalFontFamily(settings.appearance.terminalFont()) }}
            />
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}