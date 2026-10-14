// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Component, For, createMemo, createSignal, startTransition } from "solid-js"
import { Dialog } from "@zyraxon-ai/ui/v2/dialog-v2"
import { TabsV2 } from "@zyraxon-ai/ui/v2/tabs-v2"
import { Icon } from "@zyraxon-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsGeneralV2 } from "./general"
import { SettingsKeybinds } from "../settings-keybinds"
import { SettingsProvidersV2 } from "./providers"
import { SettingsModelsV2 } from "./models"
import { SettingsLocalV2 } from "./local"
import "./settings-v2.css"
import { SettingsServersV2 } from "./servers"
import { SettingsSubscription } from "./settings-subscription"
import { useDialog } from "@zyraxon-ai/ui/context/dialog"
import { useLayout } from "@/context/layout"
import { useServerSync } from "@/context/server-sync"
import { SettingsAppearanceV2 } from "./appearance"
import { SettingsNotificationsV2 } from "./notifications"
import { SettingsLanguageV2 } from "./language"
import { SettingsAgentsV2 } from "./agents"
import { SettingsExtensionsV2 } from "./extensions-v2"
import { SettingsStorageV2 } from "./storage"
import { SettingsSecurityV2 } from "./security"
import { SettingsAdvancedV2 } from "./advanced"
import { SettingsAboutV2 } from "./about"

/**
 * Every surface the app exposes lives in one sheet rather than a route, so the
 * session behind it stays exactly where the user left it and Escape or the
 * close button puts everything back.
 */
type Section =
  | "general"
  | "language"
  | "appearance"
  | "notifications"
  | "shortcuts"
  | "agents"
  | "servers"
  | "providers"
  | "models"
  | "local"
  | "extensions"
  | "storage"
  | "security"
  | "advanced"
  | "subscription"
  | "about"

/**
 * Grouped the way the rail reads: the app's own behaviour, what it talks to,
 * then the surfaces a user rarely opens. Each group carries its own icon so the
 * rail keeps the same visual weight it had on the full page.
 */
const GROUPS: readonly { title: string; items: readonly { section: Section; icon: IconProps["name"] }[] }[] = [
  {
    title: "settings.section.desktop",
    items: [
      { section: "general", icon: "sliders" },
      { section: "language", icon: "zy-language" },
      { section: "appearance", icon: "zy-appearance" },
      { section: "notifications", icon: "zy-notifications" },
      { section: "shortcuts", icon: "zy-shortcuts" },
    ],
  },
  {
    title: "settings.section.server",
    items: [
      { section: "servers", icon: "zy-servers" },
      { section: "providers", icon: "zy-providers" },
      { section: "models", icon: "zy-models" },
      { section: "local", icon: "zy-models" },
    ],
  },
  {
    title: "settings.section.app",
    items: [
      { section: "agents", icon: "zy-sessions" },
      { section: "extensions", icon: "zy-plugins" },
      { section: "storage", icon: "zy-repositories" },
    ],
  },
  {
    title: "settings.section.system",
    items: [
      { section: "security", icon: "zy-status" },
      { section: "advanced", icon: "zy-settings" },
    ],
  },
]

const SECTIONS: readonly Section[] = GROUPS.flatMap((group) => group.items.map((item) => item.section)).concat([
  "subscription",
  "about",
])

function isSection(value: string | undefined): value is Section {
  return value !== undefined && (SECTIONS as readonly string[]).includes(value)
}

export const DialogSettings: Component<{
  sessionID?: string
  defaultValue?: string
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const layout = useLayout()
  const serverSync = useServerSync()
  const [tab, setTab] = createSignal<Section>(isSection(props.defaultValue) ? props.defaultValue : "general")

  const showProviders = () => {
    void dialog.show(
      () => <DialogSettings sessionID={props.sessionID} defaultValue="providers" />,
      undefined,
      { docked: true },
    )
  }

  // Provider rows are directory scoped; the dialog has no route param, so fall
  // back to the same chain the full page uses.
  const directory = createMemo(
    () => layout.home.selection().directory ?? layout.projects.list()[0]?.worktree ?? serverSync().data.path.home,
  )

  return (
    <Dialog size="x-large" variant="settings" class="settings-v2-dialog">
      <TabsV2
        orientation="vertical"
        variant="settings"
        value={tab()}
        onChange={(value) => void startTransition(() => setTab(value as Section))}
        class="settings-v2"
      >
        <TabsV2.List>
          <div class="settings-v2-rail">
            <div class="settings-v2-rail-groups">
              <For each={GROUPS}>
                {(group) => (
                  <div class="settings-v2-rail-group">
                    <TabsV2.SectionTitle>{language.t(group.title)}</TabsV2.SectionTitle>
                    <div class="settings-v2-rail-items">
                      <For each={group.items}>
                        {(item) => (
                          <TabsV2.Trigger value={item.section} data-action={`settings-nav-${item.section}`}>
                            <Icon name={item.icon} />
                            {language.t(`settings.tab.${item.section}`)}
                          </TabsV2.Trigger>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
              <div class="settings-v2-rail-group">
                <div class="settings-v2-rail-items">
                  <TabsV2.Trigger value="subscription">
                    <Icon name="zy-subscription" />
                    {language.t("settings.tab.subscription")}
                  </TabsV2.Trigger>
                  <TabsV2.Trigger value="about">
                    <Icon name="zy-about" />
                    {language.t("settings.tab.about")}
                  </TabsV2.Trigger>
                </div>
              </div>
            </div>
            <div class="settings-v2-nav-footer">
              <span>{language.t("app.name.desktop")}</span>
              <span>v{platform.version}</span>
            </div>
          </div>
        </TabsV2.List>

        <TabsV2.Content value="general" class="settings-v2-panel">
          <SettingsGeneralV2 sessionID={props.sessionID} />
        </TabsV2.Content>
        <TabsV2.Content value="language" class="settings-v2-panel">
          <SettingsLanguageV2 />
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
        <TabsV2.Content value="agents" class="settings-v2-panel">
          <SettingsAgentsV2 />
        </TabsV2.Content>
        <TabsV2.Content value="servers" class="settings-v2-panel">
          <SettingsServersV2 />
        </TabsV2.Content>
        <TabsV2.Content value="providers" class="settings-v2-panel">
          <SettingsProvidersV2 directory={directory} onBack={showProviders} />
        </TabsV2.Content>
        <TabsV2.Content value="models" class="settings-v2-panel">
          <SettingsModelsV2 />
        </TabsV2.Content>
        <TabsV2.Content value="local" class="settings-v2-panel">
          <SettingsLocalV2 />
        </TabsV2.Content>
        <TabsV2.Content value="extensions" class="settings-v2-panel">
          <SettingsExtensionsV2 />
        </TabsV2.Content>
        <TabsV2.Content value="storage" class="settings-v2-panel">
          <SettingsStorageV2 />
        </TabsV2.Content>
        <TabsV2.Content value="security" class="settings-v2-panel">
          <SettingsSecurityV2 />
        </TabsV2.Content>
        <TabsV2.Content value="advanced" class="settings-v2-panel">
          <SettingsAdvancedV2 />
        </TabsV2.Content>
        <TabsV2.Content value="subscription" class="settings-v2-panel">
          <SettingsSubscription />
        </TabsV2.Content>
        <TabsV2.Content value="about" class="settings-v2-panel">
          <SettingsAboutV2 />
        </TabsV2.Content>
      </TabsV2>
    </Dialog>
  )
}

type IconProps = Parameters<typeof Icon>[0]