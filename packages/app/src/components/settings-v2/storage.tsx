// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, For, Show, createMemo, createResource, createSignal } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { SettingsLocationsV2 } from "./storage-locations"
import { StorageMessagesV2 } from "./storage-messages"
import "./settings-v2.css"

type StorageResult = {
  sessions: number
  messages: number
  parts: number
  bytesBefore: number
  bytesAfter: number
}

type StorageUsage = {
  path: string
  bytes: number
  pages: number
  freelistPages: number
  pageSize: number
  sessions: number
  messages: number
  parts: number
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const OLDER_WINDOWS = [
  { value: "", label: "settings.storage.purge.never" },
  { value: "30", label: "settings.storage.purge.days30" },
  { value: "90", label: "settings.storage.purge.days90" },
  { value: "365", label: "settings.storage.purge.days365" },
] as const

/**
 * Everything here is a real call: usage reads the live page counts and the file
 * size on disk, compact hands freed pages back with incremental vacuum, and a
 * purge deletes rows and immediately reports the size the file dropped to.
 */
export const SettingsStorageV2: Component<{ directory?: () => string | undefined }> = (props) => {
  const language = useLanguage()
  const sdk = useServerSDK()
  const [busy, setBusy] = createSignal<"compact" | "purge" | undefined>()
  const [notice, setNotice] = createSignal<string>()
  const [window, setWindow] = createSignal("")

  const [usage, { refetch }] = createResource(async (): Promise<StorageUsage | undefined> => {
    const result = await sdk().client.v2.storage.usage({ location: { directory: props.directory?.() } })
    // The route answers with a `{ location, data }` envelope, so the payload sits one level in.
    return result.data?.data as StorageUsage | undefined
  })

  const reclaimed = createMemo(() => {
    const value = usage()
    if (!value) return 0
    return Math.max(0, value.freelistPages * value.pageSize)
  })

  const cutoff = () => {
    const days = window()
    if (!days) return undefined
    return new Date(Date.now() - Number(days) * 86400000).toISOString()
  }

  const run = async (kind: "compact" | "purge") => {
    setBusy(kind)
    try {
      const result =
        kind === "compact"
          ? await sdk().client.v2.storage.compact({ location: { directory: props.directory?.() } })
          : await sdk().client.v2.storage.purge({
              location: { directory: props.directory?.() },
              storagePurgeInput: { olderThan: cutoff() },
            })
      const payload = result.data?.data as StorageResult | undefined
      const freed = payload?.bytesBefore ?? 0
      const after = payload?.bytesAfter ?? 0
      setNotice(
        language.t(`settings.storage.${kind}.done`, { freed: formatBytes(freed - after) }),
      )
      await refetch()
    } catch {
      setNotice(language.t("settings.storage.error"))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div class="settings-v2-section">
      <Show when={notice()}>
        <div class="settings-v2-notice" role="status">
          {notice()}
        </div>
      </Show>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.storage.database.title")}
          description={usage()?.path ?? language.t("settings.storage.database.loading")}
        >
          <span class="settings-v2-mono">{usage() ? formatBytes(usage()!.bytes) : "—"}</span>
        </SettingsRowV2>
        <SettingsRowV2
          title={language.t("settings.storage.contents.title")}
          description={language.t("settings.storage.contents.description")}
        >
          <span class="settings-v2-mono">
            <Show when={usage()} fallback="—">
              {(value) => `${value().sessions} · ${value().messages} · ${value().parts}`}
            </Show>
          </span>
        </SettingsRowV2>
        <SettingsRowV2
          title={language.t("settings.storage.reclaimable.title")}
          description={language.t("settings.storage.reclaimable.description")}
        >
          <span class="settings-v2-mono">{reclaimed() ? formatBytes(reclaimed()) : language.t("common.default")}</span>
        </SettingsRowV2>
        <SettingsRowV2
          title={language.t("settings.storage.compact.title")}
          description={language.t("settings.storage.compact.description")}
        >
          <ButtonV2
            size="normal"
            variant="neutral"
            data-action="settings-storage-compact"
            disabled={busy() !== undefined}
            onClick={() => void run("compact")}
          >
            <Icon name="zy-repositories" size="small" />
            {busy() === "compact" ? language.t("settings.storage.working") : language.t("settings.storage.compact.action")}
          </ButtonV2>
        </SettingsRowV2>
        <SettingsRowV2
          title={language.t("settings.storage.purge.title")}
          description={language.t("settings.storage.purge.description")}
        >
          <div class="settings-v2-inline">
            <select
              class="settings-v2-select"
              data-action="settings-storage-window"
              value={window()}
              onChange={(event) => setWindow(event.currentTarget.value)}
            >
              <For each={OLDER_WINDOWS}>{(entry) => <option value={entry.value}>{language.t(entry.label)}</option>}</For>
            </select>
            <ButtonV2
              size="normal"
              variant="danger"
              data-action="settings-storage-purge"
              disabled={busy() !== undefined || !window()}
              onClick={() => void run("purge")}
            >
              {language.t("settings.storage.purge.action")}
            </ButtonV2>
          </div>
        </SettingsRowV2>
      </SettingsListV2>

      <SettingsLocationsV2
        directory={props.directory}
        kinds={["database"]}
        title={language.t("settings.storage.locations.title")}
        description={language.t("settings.storage.locations.description")}
      />

      <StorageMessagesV2 directory={props.directory} />
    </div>
  )
}