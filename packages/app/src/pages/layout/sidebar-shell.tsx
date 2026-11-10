// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createEffect, createMemo, For, Show, type Accessor, type JSX } from "solid-js"
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  type DragEvent,
} from "@thisbeyond/solid-dnd"
import { ConstrainDragXAxis } from "@/utils/solid-dnd"
import { Icon } from "@zyraxon-ai/ui/icon"
import { IconButton } from "@zyraxon-ai/ui/icon-button"
import { Tooltip, TooltipKeybind } from "@zyraxon-ai/ui/tooltip"
import { SidebarStatus, toggleSidebarStatus } from "@/components/sidebar/sidebar-status"
import { type LocalProject } from "@/context/layout"
import { useTabs } from "@/context/tabs"
import { useLayout } from "@/context/layout"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { EditorModeToggle } from "./editor-mode-toggle"
import { SidebarSessionTabs } from "./sidebar-session-tabs"

export const SidebarContent = (props: {
  mobile?: boolean
  opened: Accessor<boolean>
  aimMove: (event: MouseEvent) => void
  onOpenSidebar: () => void
  onCloseSidebar: () => void
  projects: Accessor<LocalProject[]>
  renderProject: (project: LocalProject) => JSX.Element
  handleDragStart: (event: unknown) => void
  handleDragEnd: () => void
  handleDragOver: (event: DragEvent) => void
  openProjectLabel: JSX.Element
  openProjectKeybind: Accessor<string | undefined>
  onOpenProject: () => void
  renderProjectOverlay: () => JSX.Element
  settingsLabel: Accessor<string>
  settingsKeybind: Accessor<string | undefined>
  onOpenSettings: () => void
  statusLabel: Accessor<string>
  statusKeybind: Accessor<string | undefined>
  onToggleStatus: () => void
  helpLabel: Accessor<string>
  onOpenHelp: () => void
  renderPanel: () => JSX.Element
  editorDirectory?: Accessor<string>
}): JSX.Element => {
  const expanded = createMemo(() => !!props.mobile || props.opened())
  const placement = () => (props.mobile ? "bottom" : "right")
  const tabs = useTabs()
  const layout = useLayout()
  const command = useCommand()
  const language = useLanguage()
  const homeActive = () => layout.route().type === "home"
  const homeKeybind = () => command.keybind("home.toggle")
  const toggleHome = () => tabs.toggleHome({ home: homeActive() })
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let panel: HTMLDivElement | undefined

  createEffect(() => {
    const el = panel
    if (!el) return
    if (expanded()) {
      el.removeAttribute("inert")
      return
    }
    el.setAttribute("inert", "")
  })

  return (
    <div class="flex h-full w-full min-w-0 overflow-hidden">
      <div
        data-component="sidebar-rail"
        class="w-16 shrink-0 bg-background-base flex flex-col items-center overflow-hidden"
        onMouseMove={(e) => { props.aimMove(e); props.onOpenSidebar() }}
        onMouseEnter={() => {
          if (closeTimer) { clearTimeout(closeTimer); closeTimer = undefined }
          props.onOpenSidebar()
        }}
        onMouseLeave={() => {
          closeTimer = setTimeout(() => props.onCloseSidebar(), 400)
        }}
      >
        <div class="flex-1 min-h-0 w-full pt-2.5">
          <DragDropProvider
            onDragStart={props.handleDragStart}
            onDragEnd={props.handleDragEnd}
            onDragOver={props.handleDragOver}
            collisionDetector={closestCenter}
          >
            <DragDropSensors />
            <ConstrainDragXAxis />
            <div class="h-full w-full flex flex-col items-center gap-2 px-3 py-3 overflow-y-auto no-scrollbar">
              <SortableProvider ids={props.projects().map((p) => p.worktree)}>
                <For each={props.projects()}>{(project) => props.renderProject(project)}</For>
              </SortableProvider>

              <Tooltip
                placement={placement()}
                value={
                  <div class="flex items-center gap-2">
                    <span>{props.openProjectLabel}</span>
                    <Show when={!props.mobile && !!props.openProjectKeybind()}>
                      <span class="text-icon-base text-12-medium">{props.openProjectKeybind()}</span>
                    </Show>
                  </div>
                }
              >
                <IconButton
                  icon="zy-add"
                  variant="ghost"
                  size="large"
                  onClick={props.onOpenProject}
                  aria-label={typeof props.openProjectLabel === "string" ? props.openProjectLabel : undefined}
                />
              </Tooltip>
            </div>
            <DragOverlay>{props.renderProjectOverlay()}</DragOverlay>
          </DragDropProvider>
        </div>
        <div class="shrink-0 w-full pt-3 pb-6 flex flex-col items-center gap-1.5">
          <TooltipKeybind placement={placement()} title={props.statusLabel()} keybind={props.statusKeybind() ?? ""}>
            <IconButton
              icon="zy-status"
              variant="ghost"
              size="large"
              onClick={props.onToggleStatus}
              aria-label={props.statusLabel()}
            />
          </TooltipKeybind>
          <TooltipKeybind placement={placement()} title={props.settingsLabel()} keybind={props.settingsKeybind() ?? ""}>
            <IconButton
              icon="zy-settings"
              variant="ghost"
              size="large"
              onClick={props.onOpenSettings}
              aria-label={props.settingsLabel()}
            />
          </TooltipKeybind>
          <Tooltip placement={placement()} value={props.helpLabel()}>
            <IconButton
              icon="zy-help"
              variant="ghost"
              size="large"
              onClick={props.onOpenHelp}
              aria-label={props.helpLabel()}
            />
          </Tooltip>
        </div>
      </div>

      <div
        ref={(el) => {
          panel = el
        }}
        classList={{ "flex-1 flex h-full min-h-0 min-w-0 overflow-hidden": true, "pointer-events-none": !expanded() }}
        aria-hidden={!expanded()}
        onMouseEnter={() => { if (closeTimer) { clearTimeout(closeTimer); closeTimer = undefined } }}
        onMouseLeave={() => { closeTimer = setTimeout(() => props.onCloseSidebar(), 400) }}
      >
        <div class="flex h-full w-full min-w-0 flex-col">
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
              <Show when={!props.mobile && !!homeKeybind()}>
                <kbd class="sidebar-home-row-kbd">{homeKeybind()}</kbd>
              </Show>
            </button>
          </div>
          <div class="shrink-0 px-2.5 pt-2">
            <SidebarSessionTabs />
          </div>
          <div class="shrink-0 px-3 pt-2 pb-1">
            <EditorModeToggle directory={props.editorDirectory} />
          </div>
          <div class="min-h-0 min-w-0 flex-1 overflow-hidden">{props.renderPanel()}</div>
          <div class="shrink-0" data-component="sidebar-status-slot">
            <SidebarStatus mobile={props.mobile} />
          </div>
        </div>
      </div>
    </div>
  )
}
