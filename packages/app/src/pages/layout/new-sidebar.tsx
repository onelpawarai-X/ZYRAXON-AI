// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createMemo, onCleanup, onMount, Show, type JSX } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useTabs } from "@/context/tabs"
import { SidebarSessionTabs } from "./sidebar-session-tabs"
import { setSidebarPinned, sidebarPinned } from "./sidebar-pin"

export function NewSidebarRail(): JSX.Element {
  const layout = useLayout()
  const command = useCommand()
  const language = useLanguage()
  const tabs = useTabs()

  const expanded = createMemo(() => layout.sidebar.opened())
  const pinned = sidebarPinned
  const homeActive = () => layout.route().type === "home"
  const homeKeybind = () => command.keybind("home.toggle")
  const toggleHome = () => tabs.toggleHome({ home: homeActive() })

  let closeTimer: ReturnType<typeof setTimeout> | undefined

  const open = () => {
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = undefined
    }
    layout.sidebar.open()
  }

  // The sidebar is hidden until the pointer reaches the left edge. A global
  // listener rather than a hover strip keeps the reveal working even when the
  // pointer crosses the boundary quickly.
  const scheduleClose = () => {
    if (pinned()) return
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(() => layout.sidebar.close(), 320)
  }

  onMount(() => {
    const onMove = (event: MouseEvent) => {
      if (event.clientX <= 6) open()
    }
    window.addEventListener("mousemove", onMove)
    onCleanup(() => window.removeEventListener("mousemove", onMove))
  })

  onCleanup(() => {
    if (closeTimer) clearTimeout(closeTimer)
  })

  return (
    <div class="flex h-full min-w-0 shrink-0 overflow-hidden">
      <div data-component="sidebar-rail" class="w-0 shrink-0" aria-hidden="true" />
      <div
        classList={{
          "flex flex-col h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width]":
            true,
          "w-72 border-r border-border-weak-base bg-background-base": expanded(),
          "w-0 border-r-0 pointer-events-none": !expanded(),
        }}
        aria-hidden={!expanded()}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
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
      </div>
    </div>
  )
}

export { setSidebarPinned, sidebarPinned }
