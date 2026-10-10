// Copyright (c) 2026 onelpawarai. All rights reserved.

import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { type Component, type ComponentProps, For, createMemo, startTransition } from "solid-js"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { TabsV2 } from "@zyraxon-ai/ui/v2/tabs-v2"
import { Icon } from "@zyraxon-ai/ui/icon"
import { SettingsKeybinds } from "@/components/settings-keybinds"
import { SettingsGeneralV2 } from "@/components/settings-v2/general"
import { SettingsModelsV2 } from "@/components/settings-v2/models"
import { SettingsProvidersV2 } from "@/components/settings-v2/providers"
import { SettingsServersV2 } from "@/components/settings-v2/servers"
import { SettingsSubscription } from "@/components/settings-v2/settings-subscription"
import { SettingsAboutV2 } from "@/components/settings-v2/about"
import { SettingsAppearanceV2 } from "@/components/settings-v2/appearance"
import { SettingsMcpV2, SettingsPluginsV2 } from "@/components/settings-v2/extensions"
import { SettingsNotificationsV2 } from "@/components/settings-v2/notifications"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useServerSync } from "@/context/server-sync"
import "@/components/settings-v2/settings-v2.css"

const SECTION_VALUES = [
  "general",
  "appearance",
  "notifications",
  "shortcuts",
  "servers",
  "providers",
  "models",
  "mcp",
  "plugins",
  "subscription",
  "about",
] as const

type SectionGroup = {
  title: string
  items: { value: (typeof SECTION_VALUES)[number]; label: string; icon: ComponentProps<typeof Icon>["name"] }[]
}

export const SettingsRoute: Component = () => {
  const language = useLanguage()
  const layout = useLayout()
  const navigate = useNavigate()
  const params = useParams<{ section?: string }>()
  const [search] = useSearchParams<{ session?: string }>()
  const platform = usePlatform()
  const serverSync = useServerSync()

  const section = createMemo(
    () => SECTION_VALUES.find((value) => value === params.section) ?? "general",
  )

  const href = (value: string) =>
    search.session ? `/settings/${value}?session=${encodeURIComponent(search.session)}` : `/settings/${value}`

  const groups = createMemo<SectionGroup[]>(() => [
    {
      title: language.t("settings.section.desktop"),
      items: [
        { value: "general", label: language.t("settings.tab.general"), icon: "sliders" },
        { value: "appearance", label: language.t("settings.tab.appearance"), icon: "eye" },
        { value: "notifications", label: language.t("settings.tab.notifications"), icon: "bubble-5" },
        { value: "shortcuts", label: language.t("settings.tab.shortcuts"), icon: "keyboard" },
      ],
    },
    {
      title: language.t("settings.section.server"),
      items: [
        { value: "servers", label: language.t("settings.tab.servers"), icon: "server" },
        { value: "providers", label: language.t("settings.tab.providers"), icon: "providers" },
        { value: "models", label: language.t("settings.tab.models"), icon: "models" },
        { value: "mcp", label: language.t("settings.tab.mcp"), icon: "mcp" },
        { value: "plugins", label: language.t("settings.tab.plugins"), icon: "puzzle" },
      ],
    },
    {
      title: language.t("settings.section.app"),
      items: [
        { value: "subscription", label: language.t("settings.tab.subscription"), icon: "settings-gear" },
        { value: "about", label: language.t("settings.tab.about"), icon: "help" },
      ],
    },
  ])

  // Provider rows are scoped to a directory, so borrow the same workspace fallback the
  // general panel uses when no session owns the route.
  const directory = createMemo(
    () => layout.home.selection().directory ?? layout.projects.list()[0]?.worktree ?? serverSync().data.path.home,
  )

  return (
    <div class="flex min-h-0 w-full flex-1 flex-col bg-v2-background-bg-base">
      <div class="flex shrink-0 items-center gap-3 px-4 py-3">
        <ButtonV2
          size="normal"
          variant="neutral"
          onClick={() => {
            if (window.history.length > 1) navigate(-1)
            else navigate("/")
          }}
        >
          <Icon name="arrow-left" size="small" />
          {language.t("settings.page.back")}
        </ButtonV2>
      </div>

      <TabsV2
        orientation="vertical"
        variant="settings"
        value={section()}
        onChange={(value) => startTransition(() => navigate(href(value)))}
        class="settings-v2 min-h-0 flex-1"
      >
        <TabsV2.List>
          <div class="flex h-full w-full flex-col justify-between">
            <div class="flex w-full flex-col gap-3">
              <For each={groups()}>
                {(group) => (
                  <div class="flex flex-col gap-1.5">
                    <TabsV2.SectionTitle>{group.title}</TabsV2.SectionTitle>
                    <div class="flex w-full flex-col gap-1.5">
                      <For each={group.items}>
                        {(item) => (
                          <TabsV2.Trigger value={item.value}>
                            <Icon name={item.icon} />
                            {item.label}
                          </TabsV2.Trigger>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
            <div class="settings-v2-nav-footer">
              <span>{language.t("app.name.desktop")}</span>
              <span>v{platform.version}</span>
            </div>
          </div>
        </TabsV2.List>

        <TabsV2.Content value="general" class="settings-v2-panel">
          <SettingsGeneralV2 sessionID={search.session} />
        </TabsV2.Content>
        <TabsV2.Content value="appearance" class="settings-v2-panel">
          <SettingsAppearanceV2 />
        </TabsV2.Content>
        <TabsV2.Content value="notifications" class="settings-v2-panel">
          <SettingsNotificationsV2 />
        </TabsV2.Content>
        <TabsV2.Content value="shortcuts" class="settings-v2-panel">
          <SettingsKeybinds v2 />
        </TabsV2.Content>
        <TabsV2.Content value="servers" class="settings-v2-panel">
          <SettingsServersV2 />
        </TabsV2.Content>
        <TabsV2.Content value="providers" class="settings-v2-panel">
          <SettingsProvidersV2 directory={directory} />
        </TabsV2.Content>
        <TabsV2.Content value="models" class="settings-v2-panel">
          <SettingsModelsV2 />
        </TabsV2.Content>
        <TabsV2.Content value="mcp" class="settings-v2-panel">
          <SettingsMcpV2 />
        </TabsV2.Content>
        <TabsV2.Content value="plugins" class="settings-v2-panel">
          <SettingsPluginsV2 />
        </TabsV2.Content>
        <TabsV2.Content value="subscription" class="settings-v2-panel">
          <SettingsSubscription />
        </TabsV2.Content>
        <TabsV2.Content value="about" class="settings-v2-panel">
          <SettingsAboutV2 />
        </TabsV2.Content>
      </TabsV2>
    </div>
  )
}