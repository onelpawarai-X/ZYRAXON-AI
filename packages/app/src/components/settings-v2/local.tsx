// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, For, Show, createMemo, createResource, createSignal } from "solid-js"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@zyraxon-ai/ui/v2/icon"
import { IconButtonV2 } from "@zyraxon-ai/ui/v2/icon-button-v2"
import { TextInputV2 } from "@zyraxon-ai/ui/v2/text-input-v2"
import { Tag } from "@zyraxon-ai/ui/v2/badge-v2"
import { useLanguage } from "@/context/language"
import { useModels } from "@/context/models"
import { useServer } from "@/context/server"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

type LocalModel = {
  id: string
  name: string
  path: string
  sizeBytes: number
  quantization?: string
  family?: string
  kind: string
}

type HfResult = {
  id: string
  downloads: number
  likes: number
  pipelineTag?: string
  kind: string
}

type HfFile = { name: string; sizeBytes: number }

type DownloadProgress = {
  id: string
  filename: string
  receivedBytes: number
  totalBytes: number
  done: boolean
  error?: string
}

type Backend = { name: string; available: boolean; path?: string }

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  const size = value / 1024 ** index
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

/**
 * The Local panel is the single place a model becomes usable offline: it lists
 * what the server already scanned on this machine, searches the Hugging Face Hub
 * for more, and downloads a chosen file straight into the models folder. A
 * download is picked up by the provider scan on the next request, so nothing here
 * has to register the model by hand.
 */
export const SettingsLocalV2: Component = () => {
  const language = useLanguage()
  const models = useModels()
  const server = useServer()
  const baseUrl = () => server.current?.http?.url

  const [query, setQuery] = createSignal("")
  const [searching, setSearching] = createSignal(false)
  const [results, setResults] = createSignal<HfResult[]>([])
  const [searched, setSearched] = createSignal(false)
  const [expanded, setExpanded] = createSignal<string>()
  const [files, setFiles] = createSignal<HfFile[]>([])
  const [filesLoading, setFilesLoading] = createSignal(false)
  const [downloading, setDownloading] = createSignal<string>()

  const [installed, { refetch: refetchInstalled }] = createResource(
    () => baseUrl(),
    async (url): Promise<LocalModel[]> => {
      const res = await fetch(`${url}/local/models`)
      if (!res.ok) return []
      return (await res.json()) as LocalModel[]
    },
  )

  const [backends] = createResource(
    () => baseUrl(),
    async (url): Promise<Backend[]> => {
      const res = await fetch(`${url}/local/backends`)
      if (!res.ok) return []
      return (await res.json()) as Backend[]
    },
  )

  const ready = createMemo(() => (backends() ?? []).some((entry) => entry.available))

  async function runSearch() {
    const value = query().trim()
    if (!value) return
    setSearching(true)
    setExpanded(undefined)
    try {
      const found = await models.searchLocalModels(value)
      setResults(found as HfResult[])
      setSearched(true)
    } finally {
      setSearching(false)
    }
  }

  async function openRepo(repo: string) {
    if (expanded() === repo) {
      setExpanded(undefined)
      return
    }
    const url = baseUrl()
    if (!url) return
    setExpanded(repo)
    setFiles([])
    setFilesLoading(true)
    try {
      const res = await fetch(`${url}/local/files?repo=${encodeURIComponent(repo)}`)
      setFiles(res.ok ? ((await res.json()) as HfFile[]) : [])
    } finally {
      setFilesLoading(false)
    }
  }

  async function download(repo: string, file: string) {
    const key = `${repo}::${file}`
    if (downloading()) return
    setDownloading(key)
    try {
      const result = await models.downloadModel({ repo, file })
      if (!result.success) {
        showToast({
          title: language.t("settings.local.download"),
          description: result.error ?? language.t("settings.local.generate.error"),
        })
        return
      }
      showToast({ title: language.t("settings.local.downloaded"), description: file })
      setExpanded(undefined)
      void refetchInstalled()
    } finally {
      setDownloading(undefined)
    }
  }

  const kindLabel = (kind: string) => {
    const map: Record<string, string> = {
      text: language.t("settings.local.kind.text"),
      image: language.t("settings.local.kind.image"),
      video: language.t("settings.local.kind.video"),
      audio: language.t("settings.local.kind.audio"),
    }
    return map[kind] ?? language.t("settings.local.kind.text")
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <h2 class="settings-v2-tab-title">{language.t("settings.local.title")}</h2>
        <p class="settings-v2-hint">{language.t("settings.local.description")}</p>
        <div class="settings-v2-tab-search">
          <TextInputV2
            type="search"
            appearance="base"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runSearch()
            }}
            placeholder={language.t("settings.local.search.placeholder")}
            spellcheck={false}
            autocorrect="off"
            autocomplete="off"
            aria-label={language.t("settings.local.search.placeholder")}
          />
          <ButtonV2
            size="small"
            variant="neutral"
            icon="magnifying-glass"
            disabled={searching() || !query().trim()}
            onClick={() => void runSearch()}
          >
            {language.t("settings.local.search.action")}
          </ButtonV2>
        </div>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.local.backend.title")}</h3>
          <SettingsListV2>
            <For each={backends() ?? []}>
              {(backend) => (
                <SettingsRowV2 title={backend.name} description={backend.path ?? language.t("settings.local.backend.hint")}>
                  <Tag variant={backend.available ? "accent" : "neutral"}>
                    {backend.available
                      ? language.t("settings.local.backend.ready")
                      : language.t("settings.local.backend.missing")}
                  </Tag>
                </SettingsRowV2>
              )}
            </For>
          </SettingsListV2>
        </div>

        <Show when={results().length > 0 || searched()}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">Hugging Face</h3>
            <Show
              when={results().length > 0}
              fallback={<div class="settings-v2-models-status">{language.t("settings.local.search.empty")}</div>}
            >
              <SettingsListV2>
                <For each={results()}>
                  {(result) => (
                    <div data-component="settings-local-repo">
                      <SettingsRowV2
                        title={result.id}
                        description={`${language.t("settings.local.stats.downloads", { count: result.downloads.toLocaleString() })} · ${language.t("settings.local.stats.likes", { count: result.likes.toLocaleString() })} · ${kindLabel(result.kind)}`}
                      >
                        <div class="settings-v2-inline">
                          <Tag variant="neutral">{kindLabel(result.kind)}</Tag>
                          <ButtonV2
                            size="small"
                            variant={expanded() === result.id ? "ghost-muted" : "neutral"}
                            icon={expanded() === result.id ? "collapse" : "chevron-down"}
                            onClick={() => void openRepo(result.id)}
                          >
                            {language.t("settings.local.download")}
                          </ButtonV2>
                        </div>
                      </SettingsRowV2>
                      <Show when={expanded() === result.id}>
                        <Show
                          when={!filesLoading()}
                          fallback={<div class="settings-v2-models-status">{language.t("common.loading")}</div>}
                        >
                          <SettingsListV2>
                            <For each={files()}>
                              {(file) => {
                                const key = `${result.id}::${file.name}`
                                return (
                                  <SettingsRowV2 title={file.name} description={formatBytes(file.sizeBytes)}>
                                    <ButtonV2
                                      size="small"
                                      variant="neutral"
                                      icon="cloud"
                                      disabled={downloading() === key}
                                      onClick={() => void download(result.id, file.name)}
                                    >
                                      {downloading() === key
                                        ? language.t("settings.local.downloading")
                                        : language.t("settings.local.download")}
                                    </ButtonV2>
                                  </SettingsRowV2>
                                )
                              }}
                            </For>
                          </SettingsListV2>
                        </Show>
                      </Show>
                    </div>
                  )}
                </For>
              </SettingsListV2>
            </Show>
          </div>
        </Show>

        <div class="settings-v2-section">
          <div class="settings-v2-inline" style="justify-content: space-between; width: 100%">
            <h3 class="settings-v2-section-title">{language.t("settings.local.installed.title")}</h3>
            <IconButtonV2
              type="button"
              variant="ghost-muted"
              size="small"
              icon={<IconV2 name="refresh" size="large" class="text-v2-icon-icon-muted" />}
              aria-label={language.t("settings.local.installed.title")}
              onClick={() => void refetchInstalled()}
            />
          </div>
          <Show
            when={(installed() ?? []).length > 0}
            fallback={<div class="settings-v2-models-status">{language.t("settings.local.installed.empty")}</div>}
          >
            <SettingsListV2>
              <For each={installed() ?? []}>
                {(model) => (
                  <SettingsRowV2
                    title={model.name}
                    description={`${formatBytes(model.sizeBytes)}${model.quantization ? ` · ${model.quantization}` : ""}${model.family ? ` · ${model.family}` : ""}`}
                  >
                    <div class="settings-v2-inline">
                      <Tag variant="neutral">{kindLabel(model.kind)}</Tag>
                      <Show when={!ready()}>
                        <Tag variant="neutral">{language.t("settings.local.backend.missing")}</Tag>
                      </Show>
                    </div>
                  </SettingsRowV2>
                )}
              </For>
            </SettingsListV2>
          </Show>
        </div>
      </div>
    </>
  )
}
