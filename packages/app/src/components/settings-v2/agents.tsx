// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, For, Show, createMemo, createResource, createSignal } from "solid-js"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@zyraxon-ai/ui/v2/dialog-v2"
import { DividerV2 } from "@zyraxon-ai/ui/v2/divider-v2"
import { Field } from "@zyraxon-ai/ui/v2/field-v2"
import { Icon } from "@zyraxon-ai/ui/v2/icon"
import { SelectV2 } from "@zyraxon-ai/ui/v2/select-v2"
import { Tag } from "@zyraxon-ai/ui/v2/badge-v2"
import { TextInputV2 } from "@zyraxon-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@zyraxon-ai/ui/v2/textarea-v2"
import { useDialog } from "@zyraxon-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useLayout } from "@/context/layout"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import {
  createDragTracker,
  downloadAgentFile,
  isFileDrag,
  parseAgentFile,
  toConfigEntry,
  type AgentConfigEntry,
} from "./agent-port"
import "./settings-v2.css"

/**
 * An agent is a markdown file on disk, but the app registers agents from the
 * global config as well, so the panel can create one without asking anyone to
 * hand-edit JSON: the same `agent.<name>` entry the CLI reads is written through
 * the global config writer, and the server reloads it into the mode selector.
 *
 * The path shown per row is the global config file that actually holds the
 * agent, resolved from the server's own reported paths rather than a fixed
 * string, so it points at the real file on this machine.
 */
type AgentRow = {
  id: string
  name: string
  description?: string
  mode: string
  model?: string
  prompt?: string
  temperature?: number
}

const MODES = ["primary", "subagent", "all"] as const

export const SettingsAgentsV2: Component = () => {
  const language = useLanguage()
  const sdk = useServerSDK()
  const serverSync = useServerSync()
  const layout = useLayout()
  const platform = usePlatform()
  const dialog = useDialog()

  const [reloadKey, setReloadKey] = createSignal(0)
  const [dragging, setDragging] = createSignal(false)

  const directory = createMemo(
    () => layout.home.selection().directory ?? layout.projects.list()[0]?.worktree ?? "",
  )

  const [agents, { refetch }] = createResource(reloadKey, async (): Promise<AgentRow[]> => {
    const client = sdk().client as unknown as {
      agent?: { list(input: unknown): Promise<{ data?: unknown }> }
    }
    if (!client.agent) return []
    const result = await client.agent.list({ location: { directory: directory() } })
    const list = (Array.isArray(result?.data) ? result.data : []) as Array<Record<string, unknown>>
    return list
      .filter((entry) => entry.hidden !== true)
      .map((entry) => {
        const name = String(entry.name ?? entry.id ?? "")
        const model = entry.model as { providerID?: string; modelID?: string } | undefined
        return {
          id: String(entry.id ?? name),
          name,
          description: typeof entry.description === "string" ? entry.description : undefined,
          mode: typeof entry.mode === "string" ? entry.mode : "all",
          model: model?.modelID ? `${model.providerID ?? ""}/${model.modelID}` : undefined,
          prompt: typeof entry.prompt === "string" ? entry.prompt : undefined,
          temperature: typeof entry.temperature === "number" ? entry.temperature : undefined,
        }
      })
  })

  /**
   * The global config file the agents are written into. `PathInfo.config` is the
   * global config directory the server itself reports, so the panel opens the
   * real file rather than a path guessed from the source tree.
   */
  const configPath = createMemo(() => `${serverSync().data.path.config ?? ""}/zyraxon.jsonc`)

  function reload() {
    setReloadKey((value) => value + 1)
  }

  async function openConfig() {
    const path = configPath()
    if (!path) return
    if (platform.openPath) {
      await platform.openPath(path).catch(() => {})
      return
    }
    await platform.openLink(`file://${path}`)
  }

  function createAgent() {
    dialog.show(() => <DialogCreateAgent onSaved={reload} />)
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.agents")}</h2>
      </div>
      <div class="settings-v2-tab-body">
        <div
          class="settings-v2-section zy-agents-dropzone"
          classList={{ "zy-agents-dropzone--active": dragging() }}
          data-action="settings-agents-dropzone"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={(event) => void onDrop(event)}
        >
          <div class="zy-agents-head">
            <div class="zy-agents-heading">
              <h3 class="zy-agents-title">{language.t("settings.agents.title")}</h3>
              <p class="zy-agents-sub">{language.t("settings.agents.description")}</p>
            </div>
            <div class="settings-v2-inline">
              <ButtonV2 size="small" variant="ghost-muted" icon="zy-repositories" onClick={() => void openConfig()}>
                {language.t("settings.agents.openConfig")}
              </ButtonV2>
              <ButtonV2 size="small" variant="neutral" icon="plus" onClick={createAgent}>
                {language.t("settings.agents.create.action")}
              </ButtonV2>
              <ButtonV2
                size="small"
                variant="neutral"
                icon="upload"
                data-action="settings-agents-import"
                onClick={importAgent}
              >
                {language.t("settings.agents.import")}
              </ButtonV2>
            </div>
          </div>

          <SettingsListV2>
            <For each={agents() ?? []}>
              {(agent) => (
                <SettingsRowV2
                  title={agent.name}
                  description={agent.description ?? language.t("settings.agents.rules.at", { path: configPath() })}
                >
                  <div class="zy-agents-row-actions">
                    <Tag variant="neutral">{agent.mode}</Tag>
                    <Show when={agent.model}>
                      <span class="settings-v2-mono">{agent.model}</span>
                    </Show>
                    <button
                      type="button"
                      class="zy-agents-row-action"
                      data-action="settings-agents-export"
                      onClick={() => exportAgent(agent)}
                    >
                      {language.t("settings.agents.export")}
                    </button>
                    <button
                      type="button"
                      class="zy-agents-row-action"
                      data-action="settings-agents-delete"
                      onClick={() => void deleteAgent(agent.name)}
                    >
                      {language.t("common.delete")}
                    </button>
                  </div>
                </SettingsRowV2>
              )}
            </For>
          </SettingsListV2>
          <p class="zy-agents-hint zy-agents-drop-hint">{language.t("settings.agents.dropHint")}</p>
        </div>
      </div>
    </>
  )

  async function deleteAgent(name: string) {
    const current = (serverSync().data.config.agent ?? {}) as Record<string, AgentConfigEntry>
    if (!current[name]) return
    const next = { ...current }
    delete next[name]
    await serverSync().updateConfig({ agent: next })
    reload()
  }

  /**
   * Write the agent out as a portable file. The list already carries the prompt,
   * so the export is the same data the panel shows; nothing is read from disk and
   * the agent is never modified, which keeps a share from having side effects.
   */
  function exportAgent(agent: AgentRow) {
    try {
      downloadAgentFile({
        name: agent.name,
        description: agent.description,
        mode: (agent.mode as "primary" | "subagent" | "all") ?? "all",
        model: agent.model,
        temperature: agent.temperature,
        prompt: agent.prompt,
      })
      showToast({ title: language.t("settings.agents.exported"), variant: "success" })
    } catch {
      showToast({ title: language.t("settings.agents.export.error") })
    }
  }

  /**
   * Read a portable file back in. The picker is a hidden file input so the same
   * code path works in the desktop shell and a browser, and the parsed agent is
   * merged into the global config the panel and the CLI both read. An existing
   * agent of the same name is replaced, which is what a re-import should do.
   */
  function importAgent() {
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

  /**
   * Take the text of a dropped or picked file and register it as an agent. Both
   * the picker and the drop zone funnel through here so there is one place that
   * validates, one place that writes, and one place that reports failure.
   */
  async function importFile(file: File) {
    try {
      const parsed = parseAgentFile(await file.text())
      if (!parsed.ok) {
        showToast({ title: language.t("settings.agents.import.error") })
        return
      }
      const current = (serverSync().data.config.agent ?? {}) as Record<string, AgentConfigEntry>
      await serverSync().updateConfig({
        agent: { ...current, [parsed.file.name]: toConfigEntry(parsed.file) },
      })
      showToast({ title: language.t("settings.agents.imported"), variant: "success" })
      reload()
    } catch {
      showToast({ title: language.t("settings.agents.import.error") })
    }
  }

  /**
   * A dropped file is the shortest path from "someone sent me an agent" to "it is
   * mine", so the whole list doubles as a drop target. The tracker keeps the
   * highlight steady while the pointer moves across the rows inside the panel,
   * which otherwise fire dragleave on every child.
   */
  const drag = createDragTracker()

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
}

/**
 * The create form writes the same shape the CLI accepts: a name, what it is for,
 * how it should run, and the instructions it obeys. Nothing is written until the
 * form is submitted, and the name is normalised to the identifier the config and
 * the mode selector both key on.
 */
const DialogCreateAgent: Component<{ onSaved: () => void }> = (props) => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const dialog = useDialog()
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [mode, setMode] = createSignal<string>("primary")
  const [prompt, setPrompt] = createSignal("")
  const [saving, setSaving] = createSignal(false)

  const slug = createMemo(() =>
    name()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  )
  const valid = createMemo(() => slug().length > 0)

  async function submit(event: Event) {
    event.preventDefault()
    if (!valid() || saving()) return
    setSaving(true)
    try {
      const current = (serverSync().data.config.agent ?? {}) as Record<string, AgentConfigEntry>
      await serverSync().updateConfig({
        agent: {
          ...current,
          [slug()]: {
            description: description().trim() || undefined,
            mode: mode() as "primary" | "subagent" | "all",
            prompt: prompt().trim() || undefined,
          },
        },
      })
      showToast({ title: language.t("settings.agents.saved") })
      props.onSaved()
      dialog.close()
    } catch {
      showToast({ title: language.t("settings.agents.error") })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog fit>
      <form onSubmit={submit} class="contents">
        <DialogHeader>
          <DialogTitle>{language.t("settings.agents.create.title")}</DialogTitle>
        </DialogHeader>
        <DividerV2 />
        <DialogBody class="flex max-h-[min(560px,calc(100vh-160px))] w-full flex-col gap-6 overflow-y-auto px-4 pt-4 pb-1">
          <Field>
            <Field.Label>{language.t("settings.agents.field.name")}</Field.Label>
            <TextInputV2
              autofocus
              appearance="large"
              class="!w-full"
              value={name()}
              placeholder={language.t("settings.agents.field.name.placeholder")}
              onInput={(event) => setName(event.currentTarget.value)}
            />
            <Show when={name().trim() && slug() !== name().trim()}>
              <span class="zy-agents-hint">
                <span class="settings-v2-mono">{slug()}</span>
              </span>
            </Show>
          </Field>

          <Field>
            <Field.Label>{language.t("settings.agents.field.description")}</Field.Label>
            <TextInputV2
              appearance="large"
              class="!w-full"
              value={description()}
              placeholder={language.t("settings.agents.field.description.placeholder")}
              onInput={(event) => setDescription(event.currentTarget.value)}
            />
          </Field>

          <Field>
            <Field.Label>{language.t("settings.agents.field.mode")}</Field.Label>
            <SelectV2
              appearance="large"
              data-action="settings-agents-create-mode"
              options={MODES as unknown as string[]}
              current={mode()}
              value={(option) => option}
              label={(option) => option}
              onSelect={(option) => {
                if (option) setMode(option)
              }}
            />
          </Field>

          <Field>
            <Field.Label>{language.t("settings.agents.field.prompt")}</Field.Label>
            <TextareaV2
              class="!w-full"
              rows={6}
              value={prompt()}
              placeholder={language.t("settings.agents.field.prompt.placeholder")}
              onInput={(event) => setPrompt(event.currentTarget.value)}
            />
          </Field>

          <p class="zy-agents-hint">
            {language.t("settings.agents.rules.willCreate")}
          </p>
        </DialogBody>
        <DialogFooter>
          <ButtonV2 type="button" variant="neutral" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </ButtonV2>
          <ButtonV2 type="submit" variant="contrast" disabled={!valid() || saving()}>
            {language.t("common.save")}
          </ButtonV2>
        </DialogFooter>
      </form>
    </Dialog>
  )
}