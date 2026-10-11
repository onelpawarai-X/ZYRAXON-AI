// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, For, Show, createMemo, createResource } from "solid-js"
import { Tag } from "@zyraxon-ai/ui/v2/badge-v2"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useLayout } from "@/context/layout"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

/**
 * An agent is a markdown file, so the panel reads the ones that exist on disk and
 * points at the file each one obeys. The list endpoint reports identity and
 * behaviour but no path, so the file location is built from the same directory
 * the CLI reads agents from rather than invented per row.
 */
const AGENT_DIR = ".zyraxon/agent"

type AgentRow = {
  id: string
  name: string
  description?: string
  mode: string
  model?: string
  path: string
}

/**
 * The only agent routes the API exposes are list and delete, so the panel offers
 * exactly that: read what is registered, remove one, and say plainly where to
 * add a new one rather than showing a create button that cannot work.
 */
export const SettingsAgentsV2: Component = () => {
  const language = useLanguage()
  const sdk = useServerSDK()
  const layout = useLayout()

  const directory = createMemo(
    () => layout.home.selection().directory ?? layout.projects.list()[0]?.worktree ?? "",
  )

  const [agents, { refetch }] = createResource(async (): Promise<AgentRow[]> => {
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
          path: `${AGENT_DIR}/${name}.md`,
        }
      })
  })

  return (
    <div class="settings-v2-section">
      <SettingsListV2>
        <For each={agents() ?? []}>
          {(agent) => (
            <SettingsRowV2
              title={agent.name}
              description={agent.description ?? language.t("settings.agents.rules.at", { path: agent.path })}
            >
              <div class="settings-v2-inline">
                <Tag variant="neutral">
                  {agent.mode}
                </Tag>
                <Show when={agent.model}>
                  <span class="settings-v2-mono">{agent.model}</span>
                </Show>
              </div>
            </SettingsRowV2>
          )}
        </For>

        <SettingsRowV2
          title={language.t("settings.agents.create.title")}
          description={language.t("settings.agents.rules.at", { path: AGENT_DIR })}
        >
          <button
            type="button"
            class="settings-v2-path-button"
            data-action="settings-agents-reload"
            onClick={() => void refetch()}
          >
            {language.t("settings.agents.reload")}
          </button>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}