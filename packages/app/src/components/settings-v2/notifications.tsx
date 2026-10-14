// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component } from "solid-js"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { SelectV2 } from "@zyraxon-ai/ui/v2/select-v2"
import { Switch } from "@zyraxon-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { LANGUAGES } from "@/i18n/languages"
import { useSettings } from "@/context/settings"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

function NotificationsSection() {
  const language = useLanguage()
  const settings = useSettings()

  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.notifications")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.notifications.agent.title")}
          description={language.t("settings.general.notifications.agent.description")}
        >
          <div data-action="settings-notifications-agent">
            <Switch
              checked={settings.notifications.agent()}
              onChange={(checked) => settings.notifications.setAgent(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.notifications.permissions.title")}
          description={language.t("settings.general.notifications.permissions.description")}
        >
          <div data-action="settings-notifications-permissions">
            <Switch
              checked={settings.notifications.permissions()}
              onChange={(checked) => settings.notifications.setPermissions(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.notifications.errors.title")}
          description={language.t("settings.general.notifications.errors.description")}
        >
          <div data-action="settings-notifications-errors">
            <Switch
              checked={settings.notifications.errors()}
              onChange={(checked) => settings.notifications.setErrors(checked)}
            />
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}

function VoiceSection() {
  const language = useLanguage()
  const settings = useSettings()

  const languages = [
    { id: "auto", value: "auto", label: language.t("settings.voice.language.auto") },
    ...LANGUAGES.map((entry) => ({
      id: entry.code,
      value: entry.code === "zht" ? "zh-TW" : entry.code,
      label: `${entry.native} — ${entry.english}`,
    })),
  ]

  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.voice.section")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.voice.realtime.title")}
          description={language.t("settings.voice.realtime.description")}
        >
          <div data-action="settings-voice-realtime">
            <Switch
              checked={settings.general.voiceRealtime()}
              onChange={(checked) => settings.general.setVoiceRealtime(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.voice.autoSpeak.title")}
          description={language.t("settings.voice.autoSpeak.description")}
        >
          <div data-action="settings-voice-auto-speak">
            <Switch
              checked={settings.general.voiceAutoSpeak()}
              onChange={(checked) => {
                settings.general.setVoiceAutoSpeak(checked)
                try {
                  ;(window as any).api?.voiceTTSEnabled?.(checked)
                } catch {}
              }}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.voice.gender.title")}
          description={language.t("settings.voice.gender.description")}
        >
          <div data-action="settings-voice-gender" class="flex gap-2">
            <ButtonV2
              size="normal"
              variant={settings.general.voiceGender() === "male" ? "contrast" : "neutral"}
              onClick={() => {
                settings.general.setVoiceGender("male")
                try {
                  ;(window as any).api?.voiceSetGender?.("male")
                } catch {}
              }}
            >
              {language.t("settings.voice.gender.male")}
            </ButtonV2>
            <ButtonV2
              size="normal"
              variant={settings.general.voiceGender() === "female" ? "contrast" : "neutral"}
              onClick={() => {
                settings.general.setVoiceGender("female")
                try {
                  ;(window as any).api?.voiceSetGender?.("female")
                } catch {}
              }}
            >
              {language.t("settings.voice.gender.female")}
            </ButtonV2>
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.voice.language.title")}
          description={language.t("settings.voice.language.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-voice-language"
            options={languages}
            current={languages.find((o) => o.value === settings.general.voiceLanguage()) ?? languages[0]}
            value={(o) => o.value}
            label={(o) => o.label}
            onSelect={(option) => {
              if (!option) return
              settings.general.setVoiceLanguage(option.value)
              try {
                ;(window as any).api?.voiceSetLanguage?.(option.value)
              } catch {}
            }}
            placement="bottom-end"
            gutter={6}
          />
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.voice.test.title")}
          description={language.t("settings.voice.test.description")}
        >
          <ButtonV2
            size="normal"
            variant="neutral"
            onClick={() => {
              try {
                const lang = settings.general.voiceLanguage()?.split("-")[0] || "en"
                const testText = language.t("settings.voice.test.sentence")
                void lang
                ;(window as any).api?.voiceTTSSpeak?.(testText)
              } catch (e) {
                console.error("[TTS-TEST] Failed:", e)
              }
            }}
          >
            {language.t("settings.voice.test.button")}
          </ButtonV2>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}

export const SettingsNotificationsV2: Component = () => {
  return (
    <>
      <NotificationsSection />
      <VoiceSection />
    </>
  )
}