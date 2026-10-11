// Copyright (c) 2026 onelpawarai. All rights reserved.

import { useNavigate } from "@solidjs/router"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { useLayout } from "@/context/layout"
import { useSettingsDialog } from "@/components/settings-dialog"

/**
 * Shortcuts that belong to the app rather than to one session: jumping
 * straight to a settings surface, folding the sidebar away, and starting a new
 * session. Anything already claimed elsewhere in the app is deliberately left
 * alone so nothing silently steals an existing binding.
 */
export function useAppShortcuts() {
  const command = useCommand()
  const language = useLanguage()
  const settings = useSettings()
  const layout = useLayout()
  const navigate = useNavigate()
  // Settings is a sheet over the app, so a shortcut opens that sheet rather than
  // pushing a route and losing whatever the user was looking at.
  const openSettings = useSettingsDialog()

  command.register("app-shortcuts", () => [
    {
      id: "app.goto.home",
      title: language.t("shortcut.goto.home"),
      category: language.t("command.category.workspace"),
      keybind: "mod+shift+h",
      onSelect: () => navigate("/"),
    },
    {
      id: "app.goto.settings",
      title: language.t("shortcut.goto.settings"),
      category: language.t("command.category.settings"),
      keybind: "mod+shift+k",
      onSelect: () => openSettings("general"),
    },
    {
      id: "app.goto.language",
      title: language.t("shortcut.goto.language"),
      category: language.t("command.category.language"),
      keybind: "mod+shift+g",
      onSelect: () => openSettings("language"),
    },
    {
      id: "app.goto.extensions",
      title: language.t("shortcut.goto.extensions"),
      category: language.t("command.category.mcp"),
      keybind: "mod+shift+e",
      onSelect: () => openSettings("extensions"),
    },
    {
      id: "app.goto.storage",
      title: language.t("shortcut.goto.storage"),
      category: language.t("command.category.settings"),
      keybind: "mod+shift+d",
      onSelect: () => openSettings("storage"),
    },
    {
      id: "app.goto.agents",
      title: language.t("shortcut.goto.agents"),
      category: language.t("command.category.agent"),
      keybind: "mod+shift+a",
      onSelect: () => openSettings("agents"),
    },
    {
      id: "app.goto.providers",
      title: language.t("shortcut.goto.providers"),
      category: language.t("command.category.provider"),
      keybind: "mod+shift+v",
      onSelect: () => openSettings("providers"),
    },
    {
      id: "app.goto.models",
      title: language.t("shortcut.goto.models"),
      category: language.t("command.category.model"),
      keybind: "mod+shift+y",
      onSelect: () => openSettings("models"),
    },
    {
      id: "app.goto.servers",
      title: language.t("shortcut.goto.servers"),
      category: language.t("command.category.server"),
      keybind: "mod+shift+b",
      onSelect: () => openSettings("servers"),
    },
    {
      id: "app.goto.appearance",
      title: language.t("shortcut.goto.appearance"),
      category: language.t("command.category.theme"),
      keybind: "mod+shift+t",
      onSelect: () => openSettings("appearance"),
    },
    {
      id: "app.goto.notifications",
      title: language.t("shortcut.goto.notifications"),
      category: language.t("command.category.settings"),
      keybind: "mod+shift+j",
      onSelect: () => openSettings("notifications"),
    },
    {
      id: "app.goto.shortcuts",
      title: language.t("shortcut.goto.shortcuts"),
      category: language.t("command.category.settings"),
      keybind: "mod+slash",
      onSelect: () => openSettings("shortcuts"),
    },
    {
      id: "app.toggle.sidebar",
      title: language.t("shortcut.toggle.sidebar"),
      category: language.t("command.category.workspace"),
      keybind: "mod+b",
      onSelect: () => layout.sidebar.toggle(),
    },
    {
      id: "app.new.session",
      title: language.t("shortcut.new.session"),
      category: language.t("command.category.session"),
      keybind: "mod+shift+enter",
      onSelect: () => navigate("/new-session"),
    },
    {
      id: "app.toggle.navigation",
      title: language.t("shortcut.toggle.navigation"),
      category: language.t("command.category.settings"),
      keybind: "mod+shift+u",
      onSelect: () => settings.general.setShowNavigation(!settings.general.showNavigation()),
    },
    {
      id: "app.copy.last",
      title: language.t("shortcut.copy.last"),
      category: language.t("command.category.session"),
      keybind: "mod+shift+c",
      onSelect: () => void copyLastMessage(),
    },
  ])
}

async function copyLastMessage() {
  if (typeof document === "undefined") return
  const blocks = document.querySelectorAll("[data-message-text]")
  const last = blocks[blocks.length - 1]
  if (last?.textContent) await navigator.clipboard.writeText(last.textContent)
}