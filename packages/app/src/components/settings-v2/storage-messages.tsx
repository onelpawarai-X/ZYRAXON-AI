// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, For, Show, createMemo, createSignal } from "solid-js"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

type MessageRow = {
  id: string
  role: string
  created: number
  preview: string
}

type SessionRow = {
  id: string
  title: string
  updated: number
}

// Selectable ages, in hours, matching the windows the panel offers. Deleting by
// age removes only the messages older than the cutoff; the session itself is
// never touched, so it keeps working with whatever messages remain.
const MESSAGE_WINDOWS = [
  { value: "", label: "settings.storage.messages.window.never" },
  { value: "1", label: "settings.storage.messages.window.hour1" },
  { value: "24", label: "settings.storage.messages.window.hours24" },
  { value: "168", label: "settings.storage.messages.window.days7" },
  { value: "720", label: "settings.storage.messages.window.month1" },
  { value: "8760", label: "settings.storage.messages.window.year1" },
  { value: "17520", label: "settings.storage.messages.window.years2" },
  { value: "43800", label: "settings.storage.messages.window.years5" },
] as const

function previewOf(parts: Array<{ type?: string; text?: string }> | undefined): string {
  const text = (parts ?? [])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

function when(created: number): string {
  if (!created) return ""
  return new Date(created).toLocaleString()
}

/**
 * Pick individual messages and delete them, or delete everything older than a
 * chosen age. Only `session.deleteMessage` is used, so the session row survives
 * and every message that was not selected stays exactly where it was. The
 * timeline reloads from the database afterwards, which is why a deleted message
 * simply disappears instead of leaving a hole the UI cannot render.
 */
export const StorageMessagesV2: Component<{ directory?: () => string | undefined }> = (props) => {
  const language = useLanguage()
  const sdk = useServerSDK()

  const [sessions, setSessions] = createSignal<SessionRow[]>([])
  const [activeSession, setActiveSession] = createSignal<string>()
  const [messages, setMessages] = createSignal<MessageRow[]>([])
  const [marked, setMarked] = createSignal<string[]>([])
  const [window, setWindow] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [deleting, setDeleting] = createSignal(false)

  const location = () => ({ directory: props.directory?.() })

  const openMessages = async () => {
    setLoading(true)
    try {
      const result = await sdk().client.session.list({ ...location(), roots: true })
      const list = ((result.data ?? []) as Array<Record<string, unknown>>).map((entry) => ({
        id: String(entry.id ?? ""),
        title: String(entry.title ?? entry.id ?? ""),
        updated: Number((entry.time as { updated?: number } | undefined)?.updated ?? 0),
      }))
      setSessions(list)
      if (list[0]) await loadMessages(list[0].id)
    } catch {
      showToast({ title: language.t("settings.storage.messages.error") })
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (sessionID: string) => {
    setActiveSession(sessionID)
    setMarked([])
    setLoading(true)
    try {
      const result = await sdk().client.session.messages({ ...location(), sessionID, limit: 300 })
      const items = (result.data ?? []) as Array<{ info?: Record<string, unknown>; parts?: Array<{ text?: string }> }>
      const rows = items
        .filter((item) => item?.info?.id)
        .map((item) => ({
          id: String(item.info!.id),
          role: String(item.info!.role ?? ""),
          created: Number((item.info!.time as { created?: number } | undefined)?.created ?? 0),
          preview: previewOf(item.parts),
        }))
        .sort((a, b) => a.created - b.created)
      setMessages(rows)
    } catch {
      showToast({ title: language.t("settings.storage.messages.error") })
    } finally {
      setLoading(false)
    }
  }

  const toggle = (id: string) => {
    setMarked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  const olderCutoff = () => {
    const hours = window()
    if (!hours) return undefined
    return Date.now() - Number(hours) * 3600000
  }

  const deleteIds = async (ids: string[], done: string) => {
    const sessionID = activeSession()
    if (!sessionID || ids.length === 0) return
    setDeleting(true)
    try {
      for (const id of ids) {
        await sdk().client.session.deleteMessage({ ...location(), sessionID, messageID: id })
      }
      showToast({ title: done })
      await loadMessages(sessionID)
    } catch {
      showToast({ title: language.t("settings.storage.messages.error") })
    } finally {
      setDeleting(false)
    }
  }

  const deleteMarked = () =>
    void deleteIds(
      marked(),
      language.t("settings.storage.messages.deleted", { count: marked().length }),
    )

  const deleteOlder = () => {
    const cutoff = olderCutoff()
    if (cutoff === undefined) return
    const targets = messages().filter((message) => message.created < cutoff).map((message) => message.id)
    void deleteIds(targets, language.t("settings.storage.messages.deleted", { count: targets.length }))
  }

  const olderCount = createMemo(() => {
    const cutoff = olderCutoff()
    if (cutoff === undefined) return 0
    return messages().filter((message) => message.created < cutoff).length
  })

  return (
    <div class="settings-v2-section">
      <div class="zy-agents-head">
        <div class="zy-agents-heading">
          <h3 class="zy-agents-title">{language.t("settings.storage.messages.title")}</h3>
          <p class="zy-agents-sub">{language.t("settings.storage.messages.description")}</p>
        </div>
        <ButtonV2 size="small" variant="neutral" icon="zy-sessions" onClick={() => void openMessages()}>
          {language.t("settings.storage.messages.open")}
        </ButtonV2>
      </div>

      <Show when={sessions().length > 0}>
        <SettingsListV2>
          <SettingsRowV2
            title={language.t("settings.storage.messages.session")}
            description={language.t("settings.storage.messages.session.description")}
          >
            <select
              class="settings-v2-select"
              data-action="settings-storage-messages-session"
              value={activeSession() ?? ""}
              onChange={(event) => void loadMessages(event.currentTarget.value)}
            >
              <For each={sessions()}>
                {(session) => <option value={session.id}>{session.title || session.id}</option>}
              </For>
            </select>
          </SettingsRowV2>

          <SettingsRowV2
            title={language.t("settings.storage.messages.list.title")}
            description={language.t("settings.storage.messages.list.description", { count: messages().length })}
          >
            <span class="settings-v2-mono">{messages().length}</span>
          </SettingsRowV2>
        </SettingsListV2>

        <Show when={!loading() && messages().length === 0}>
          <div class="settings-v2-notice">{language.t("settings.storage.messages.empty")}</div>
        </Show>

        <Show when={messages().length > 0}>
          <div class="zy-message-list" data-action="settings-storage-messages-list">
            <For each={messages()}>
              {(message) => (
                <label class="zy-message-row">
                  <input
                    type="checkbox"
                    checked={marked().includes(message.id)}
                    onChange={() => toggle(message.id)}
                  />
                  <span class="zy-message-role">{message.role}</span>
                  <span class="zy-message-preview">{message.preview || message.id}</span>
                  <span class="zy-message-time">{when(message.created)}</span>
                </label>
              )}
            </For>
          </div>

          <div class="settings-v2-inline">
            <ButtonV2
              size="normal"
              variant="danger"
              data-action="settings-storage-messages-delete-marked"
              disabled={deleting() || marked().length === 0}
              onClick={deleteMarked}
            >
              {language.t("settings.storage.messages.deleteMarked")} ({marked().length})
            </ButtonV2>
          </div>

          <div class="settings-v2-inline">
            <select
              class="settings-v2-select"
              data-action="settings-storage-messages-window"
              value={window()}
              onChange={(event) => setWindow(event.currentTarget.value)}
            >
              <For each={MESSAGE_WINDOWS}>
                {(entry) => <option value={entry.value}>{language.t(entry.label)}</option>}
              </For>
            </select>
            <ButtonV2
              size="normal"
              variant="danger"
              data-action="settings-storage-messages-delete-older"
              disabled={deleting() || !window()}
              onClick={deleteOlder}
            >
              {language.t("settings.storage.messages.deleteOlder")} ({olderCount()})
            </ButtonV2>
          </div>

          <p class="zy-agents-hint">{language.t("settings.storage.messages.note")}</p>
        </Show>
      </Show>
    </div>
  )
}
