// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, For, Show, createMemo, createResource, createSignal } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { Tag } from "@zyraxon-ai/ui/v2/badge-v2"
import { useDialog } from "@zyraxon-ai/ui/context/dialog"
import { bundleFileName, parseBundle } from "@zyraxon-ai/schema/session-port"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServer } from "@/context/server"
import { showToast } from "@/utils/toast"
import { sessionHref } from "@/utils/session-route"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { createDragTracker, isFileDrag } from "./agent-port"
import { downloadSessionBundle, fetchSessionBundle, importSessionBundle, sessionAuthHeaders } from "./session-port"
import "./settings-v2.css"

type SessionRow = {
  id: string
  title: string
  agent?: string
  updated: number
}

/**
 * Session portability panel.
 *
 * A conversation lives in the server's database, which is per-install, so until
 * now it could not leave the machine that made it. This panel exports one
 * conversation as a portable file and reads that file back as a new session whose
 * whole history is restored, so the assistant remembers what was said rather than
 * starting fresh.
 *
 * Every call goes through the server's own routes, and the bundle shape is shared
 * with the server through `@zyraxon-ai/schema/session-port`, so what the panel
 * writes is exactly what the server will accept on the way back in.
 */
export const SettingsSessionsV2: Component = () => {
  const language = useLanguage()
  const layout = useLayout()
  const server = useServer()
  const dialog = useDialog()
  const navigate = useNavigate()

  const [reloadKey, setReloadKey] = createSignal(0)
  const drag = createDragTracker()
  const [dragging, setDragging] = createSignal(false)
  const [busy, setBusy] = createSignal<string>()

  const directory = createMemo(
    () => layout.home.selection().directory ?? layout.projects.list()[0]?.worktree ?? "",
  )
  const connection = createMemo(() => {
    const current = server.current
    if (!current || !("http" in current) || !current.http) return
    return current.http
  })

  /**
   * The project the selected directory belongs to.
   *
   * A project's worktree is the repository root, but a conversation is stored
   * under the directory it was started in, which is often a subpath of that root
   * (a monorepo package, for example). Listing by the exact directory therefore
   * misses every session created below the root, so the list is scoped to the
   * project instead and the directory is only used to find it.
   */
  const project = createMemo(() => {
    const dir = directory()
    const projects = layout.projects.list()
    if (!dir) return projects[0]
    return (
      projects.find((item) => item.worktree === dir) ??
      projects.find((item) => dir.startsWith(item.worktree.replace(/\/+$/, "") + "/")) ??
      projects[0]
    )
  })

  const [sessions, { refetch }] = createResource(
    () => [reloadKey(), directory(), project()?.id, connection()?.url] as const,
    async ([, dir, projectID, url]): Promise<SessionRow[]> => {
      if (!url) return []
      // Prefer the project scope, fall back to the directory, and fall back to
      // every session when neither is resolved yet. A panel that opens before the
      // project list has synced must not claim the install is empty.
      const query = projectID
        ? `project=${encodeURIComponent(projectID)}`
        : dir
          ? `directory=${encodeURIComponent(dir)}`
          : ""
      const response = await fetch(`${url}/api/session${query ? `?${query}` : ""}`, {
        headers: authHeaders(),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = (await response.json()) as { data?: unknown }
      const list = Array.isArray(body.data) ? body.data : []
      return list
        .filter((entry) => entry && typeof entry.id === "string" && !entry.time?.archived)
        .map((entry): SessionRow => {
          const agent = entry.agent
          return {
            id: String(entry.id),
            title: typeof entry.title === "string" ? entry.title : String(entry.id),
            agent: typeof agent === "string" ? agent : undefined,
            updated: typeof entry.time?.updated === "number" ? entry.time.updated : 0,
          }
        })
        .sort((a, b) => b.updated - a.updated)
    },
  )

  function authHeaders(): Record<string, string> {
    const http = connection()
    return http ? sessionAuthHeaders(http) : {}
  }

  function reload() {
    setReloadKey((value) => value + 1)
  }

  /** Write one conversation out as a file the user can keep or send. */
  async function exportSession(row: SessionRow) {
    const http = connection()
    if (!http) return
    setBusy(row.id)
    try {
      const bundle = await fetchSessionBundle(http, row.id)
      downloadSessionBundle(bundle, bundleFileName({ id: bundle.session.id, title: bundle.session.title }))
      showToast({ title: language.t("settings.sessions.exported"), variant: "success" })
    } catch {
      showToast({ title: language.t("settings.sessions.export.error") })
    } finally {
      setBusy(undefined)
    }
  }

  /**
   * Read a portable file back in. The picker is a hidden file input so the same
   * code path works in the desktop shell and a browser; a dropped file funnels
   * into the same importer so there is one place that validates and one place
   * that reports failure.
   */
  function pickFile() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json,application/json"
    input.addEventListener("change", async () => {
      const file = input.files?.[0]
      if (!file) return
      await importFile(file)
    })
    input.click()
  }

  async function importFile(file: File) {
    const http = connection()
    if (!http) return
    // Send whatever location the panel resolved. When the project list has not
    // synced yet this is blank, and the server falls back to its own working
    // directory rather than failing the import.
    const target = directory() || project()?.worktree || ""
    setBusy("import")
    try {
      const parsed = parseBundle(await file.text())
      if (!parsed.ok) {
        showToast({ title: language.t("settings.sessions.import.error") })
        return
      }
      const outcome = await importSessionBundle({
        server: http,
        bundle: parsed.bundle,
        location: { directory: target },
      })
      showToast({
        title: language.t("settings.sessions.imported"),
        description: language.t("settings.sessions.imported.count", { count: outcome.restored }),
        variant: "success",
      })
      dialog.close()
      navigate(sessionHref(server.key, outcome.id))
    } catch {
      showToast({ title: language.t("settings.sessions.import.error") })
    } finally {
      setBusy(undefined)
    }
  }

  function onDragEnter(event: DragEvent) {
    if (!isFileDrag(event.dataTransfer?.types)) return
    event.preventDefault()
    drag.enter()
    setDragging(true)
  }

  function onDragOver(event: DragEvent) {
    if (!isFileDrag(event.dataTransfer?.types)) return
    event.preventDefault()
    event.dataTransfer!.dropEffect = "copy"
  }

  function onDragLeave() {
    if (drag.leave()) setDragging(false)
  }

  async function onDrop(event: DragEvent) {
    drag.reset()
    setDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    event.preventDefault()
    await importFile(file)
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.sessions")}</h2>
      </div>
      <div class="settings-v2-tab-body">
        <div
          class="settings-v2-section zy-agents-dropzone"
          classList={{ "zy-agents-dropzone--active": dragging() }}
          data-action="settings-sessions-dropzone"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={(event) => void onDrop(event)}
        >
          <div class="zy-agents-head">
            <div class="zy-agents-heading">
              <h3 class="zy-agents-title">{language.t("settings.sessions.title")}</h3>
              <p class="zy-agents-sub">{language.t("settings.sessions.description")}</p>
            </div>
            <div class="settings-v2-inline">
              <ButtonV2
                size="small"
                variant="ghost-muted"
                icon="refresh"
                onClick={() => void refetch()}
              >
                {language.t("settings.sessions.reload")}
              </ButtonV2>
              <ButtonV2
                size="small"
                variant="neutral"
                icon="upload"
                data-action="settings-sessions-import"
                disabled={busy() === "import"}
                onClick={pickFile}
              >
                {language.t("settings.sessions.import")}
              </ButtonV2>
            </div>
          </div>

          <Show
            when={(sessions() ?? []).length > 0}
            fallback={<p class="zy-agents-hint">{language.t("settings.sessions.empty")}</p>}
          >
            <SettingsListV2>
              <For each={sessions() ?? []}>
                {(row) => (
                  <SettingsRowV2 title={row.title} description={row.agent ?? row.id}>
                    <div class="zy-agents-row-actions">
                      <Show when={row.agent}>
                        <Tag variant="neutral">{row.agent}</Tag>
                      </Show>
                      <span class="settings-v2-mono">{formatTime(row.updated)}</span>
                      <button
                        type="button"
                        class="zy-agents-row-action"
                        data-action="settings-sessions-export"
                        disabled={busy() === row.id}
                        onClick={() => void exportSession(row)}
                      >
                        {language.t("settings.sessions.export")}
                      </button>
                    </div>
                  </SettingsRowV2>
                )}
              </For>
            </SettingsListV2>
          </Show>
          <p class="zy-agents-hint zy-agents-drop-hint">{language.t("settings.sessions.dropHint")}</p>
        </div>
      </div>
    </>
  )

  function formatTime(value: number) {
    if (!value) return ""
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString()
  }
}
