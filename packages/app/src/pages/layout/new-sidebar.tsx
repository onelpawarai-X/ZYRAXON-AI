// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createMemo, Show, type JSX } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { IconButton } from "@zyraxon-ai/ui/icon-button"
import { Tooltip, TooltipKeybind } from "@zyraxon-ai/ui/tooltip"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useTabs } from "@/context/tabs"
import { useSettingsCommand } from "@/components/settings-dialog"
import { SidebarStatus, toggleSidebarStatus } from "@/components/sidebar/sidebar-status"
import { SidebarSessionTabs } from "./sidebar-session-tabs"

export function NewSidebarRail(): JSX.Element {
  const layout = useLayout()
  const command = useCommand()
  const language = useLanguage()
  const tabs = useTabs()
  const platform = usePlatform()
  const openSettings = useSettingsCommand()

  const expanded = createMemo(() => layout.sidebar.opened())
  const placement = () => "right"
  const homeActive = () => layout.route().type === "home"
  const homeKeybind = () => command.keybind("home.toggle")
  const toggleHome = () => tabs.toggleHome({ home: homeActive() })
  const openSidebar = () => layout.sidebar.open()
  const closeSidebar = () => layout.sidebar.close()

  let closeTimer: ReturnType<typeof setTimeout> | undefined

  return (
    <div class="flex h-full w-full min-w-0 overflow-hidden">
      <div
        data-component="sidebar-rail"
        class="w-16 shrink-0 bg-background-base flex flex-col items-center overflow-hidden"
        onMouseEnter={() => {
          if (closeTimer) {
            clearTimeout(closeTimer)
            closeTimer = undefined
          }
          openSidebar()
        }}
        onMouseLeave={() => {
          closeTimer = setTimeout(closeSidebar, 400)
        }}
      >
        <div class="flex-1 min-h-0 w-full pt-2.5">
          <div class="h-full w-full flex flex-col items-center gap-2 px-3 py-3 overflow-y-auto no-scrollbar">
            <Tooltip placement={placement()} value={language.t("sidebar.sessions")}>
              <IconButton icon="zy-sessions" variant="ghost" size="large" onClick={openSidebar} aria-label={language.t("sidebar.sessions")} />
            </Tooltip>
          </div>
        </div>
        <div class="shrink-0 w-full pt-3 pb-6 flex flex-col items-center gap-1.5">
          <TooltipKeybind placement={placement()} title={language.t("command.status.toggle")} keybind={command.keybind("status.toggle") ?? ""}>
            <IconButton icon="zy-status" variant="ghost" size="large" onClick={toggleSidebarStatus} aria-label={language.t("command.status.toggle")} />
          </TooltipKeybind>
          <TooltipKeybind placement={placement()} title={language.t("sidebar.settings")} keybind={command.keybind("settings.open") ?? ""}>
            <IconButton icon="zy-settings" variant="ghost" size="large" onClick={() => openSettings()} aria-label={language.t("sidebar.settings")} />
          </TooltipKeybind>
          <Tooltip placement={placement()} value={language.t("sidebar.help")}>
            <IconButton icon="zy-help" variant="ghost" size="large" onClick={() => platform.openLink("https://zyraxonai.lovable.app/desktop-feedback")} aria-label={language.t("sidebar.help")} />
          </Tooltip>
        </div>
      </div>

      <div
        classList={{
          "flex flex-col h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width]":
            true,
          "w-72 border-l border-border-weak-base bg-background-base": expanded(),
          "w-0 border-l-0 pointer-events-none": !expanded(),
        }}
        aria-hidden={!expanded()}
        onMouseEnter={() => {
          if (closeTimer) {
            clearTimeout(closeTimer)
            closeTimer = undefined
          }
          openSidebar()
        }}
        onMouseLeave={() => {
          closeTimer = setTimeout(closeSidebar, 400)
        }}
      >
        <div class="shrink-0 px-3 pt-3 pb-1">
          <button
            type="button"
            class="sidebar-home-row"
            data-active={homeActive()}
            aria-pressed={homeActive()}
            onClick={toggleHome}
          >
            <Icon name="zy-home" size="small" class="sidebar-home-row-icon" />
            <span class="sidebar-home-row-label">{language.t("home.title")}</span>
            <Show when={!!homeKeybind()}>
              <kbd class="sidebar-home-row-kbd">{homeKeybind()}</kbd>
            </Show>
          </button>
        </div>
        <div class="shrink-0 px-2.5 pt-2">
          <SidebarSessionTabs />
        </div>
        <div class="min-h-0 min-w-0 flex-1" />
        <div class="shrink-0" data-component="sidebar-status-slot">
          <SidebarStatus />
        </div>
      </div>
    </div>
  )
}