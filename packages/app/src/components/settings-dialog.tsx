// Copyright (c) 2026 onelpawarai. All rights reserved.

import { useDialog } from "@zyraxon-ai/ui/context/dialog"
import { useParams } from "@solidjs/router"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { DialogSettings } from "@/components/settings-v2/dialog-settings-v2"

/**
 * Settings is a sheet over whatever the user was doing rather than a route:
 * opening it leaves the session behind exactly as it was, and Escape or the
 * close button puts it back. The default section travels with the caller so a
 * button can open straight to one surface, and the session that opened it is
 * carried along so the general panel can still resolve its permission mode.
 */
export function useSettingsDialog(defaultValue?: string) {
  const dialog = useDialog()
  const params = useParams<{ id?: string }>()

  return (section?: string) => {
    void dialog.show(() => <DialogSettings sessionID={params.id} defaultValue={section ?? defaultValue} />)
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