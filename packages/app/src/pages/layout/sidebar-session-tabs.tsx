// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createEffect, createMemo, createResource, For, Show } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { Icon as IconV2 } from "@zyraxon-ai/ui/v2/icon"
import { tabKey, useTabs, type SessionTab, type Tab } from "@/context/tabs"
import { useLayout, type LayoutRoute } from "@/context/layout"
import { useGlobal } from "@/context/global"
import { ServerConnection, useServer } from "@/context/server"
import { useLanguage } from "@/context/language"
import { useCommand } from "@/context/command"
import { createTabPromptState } from "@/context/prompt"
import { useDialog } from "@zyraxon-ai/ui/context/dialog"
import { IconButtonV2 } from "@zyraxon-ai/ui/v2/icon-button-v2"
import { DialogCommandPaletteV2 } from "@/components/dialog-command-palette-v2"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"
import { base64Encode } from "@zyraxon-ai/core/util/encode"
import "./sidebar-session-tabs.css"

function matchRouteTab(route: LayoutRoute, tabs: Tab[], session: { parentID?: string } | null | void) {
  if (route.type === "home") return
  if (route.type === "draft") {
    return tabs.find((item) => item.type === "draft" && item.draftID === route.draftID)
  }
  if (route.type === "session") {
    const main = tabs.find(
      (item) =>
        item.type === "session" && item.server === route.server && item.sessionId === route.sessionId,
    )
    if (main) return main
    if (session?.parentID) {
      return tabs.find(
        (item) =>
          item.type === "session" && item.server === route.server && item.sessionId === session.parentID,
      )
    }
  }
}

function useRouteSession() {
  const layout = useLayout()
  const global = useGlobal()
  const server = useServer()
  const route = () => layout.route()
  const [session] = createResource(
    () => {
      const value = route()
      if (value.type !== "session") return undefined
      const conn = global.servers
        .list()
        .find((item) => ServerConnection.key(item) === (value.server ?? server.key))
      return conn ? { route: value, sdk: global.ensureServerCtx(conn).sdk } : undefined
    },
    ({ route: value, sdk }) => sdk.client.session.get({ sessionID: value.sessionId }).then((x) => x.data).catch(() => {}),
  )
  return { route, session }
}

export function SidebarSessionTabs() {
  const tabs = useTabs()
  const language = useLanguage()
  const dialog = useDialog()
  const { route, session } = useRouteSession()
  const currentTab = createMemo(() => matchRouteTab(route(), tabs.store, session()))

  return (
    <div class="session-dock" role="group" aria-label={language.t("sidebar.sessions")} data-component="session-dock">
      <div class="session-dock-inner">
        <div class="session-dock-scan" aria-hidden="true" />
        <div class="session-dock-header">
          <Icon name="zy-sessions" size="small" class="session-dock-header-icon" />
          <span class="session-dock-title">{language.t("sidebar.sessions")}</span>
          <TooltipV2 placement="bottom" value="Universal search">
            <IconButtonV2
              type="button"
              variant="ghost-muted"
              size="small"
              class="ml-auto !w-6 !h-6"
              icon={<IconV2 name="magnifying-glass" size="small" />}
              onClick={() => dialog.show(() => <DialogCommandPaletteV2 />)}
              aria-label="Universal search"
            />
          </TooltipV2>
          <span class="session-dock-count" aria-hidden="true">
            {tabs.store.length}
          </span>
        </div>
        <div class="session-scroll-wrap">
          <div class="session-scroll-fade session-scroll-fade-top" aria-hidden="true" />
          <div class="session-scroll">
            <Show
              when={tabs.store.length > 0}
              fallback={
                <div class="session-empty">
                  <Icon name="zy-sessions" size="large" class="session-empty-icon" />
                  <p>{language.t("sidebar.sessions.empty")}</p>
                  <span>Ctrl+1 – Ctrl+9</span>
                </div>
              }
            >
              <For each={tabs.store}>
                {(tab, index) =>
                  tab.type === "session" ? (
                    <SessionRow tab={tab} index={index} active={() => currentTab() === tab} />
                  ) : (
                    <DraftRow tab={tab as Extract<Tab, { type: "draft" }>} index={index} active={() => currentTab() === tab} />
                  )
                }
              </For>
            </Show>
          </div>
          <div class="session-scroll-fade session-scroll-fade-bottom" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

function rowKey(tab: Tab) {
  return tabKey(tab)
}

function SessionRow(props: { tab: SessionTab; index: () => number; active: () => boolean }) {
  const tabs = useTabs()
  const global = useGlobal()
  const language = useLanguage()
  const command = useCommand()

  const serverCtx = createMemo(() => {
    const conn = global.servers.list().find((item) => ServerConnection.key(item) === props.tab.server)
    return conn ? global.ensureServerCtx(conn) : undefined
  })
  const sdk = createMemo(() => serverCtx()?.sdk ?? null)
  const cachedSession = createMemo(() => serverCtx()?.sync.session.peek(props.tab.sessionId))
  const persisted = createMemo(() => tabs.info[rowKey(props.tab)])
  const [loadedSession] = createResource(
    () => {
      const ctx = serverCtx()
      return ctx ? { id: props.tab.sessionId, ctx } : null
    },
    ({ id, ctx }) => ctx.sync.session.resolve(id).catch(() => undefined),
  )
  const session = createMemo(() => cachedSession() ?? loadedSession())
  const missingSession = createMemo(() => !!serverCtx() && !loadedSession.loading && !session())
  const title = () =>
    session()?.title ??
    persisted()?.title ??
    (missingSession() ? language.t("session.tab.unknown") : language.t("common.loading"))

  createEffect(() => {
    const value = session()
    if (!value) return
    tabs.rememberSessionInfo(props.tab, value)
    const current = sdk()
    if (!current) return
    createTabPromptState(tabs, props.tab, current.scope, {
      dir: base64Encode(value.directory),
      id: value.id,
    })
  })

  const activate = () => tabs.select(props.tab)

  command.register(() => {
    const number = props.index() + 1
    if (number > 9) return []
    return [
      {
        id: `tab.${number}`,
        category: "tab",
        title: "",
        keybind: `mod+${number}`,
        hidden: true,
        onSelect: activate,
      },
    ]
  })

  const close = () => {
    const current = tabKey(props.tab)
    const index = tabs.store.findIndex((item) => tabKey(item) === current)
    if (index !== -1) tabs.closeTab(index)
  }

  return (
    <div class="session-item" data-active={props.active()}>
      <button
        type="button"
        class="session-item-main"
        onClick={activate}
        aria-current={props.active() ? "true" : undefined}
        title={title()}
      >
        <span class="session-item-rail" aria-hidden="true" />
        <Icon name="zy-sessions" size="small" class="session-item-icon" />
        <span class="session-item-text">{title()}</span>
        <kbd class="session-item-kbd">{props.index() + 1}</kbd>
      </button>
      <button
        type="button"
        class="session-item-close"
        aria-label={language.t("command.tab.close")}
        title={language.t("command.tab.close")}
        onClick={close}
      >
        <IconV2 name="xmark-small" size="small" />
      </button>
    </div>
  )
}

function DraftRow(props: { tab: Extract<Tab, { type: "draft" }>; index: () => number; active: () => boolean }) {
  const tabs = useTabs()
  const language = useLanguage()
  const command = useCommand()
  const title = () => language.t("command.session.new")
  const activate = () => tabs.select(props.tab)

  command.register(() => {
    const number = props.index() + 1
    if (number > 9) return []
    return [
      {
        id: `tab.${number}`,
        category: "tab",
        title: "",
        keybind: `mod+${number}`,
        hidden: true,
        onSelect: activate,
      },
    ]
  })

  const close = () => {
    const current = tabKey(props.tab)
    const index = tabs.store.findIndex((item) => tabKey(item) === current)
    if (index !== -1) tabs.closeTab(index)
  }

  return (
    <div class="session-item" data-active={props.active()}>
      <button
        type="button"
        class="session-item-main"
        onClick={activate}
        aria-current={props.active() ? "true" : undefined}
        title={title()}
      >
        <span class="session-item-rail" aria-hidden="true" />
        <IconV2 name="edit" size="small" class="session-item-icon" />
        <span class="session-item-text">{title()}</span>
        <kbd class="session-item-kbd">{props.index() + 1}</kbd>
      </button>
      <button
        type="button"
        class="session-item-close"
        aria-label={language.t("command.tab.close")}
        title={language.t("command.tab.close")}
        onClick={close}
      >
        <IconV2 name="xmark-small" size="small" />
      </button>
    </div>
  )
}
