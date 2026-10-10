// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component } from "solid-js"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { SelectV2 } from "@zyraxon-ai/ui/v2/select-v2"
import { Switch } from "@zyraxon-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
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
    { id: "auto", value: "auto", label: "Auto-detect" },
    { id: "bn", value: "bn-BD", label: "Bengali" },
    { id: "hi", value: "hi-IN", label: "Hindi" },
    { id: "en-us", value: "en-US", label: "English (US)" },
    { id: "en-gb", value: "en-GB", label: "English (UK)" },
    { id: "en-in", value: "en-IN", label: "English (India)" },
    { id: "ar", value: "ar-SA", label: "Arabic" },
    { id: "es", value: "es-ES", label: "Spanish" },
    { id: "fr", value: "fr-FR", label: "French" },
    { id: "de", value: "de-DE", label: "German" },
    { id: "pt", value: "pt-BR", label: "Portuguese" },
    { id: "ru", value: "ru-RU", label: "Russian" },
    { id: "ja", value: "ja-JP", label: "Japanese" },
    { id: "ko", value: "ko-KR", label: "Korean" },
    { id: "zh-cn", value: "zh-CN", label: "Chinese (Simplified)" },
    { id: "zh-tw", value: "zh-TW", label: "Chinese (Traditional)" },
    { id: "vi", value: "vi-VN", label: "Vietnamese" },
    { id: "it", value: "it-IT", label: "Italian" },
    { id: "th", value: "th-TH", label: "Thai" },
    { id: "tr", value: "tr-TR", label: "Turkish" },
    { id: "pl", value: "pl-PL", label: "Polish" },
    { id: "nl", value: "nl-NL", label: "Dutch" },
    { id: "uk", value: "uk-UA", label: "Ukrainian" },
    { id: "sv", value: "sv-SE", label: "Swedish" },
    { id: "da", value: "da-DK", label: "Danish" },
    { id: "fi", value: "fi-FI", label: "Finnish" },
    { id: "no", value: "nb-NO", label: "Norwegian" },
    { id: "cs", value: "cs-CZ", label: "Czech" },
    { id: "ro", value: "ro-RO", label: "Romanian" },
    { id: "el", value: "el-GR", label: "Greek" },
    { id: "he", value: "he-IL", label: "Hebrew" },
    { id: "hu", value: "hu-HU", label: "Hungarian" },
    { id: "id", value: "id-ID", label: "Indonesian" },
    { id: "ms", value: "ms-MY", label: "Malay" },
    { id: "ta", value: "ta-IN", label: "Tamil" },
    { id: "te", value: "te-IN", label: "Telugu" },
    { id: "ur", value: "ur-PK", label: "Urdu" },
    { id: "fa", value: "fa-IR", label: "Persian" },
    { id: "mr", value: "mr-IN", label: "Marathi" },
    { id: "gu", value: "gu-IN", label: "Gujarati" },
    { id: "kn", value: "kn-IN", label: "Kannada" },
    { id: "ml", value: "ml-IN", label: "Malayalam" },
    { id: "af", value: "af-ZA", label: "Afrikaans" },
  ]

  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">Voice &amp; TTS</h3>

      <SettingsListV2>
        <SettingsRowV2
          title="Real-time voice with the model"
          description="Talk directly to the selected model — it listens and answers in the same breath. Turning this on stops the separate TTS voice, because hearing both at once overlaps them."
        >
          <div data-action="settings-voice-realtime">
            <Switch
              checked={settings.general.voiceRealtime()}
              onChange={(checked) => settings.general.setVoiceRealtime(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title="Auto-speak responses"
          description="AI responses are spoken aloud by the built-in voice"
        >
          <div data-action="settings-voice-auto-speak">
            <Switch
              checked={settings.general.voiceAutoSpeak()}
              disabled={settings.general.voiceRealtime()}
              onChange={(checked) => {
                // The switch is unavailable while the model is talking live, so this only
                // ever runs with realtime off — where it is meaningful.
                if (settings.general.voiceRealtime()) return
                settings.general.setVoiceAutoSpeak(checked)
                try {
                  ;(window as any).api?.voiceTTSEnabled?.(checked)
                } catch {}
              }}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2 title="Voice gender" description="Select male or female voice for TTS output">
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
              Male
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
              Female
            </ButtonV2>
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title="Voice language"
          description="Language for speech recognition and TTS"
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
          title="Test TTS"
          description="Play a test sentence to verify text-to-speech is working"
        >
          <ButtonV2
            size="normal"
            variant="neutral"
            onClick={() => {
              try {
                const lang = settings.general.voiceLanguage()?.split("-")[0] || "en"
                const testText =
                  lang === "bn"
                    ? "হ্যালো! আমি ZYRAXON AI। আমি আপনার সাথে কথা বলতে পারি।"
                    : lang === "hi"
                      ? "नमस्ते! मैं ZYRAXON AI हूँ। मैं आपसे बात कर सकता हूँ।"
                      : "Hello! I am ZYRAXON AI. I can speak to you."
                ;(window as any).api?.voiceTTSSpeak?.(testText)
              } catch (e) {
                console.error("[TTS-TEST] Failed:", e)
              }
            }}
          >
            Test Voice
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