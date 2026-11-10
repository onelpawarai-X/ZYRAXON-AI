// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Integrations — connect an external system to the agent from Settings.
 *
 * The server already owns the registry, the credential store and the routes; this
 * panel is the part that was missing. It lists what the server offers, lets the
 * user connect one with a key or through OAuth, and disconnects it again. Once an
 * integration is connected, the agent picks it up from the same registry when it
 * works, so there is no separate wiring step per task.
 *
 * Nothing here invents a new store: a connection is a credential in the server's
 * own credential store, which is exactly what `@zyraxon-ai/core/integration`
 * reads when the agent asks for it.
 */

import { Tag } from "@zyraxon-ai/ui/v2/badge-v2"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@zyraxon-ai/ui/v2/dialog-v2"
import { DividerV2 } from "@zyraxon-ai/ui/v2/divider-v2"
import { TextInputV2 } from "@zyraxon-ai/ui/v2/text-input-v2"
import { useDialog } from "@zyraxon-ai/ui/context/dialog"
import { type Component, For, Show, createMemo, createResource, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServer } from "@/context/server"
import { showToast } from "@/utils/toast"
import type { Info, MethodID, OAuthMethod } from "@zyraxon-ai/schema/integration"
import {
  connectIntegrationKey,
  disconnectIntegration,
  integrationAttemptStatus,
  isConnected,
  keyMethod,
  listIntegrations,
  oauthMethod,
  startIntegrationOAuth,
  type IntegrationLocation,
} from "./integration-client"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

const ATTEMPT_POLL_MS = 1500
const ATTEMPT_LIMIT_MS = 5 * 60 * 1000

export const SettingsIntegrationsV2: Component = () => {
  const language = useLanguage()
  const layout = useLayout()
  const server = useServer()
  const dialog = useDialog()

  const [reloadKey, setReloadKey] = createSignal(0)
  const [busy, setBusy] = createSignal<string>()

  const directory = createMemo(
    () => layout.home.selection().directory ?? layout.projects.list()[0]?.worktree ?? "",
  )

  const connection = createMemo(() => {
    const current = server.current
    if (!current || !("http" in current) || !current.http) return
    return current.http
  })

  const location = createMemo<IntegrationLocation>(() => {
    const dir = directory()
    return dir ? { directory: dir } : {}
  })

  const [integrations, { refetch }] = createResource(
    () => [reloadKey(), connection()?.url, directory()] as const,
    async ([, url]): Promise<Info[]> => {
      const http = connection()
      if (!url || !http) return []
      return listIntegrations(http, location())
    },
  )

  const reload = () => setReloadKey((value) => value + 1)

  /** Connect with a key: the simple path, one secret and done. */
  async function connectKey(info: Info, key: string) {
    const http = connection()
    if (!http) return
    setBusy(info.id)
    try {
      await connectIntegrationKey({ server: http, integrationID: info.id, key, location: location() })
      showToast({ title: language.t("settings.integrations.connected", { name: info.name }), variant: "success" })
      reload()
      void refetch()
    } catch (error) {
      showToast({
        title: language.t("settings.integrations.connect.error"),
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(undefined)
    }
  }

  /**
   * Connect through OAuth: the server hands back a URL to open and an attempt to
   * watch. The poll stops on a terminal status, on the attempt's own expiry, and
   * on a hard cap so a panel left open cannot poll forever.
   */
  async function connectOAuth(info: Info, method: OAuthMethod) {
    const http = connection()
    if (!http) return
    setBusy(info.id)
    try {
      const attempt = await startIntegrationOAuth({
        server: http,
        integrationID: info.id,
        methodID: method.id as MethodID,
        location: location(),
      })
      window.open(attempt.url, "_blank", "noopener,noreferrer")
      showToast({
        title: language.t("settings.integrations.oauth.started", { name: info.name }),
        description: attempt.instructions,
      })

      const deadline = Date.now() + Math.min(attempt.time.expires - attempt.time.created, ATTEMPT_LIMIT_MS)
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, ATTEMPT_POLL_MS))
        const status = await integrationAttemptStatus(http, attempt.attemptID, location())
        if (status.status === "complete") {
          showToast({
            title: language.t("settings.integrations.connected", { name: info.name }),
            variant: "success",
          })
          reload()
          void refetch()
          return
        }
        if (status.status === "failed") {
          showToast({ title: language.t("settings.integrations.connect.error"), description: status.message })
          return
        }
        if (status.status === "expired") {
          showToast({ title: language.t("settings.integrations.oauth.expired") })
          return
        }
      }
      showToast({ title: language.t("settings.integrations.oauth.expired") })
    } catch (error) {
      showToast({
        title: language.t("settings.integrations.connect.error"),
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(undefined)
    }
  }

  async function disconnect(info: Info) {
    const http = connection()
    if (!http) return
    const first = info.connections[0]
    if (!first || first.type !== "credential") return
    setBusy(info.id)
    try {
      await disconnectIntegration({ server: http, credentialID: first.id, location: location() })
      showToast({ title: language.t("settings.integrations.disconnected", { name: info.name }), variant: "success" })
      reload()
      void refetch()
    } catch (error) {
      showToast({
        title: language.t("settings.integrations.disconnect.error"),
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(undefined)
    }
  }

  const openKeyDialog = (info: Info) => {
    dialog.push(() => <DialogIntegrationKey info={info} onSubmit={(key) => void connectKey(info, key)} />)
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.tab.integrations")}</h2>
          <ButtonV2 size="small" variant="neutral" onClick={() => void refetch()}>
            {language.t("settings.integrations.refresh")}
          </ButtonV2>
        </div>
        <p class="zy-agents-hint">{language.t("settings.integrations.hint")}</p>
      </div>

      <div class="settings-v2-tab-body">
        <Show
          when={(integrations() ?? []).length > 0}
          fallback={<p class="zy-agents-hint">{language.t("settings.integrations.empty")}</p>}
        >
          <SettingsListV2>
            <For each={integrations() ?? []}>
              {(info) => {
                const connected = () => isConnected(info)
                const key = () => keyMethod(info)
                const oauth = () => oauthMethod(info)
                return (
                  <SettingsRowV2
                    title={info.name}
                    description={
                      <>
                        <span class="settings-v2-mono">{info.id}</span>
                        <Show when={connected()}>
                          {" • "}
                          {language.t("settings.integrations.connected.tag")}
                        </Show>
                      </>
                    }
                  >
                    <div class="zy-agents-row-actions">
                      <Show when={connected()}>
                        <Tag variant="accent">{language.t("settings.integrations.connected.tag")}</Tag>
                        <button
                          type="button"
                          class="zy-agents-row-action"
                          data-action="settings-integration-disconnect"
                          disabled={busy() === info.id}
                          onClick={() => void disconnect(info)}
                        >
                          {language.t("settings.integrations.disconnect")}
                        </button>
                      </Show>
                      <Show when={!connected() && key()}>
                        <button
                          type="button"
                          class="zy-agents-row-action"
                          data-action="settings-integration-connect-key"
                          disabled={busy() === info.id}
                          onClick={() => openKeyDialog(info)}
                        >
                          {language.t("settings.integrations.connect.key")}
                        </button>
                      </Show>
                      <Show when={!connected() && oauth()}>
                        <button
                          type="button"
                          class="zy-agents-row-action"
                          data-action="settings-integration-connect-oauth"
                          disabled={busy() === info.id}
                          onClick={() => void connectOAuth(info, oauth()!)}
                        >
                          {language.t("settings.integrations.connect.oauth")}
                        </button>
                      </Show>
                    </div>
                  </SettingsRowV2>
                )
              }}
            </For>
          </SettingsListV2>
        </Show>
      </div>
    </>
  )
}

/** The one-field dialog for a key-based integration. */
const DialogIntegrationKey: Component<{ info: Info; onSubmit: (key: string) => void }> = (props) => {
  const language = useLanguage()
  const dialog = useDialog()
  const [value, setValue] = createSignal("")
  const [saving, setSaving] = createSignal(false)

  const submit = () => {
    const key = value().trim()
    if (!key) return
    setSaving(true)
    props.onSubmit(key)
    dialog.close()
  }

  return (
    <Dialog fit class="settings-v2-server-dialog">
      <DialogHeader hideClose={true}>
        <DialogTitle>{language.t("settings.integrations.connect.key")}</DialogTitle>
      </DialogHeader>
      <DividerV2 />
      <DialogBody class="flex w-full min-w-0 flex-1 flex-col px-4 pt-4 pb-2">
        <div class="flex w-full min-w-0 flex-col gap-2">
          <label class="settings-v2-server-dialog-label">{props.info.name}</label>
          <TextInputV2
            type="password"
            appearance="large"
            class="!w-full self-stretch"
            value={value()}
            autofocus
            placeholder={language.t("settings.integrations.key.placeholder")}
            onInput={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.isComposing) submit()
            }}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="neutral" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2 variant="contrast" disabled={!value().trim() || saving()} onClick={submit}>
          {language.t("settings.integrations.connect.key")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
