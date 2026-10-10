// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Button } from "@zyraxon-ai/ui/button"
import { Icon } from "@zyraxon-ai/ui/icon"
import { Tabs } from "@zyraxon-ai/ui/tabs"
import { TooltipKeybind } from "@zyraxon-ai/ui/tooltip"
import { KeybindV2 } from "@zyraxon-ai/ui/v2/keybind-v2"
import { useParams } from "@solidjs/router"
import { createMemo, createSignal, For, Show, type Accessor } from "solid-js"
import { formatKeybindParts, useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"
import { useSync, type DirectorySync } from "@/context/sync"
import { SessionRouteKey, SessionStateKey } from "@/utils/server-scope"

export const SIDEBAR_STATUS_KEYBIND = "mod+x"

// The collapse state lives at module scope, not inside the component, because the mod+x
// command is registered by the session view commands and has to reach this toggle from
// outside the sidebar subtree.
const [sidebarStatusCollapsed, setSidebarStatusCollapsed] = createSignal(false)

export function useSidebarStatusCollapsed(): Accessor<boolean> {
  return sidebarStatusCollapsed
}

export function toggleSidebarStatus(): void {
  setSidebarStatusCollapsed((prev) => !prev)
}

// Shared with the settings MCP and plugins panels so both surfaces read the same
// directory-scoped sources. The sync accessor is passed in because the sidebar already
// has a directory SDK context, while the settings page resolves one from the layout.
export function useServiceStatus(sync: Accessor<DirectorySync | undefined>) {
  const mcpNames = createMemo(() => Object.keys(sync()?.data.mcp ?? {}).sort((a, b) => a.localeCompare(b)))
  const mcpStatus = (name: string) => sync()?.data.mcp?.[name]?.status
  const mcpConnected = createMemo(() => mcpNames().filter((name) => mcpStatus(name) === "connected").length)
  const lspItems = createMemo(() => sync()?.data.lsp ?? [])
  const plugins = createMemo(() =>
    (sync()?.data.config.plugin ?? []).map((item) => (typeof item === "string" ? item : item[0])),
  )

  return { mcpNames, mcpStatus, mcpConnected, lspItems, plugins }
}

export function ServiceStatusDot(props: { status?: string }) {
  return (
    <div
      classList={{
        "size-1.5 rounded-full shrink-0": true,
        "bg-icon-success-base": props.status === "connected",
        "bg-icon-critical-base": props.status === "failed" || props.status === "error",
        "bg-border-weak-base": props.status === "disabled",
        "bg-icon-warning-base":
          props.status === "needs_auth" || props.status === "needs_client_registration",
      }}
    />
  )
}

export function SidebarStatus(props: { mobile?: boolean }) {
  const language = useLanguage()
  const service = useServiceStatus(useSync())
  const settings = useSettings()
  const expanded = createMemo(() => !sidebarStatusCollapsed())

  // Same sources as StatusPopoverBody so both surfaces stay in sync.
  const lspCount = createMemo(() => service.lspItems().length)
  const pluginCount = createMemo(() => service.plugins().length)

  const summary = createMemo(
    () =>
      `${language.t("status.popover.tab.mcp")} ${service.mcpConnected()}/${service.mcpNames().length} · ` +
      `${language.t("status.popover.tab.lsp")} ${lspCount()} · ` +
      `${language.t("status.popover.tab.plugins")} ${pluginCount()}`,
  )

  return (
    <div class="px-2 py-2 border-t border-border-weak-base flex flex-col gap-1" data-component="sidebar-status">
      <Show when={settings.visibility.status()}>
        <Button
          type="button"
          variant="ghost"
          class="w-full justify-start gap-1.5 px-2 h-7 text-11-medium text-text-base"
          aria-expanded={expanded()}
          aria-label={language.t("command.status.toggle")}
          onClick={toggleSidebarStatus}
        >
          <span class="shrink-0">X</span>
          <KeybindV2 keys={formatKeybindParts(SIDEBAR_STATUS_KEYBIND, language.t)} variant="neutral" />
          <Show
            when={expanded()}
            fallback={<span class="truncate text-text-weak">{summary()}</span>}
          >
            <span class="flex-1 text-left truncate">{language.t("status.popover.trigger")}</span>
          </Show>
          <Icon
            name={expanded() ? "chevron-down" : "chevron-right"}
            size="small"
            class="text-icon-weak shrink-0"
          />
        </Button>
        <Show when={expanded()}>
          <Tabs
            aria-label={language.t("status.popover.ariaLabel")}
            class="tabs bg-background-base rounded-md overflow-hidden"
            data-component="tabs"
            data-active="mcp"
            defaultValue="mcp"
            variant="alt"
          >
            <Tabs.List data-slot="tablist" class="bg-transparent border-b-0 px-2 pt-1 pb-0 gap-2 h-8">
              <Tabs.Trigger value="mcp" data-slot="tab" class="text-11-regular">
                {service.mcpConnected() > 0 ? `${service.mcpConnected()}/${service.mcpNames().length} ` : ""}
                {language.t("status.popover.tab.mcp")}
              </Tabs.Trigger>
              <Tabs.Trigger value="lsp" data-slot="tab" class="text-11-regular">
                {lspCount() > 0 ? `${lspCount()} ` : ""}
                {language.t("status.popover.tab.lsp")}
              </Tabs.Trigger>
              <Tabs.Trigger value="plugins" data-slot="tab" class="text-11-regular">
                {pluginCount() > 0 ? `${pluginCount()} ` : ""}
                {language.t("status.popover.tab.plugins")}
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="mcp">
              <div class="flex flex-col px-2 pt-1 pb-2">
                <div class="flex flex-col p-2 bg-background-base rounded-sm max-h-[200px] overflow-y-auto min-h-12">
                  <Show
                    when={service.mcpNames().length > 0}
                    fallback={
                      <div class="text-12-regular text-text-base text-center my-auto">
                        {language.t("dialog.mcp.empty")}
                      </div>
                    }
                  >
                    <For each={service.mcpNames()}>
                      {(name) => (
                        <div class="flex items-center gap-2 w-full px-1 py-1">
                          <ServiceStatusDot status={service.mcpStatus(name)} />
                          <span class="text-12-regular text-text-base truncate">{name}</span>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </div>
            </Tabs.Content>

            <Tabs.Content value="lsp">
              <div class="flex flex-col px-2 pt-1 pb-2">
                <div class="flex flex-col p-2 bg-background-base rounded-sm max-h-[200px] overflow-y-auto min-h-12">
                  <Show
                    when={service.lspItems().length > 0}
                    fallback={
                      <div class="text-12-regular text-text-base text-center my-auto">
                        {language.t("dialog.lsp.empty")}
                      </div>
                    }
                  >
                    <For each={service.lspItems()}>
                      {(item) => (
                        <div class="flex items-center gap-2 w-full px-1 py-1">
                          <ServiceStatusDot status={item.status} />
                          <span class="text-12-regular text-text-base truncate">{item.name || item.id}</span>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </div>
            </Tabs.Content>

            <Tabs.Content value="plugins">
              <div class="flex flex-col px-2 pt-1 pb-2">
                <div class="flex flex-col p-2 bg-background-base rounded-sm max-h-[200px] overflow-y-auto min-h-12">
                  <Show
                    when={service.plugins().length > 0}
                    fallback={
                      <div class="text-12-regular text-text-base text-center my-auto">
                        {language.t("dialog.plugins.empty")}
                      </div>
                    }
                  >
                    <For each={service.plugins()}>
                      {(plugin) => (
                        <div class="flex items-center gap-2 w-full px-1 py-1">
                          <ServiceStatusDot status="connected" />
                          <span class="text-12-regular text-text-base truncate">{plugin}</span>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </div>
            </Tabs.Content>
          </Tabs>
        </Show>
      </Show>
      <SidebarReviewToggle placement={props.mobile ? "bottom" : "right"} />
    </div>
  )
}

function SidebarReviewToggle(props: { placement: "top" | "bottom" | "left" | "right" }) {
  const language = useLanguage()
  const command = useCommand()
  const layout = useLayout()
  const serverSDK = useServerSDK()
  const params = useParams<{ dir?: string; id?: string }>()

  // The sidebar lives in the layout shell, not the session route component, so it reads the
  // route params directly. Review panel state is global, so the key only has to be stable.
  const view = createMemo(() => {
    if (!params.id) return
    return layout.view(SessionStateKey.from(serverSDK().scope, SessionRouteKey.fromRoute(params.dir, params.id)))
  })
  const opened = () => view()?.reviewPanel.opened() ?? false

  return (
    <TooltipKeybind
      placement={props.placement}
      title={language.t("command.review.toggle")}
      keybind={command.keybind("review.toggle")}
    >
      <Button
        variant="ghost"
        class="w-full justify-start gap-1.5 px-2 h-7 text-11-medium text-text-base"
        disabled={!view()}
        aria-label={language.t("command.review.toggle")}
        aria-expanded={opened()}
        aria-controls="review-panel"
        onClick={() => view()?.reviewPanel.toggle()}
      >
        <Icon
          size="small"
          name={opened() ? "review-active" : "review"}
          classList={{ "text-icon-strong": opened(), "text-icon-weak": !opened() }}
        />
        <span class="flex-1 text-left truncate">{language.t("command.review.toggle")}</span>
      </Button>
    </TooltipKeybind>
  )
}
