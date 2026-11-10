// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, For, Show, createMemo, createResource } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import "./settings-v2.css"

type LocationKind = "database" | "directory" | "config" | "mcp"

type StorageLocation = {
  id: string
  label: string
  kind: LocationKind
  path: string
  exists: boolean
  bytes: number
  deletable: boolean
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const KIND_ICON = {
  database: "zy-repositories",
  directory: "zy-files",
  config: "zy-settings",
  mcp: "zy-mcp",
} as const

/**
 * A live, clickable list of the places this app writes to. The list is not a
 * static manifest: every entry comes from `/api/storage/locations`, which scans
 * the data directory and the resource tree at request time, so a database or MCP
 * file shows up the moment it exists on disk. Clicking a row reveals it in the
 * system file manager on desktop, or opens it in the browser on the web.
 */
export const SettingsLocationsV2: Component<{
  directory?: () => string | undefined
  kinds: LocationKind[]
  title?: string
  description?: string
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const sdk = useServerSDK()

  const [locations] = createResource(async (): Promise<StorageLocation[]> => {
    const result = await sdk().client.v2.storage.locations({ location: { directory: props.directory?.() } })
    const payload = result.data?.data as { locations?: StorageLocation[] } | undefined
    return payload?.locations ?? []
  })

  const rows = createMemo(() => (locations() ?? []).filter((entry) => props.kinds.includes(entry.kind)))

  const reveal = async (entry: StorageLocation) => {
    if (!entry.exists) return
    if (platform.revealPath) {
      const revealed = await platform.revealPath(entry.path).catch(() => false)
      if (revealed) return
    }
    if (platform.openPath) {
      await platform.openPath(entry.path).catch(() => {})
      return
    }
    platform.openLink(`file://${entry.path}`)
  }

  return (
    <div class="settings-v2-locations">
      <Show when={props.title}>
        <div class="settings-v2-locations-head">
          <span class="settings-v2-locations-title">{props.title}</span>
          <Show when={props.description}>
            <span class="settings-v2-locations-sub">{props.description}</span>
          </Show>
        </div>
      </Show>
      <Show
        when={rows().length > 0}
        fallback={
          <div class="settings-v2-locations-empty">
            {locations.loading ? language.t("settings.storage.locations.loading") : language.t("settings.storage.locations.empty")}
          </div>
        }
      >
        <ul class="settings-v2-locations-list">
          <For each={rows()}>
            {(entry) => (
              <li>
                <button
                  type="button"
                  class="settings-v2-location-row"
                  data-action="settings-storage-location"
                  data-kind={entry.kind}
                  data-missing={entry.exists ? undefined : ""}
                  title={entry.exists ? entry.path : `${entry.path} (missing)`}
                  onClick={() => void reveal(entry)}
                >
                  <Icon name={KIND_ICON[entry.kind] ?? "zy-files"} size="small" />
                  <span class="settings-v2-location-text">
                    <span class="settings-v2-location-label">{entry.label}</span>
                    <span class="settings-v2-location-path">{entry.path}</span>
                  </span>
                  <span class="settings-v2-location-meta">
                    <Show when={entry.exists} fallback={<span class="settings-v2-location-missing">{language.t("settings.storage.locations.missing")}</span>}>
                      {entry.kind === "database" ? formatBytes(entry.bytes) : ""}
                    </Show>
                    <Show when={entry.exists}>
                      <span class="settings-v2-location-open">
                        <Icon name="arrow-right" size="small" />
                      </span>
                    </Show>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}
