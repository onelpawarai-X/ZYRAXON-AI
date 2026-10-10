// Copyright (c) 2026 onelpawarai. All rights reserved.

import { useNavigate, useParams } from "@solidjs/router"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"

export function settingsHref(section?: string, sessionID?: string) {
  const target = section ? `/settings/${section}` : "/settings"
  return sessionID ? `${target}?session=${encodeURIComponent(sessionID)}` : target
}

// Settings is a full page inside the app shell, so opening it is a route change. The
// optional default section is kept in the path, and the session that opened it travels
// along so the general panel still resolves permission mode for that session.
export function useSettingsDialog(defaultValue?: string) {
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()

  return () => {
    navigate(settingsHref(defaultValue, params.id))
  }
}

export function useSettingsCommand() {
  const command = useCommand()
  const language = useLanguage()
  const show = useSettingsDialog()

  command.register("settings", () => [
    {
      id: "settings.open",
      title: language.t("command.settings.open"),
      category: language.t("command.category.settings"),
      keybind: "mod+comma",
      onSelect: show,
    },
  ])

  return show
}