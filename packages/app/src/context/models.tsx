// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Accessor, createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { DateTime } from "luxon"
import { filter, firstBy, flat, groupBy, mapValues, pipe, uniqueBy, values } from "remeda"
import { createSimpleContext } from "@zyraxon-ai/ui/context"
import { useProviders } from "@/hooks/use-providers"
import { Persist, persisted } from "@/utils/persist"
import { createSdkForServer } from "@/utils/server"
import { useServer } from "./server"

export type LocalPinnedModel = {
  id: string; name: string; family: string; contextLength: number;
  release_date: string; attachment: boolean; reasoning: boolean; temperature: boolean;
  tool_call: boolean; cost: undefined;
  limit: { context: number; input: number; output: number };
  status: "active";
  hfUrl: string; hfSizeGB: number; ggufPattern: string; downloadUrl: string; hfFile: string;
}

const DOWNLOADED_MODELS_KEY = "zyraxon-downloaded-models"

function getDownloadedModels(): Set<string> {
  try {
    const raw = localStorage.getItem(DOWNLOADED_MODELS_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function markModelDownloaded(modelId: string) {
  const set = getDownloadedModels()
  set.add(modelId)
  localStorage.setItem(DOWNLOADED_MODELS_KEY, JSON.stringify([...set]))
}

function isModelDownloaded(modelId: string): boolean {
  return getDownloadedModels().has(modelId)
}

// The model selector must only ever offer models that actually exist on this
// machine. Nothing is hardcoded here: Settings → Local scans the disk and
// downloads from Hugging Face into the models folder, and whatever is present
// there is what the local provider exposes.
const LOCAL_PROVIDER = {
  id: "local",
  name: "Local Models",
  source: "custom" as const,
  env: [],
  options: {},
  models: {} as Record<string, LocalPinnedModel>,
}

export type ModelKey = { providerID: string; modelID: string }

type Visibility = "show" | "hide"
type User = ModelKey & { visibility: Visibility; favorite?: boolean }
type Store = {
  user: User[]
  recent: ModelKey[]
  variant?: Record<string, string | undefined>
}

const RECENT_LIMIT = 5

function modelKey(model: ModelKey) {
  return `${model.providerID}:${model.modelID}`
}

export const { use: useModels, provider: ModelsProvider } = createSimpleContext({
  name: "Models",
  gate: false,
  init: (props: { directory?: Accessor<string | undefined> }) => {
    const providers = useProviders(props.directory)
    const server = useServer()
    const serverUrl = () => server.current?.http?.url

    // Models actually present on disk. The server scans the model directory, so
    // this is the source of truth for "downloaded" — localStorage is only a
    // cache for the brief window before the first scan returns.
    const [serverModels, { refetch: refetchServerModels }] = createResource(serverUrl, async (url) => {
      if (!url) return [] as string[]
      try {
        const res = await fetch(`${url}/local/models`)
        if (!res.ok) return [] as string[]
        const data = (await res.json()) as Array<{ id: string }>
        return data.map((m) => m.id)
      } catch {
        return [] as string[]
      }
    })

    const downloadedIds = createMemo(() => {
      const set = getDownloadedModels()
      for (const id of serverModels() ?? []) set.add(id)
      return set
    })
    const isDownloaded = (modelId: string) => downloadedIds().has(modelId)

    const downloadModel = async (input: { repo: string; file: string }) => {
      const url = serverUrl()
      if (!url) return { success: false, error: "No server connection" }
      try {
        const res = await fetch(`${url}/local/download`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        })
        if (!res.ok) return { success: false, error: await res.text() }
        const model = (await res.json()) as { id: string }
        markModelDownloaded(model.id)
        void refetchServerModels()
        return { success: true, model }
      } catch (err: any) {
        return { success: false, error: err?.message ?? "Download failed" }
      }
    }

    const searchLocalModels = async (query: string) => {
      const url = serverUrl()
      if (!url) return []
      try {
        const res = await fetch(`${url}/local/search?q=${encodeURIComponent(query)}`)
        if (!res.ok) return []
        return (await res.json()) as Array<{ id: string; downloads: number; likes: number; kind: string }>
      } catch {
        return []
      }
    }

    const [store, setStore, _, ready] = persisted(
      Persist.global("model", ["model.v1"]),
      createStore<Store>({
        user: [],
        recent: [],
        variant: {},
      }),
    )

    const available = createMemo(() => {
      const all = providers.all()
      const connectedList = providers.connected()
      const entries = all instanceof Map ? [...all.entries()] : (Array.isArray(all) ? all : [])

      // Connected providers → all their models
      const connectedIds = new Set(connectedList.map((p: any) => p.id))
      const connectedModels = entries
        .filter(([id]: any) => connectedIds.has(id))
        .flatMap(([, p]: any) =>
          Object.values(p?.models ?? {}).map((m: any) => ({
            ...m,
            provider: p,
          })),
        )

      // Opencode provider → free models ONLY (even if not connected)
      const opencodeEntry = entries.find(([id]: any) => id === "opencode")
      const opencodeFreeModels = opencodeEntry
        ? Object.values(opencodeEntry[1]?.models ?? {})
            .filter((m: any) => !m.cost || m.cost.input === 0)
            .map((m: any) => ({ ...m, provider: opencodeEntry[1] }))
        : []

      // ZYRAXON provider → its own models first, so the house provider is
      // always the first group in the picker and the default selection.
      const zyraxonEntry = entries.find(([id]: any) => id === "zyraxon")
      const zyraxonModels = zyraxonEntry
        ? Object.values(zyraxonEntry[1]?.models ?? {}).map((m: any) => ({ ...m, provider: zyraxonEntry[1] }))
        : []

      // Local models come from the server's disk scan, never from a hardcoded
      // list. If the provider is present, its models are whatever is installed.
      const localEntry = entries.find(([id]: any) => id === "local")
      const localModels = localEntry
        ? Object.values(localEntry[1]?.models ?? {}).map((m: any) => ({ ...m, provider: localEntry[1] }))
        : Object.values(LOCAL_PROVIDER.models).map((m) => ({ ...m, provider: LOCAL_PROVIDER }))

      // Merge: zyraxon first (the house provider is pinned on top), then local,
      // then opencode free, then connected.
      // Deduplicate by id+provider
      const seen = new Set<string>()
      const result: any[] = []
      for (const m of [...zyraxonModels, ...localModels, ...opencodeFreeModels, ...connectedModels]) {
        const key = `${m.provider.id}:${m.id}`
        if (!seen.has(key)) { seen.add(key); result.push(m) }
      }
      return result
    })

    const release = createMemo(
      () =>
        new Map(
          available().map((model) => {
            const parsed = DateTime.fromISO(model.release_date)
            return [modelKey({ providerID: model.provider.id, modelID: model.id }), parsed] as const
          }),
        ),
    )

    const latest = createMemo(() =>
      pipe(
        available(),
        filter(
          (x) =>
            Math.abs(
              (release().get(modelKey({ providerID: x.provider.id, modelID: x.id })) ?? DateTime.invalid("invalid"))
                .diffNow()
                .as("months"),
            ) < 6,
        ),
        groupBy((x) => x.provider.id),
        mapValues((models) =>
          pipe(
            models,
            groupBy((x) => x.family),
            values(),
            (groups) =>
              groups.flatMap((g) => {
                const first = firstBy(g, [(x) => x.release_date, "desc"])
                return first ? [{ modelID: first.id, providerID: first.provider.id }] : []
              }),
          ),
        ),
        values(),
        flat(),
      ),
    )

    const latestSet = createMemo(() => new Set(latest().map((x) => modelKey(x))))

    const visibility = createMemo(() => {
      const map = new Map<string, Visibility>()
      for (const item of store.user) map.set(`${item.providerID}:${item.modelID}`, item.visibility)
      return map
    })

    const list = createMemo(() =>
      available().map((m) => ({
        ...m,
        name: m.name.replace("(latest)", "").trim(),
        latest: m.name.includes("(latest)"),
      })),
    )

    const find = (key: ModelKey) => list().find((m) => m.id === key.modelID && m.provider.id === key.providerID)

    function update(model: ModelKey, state: Visibility) {
      const index = store.user.findIndex((x) => x.modelID === model.modelID && x.providerID === model.providerID)
      if (index >= 0) {
        setStore("user", index, (current) => ({ ...current, visibility: state }))
        return
      }
      setStore("user", store.user.length, { ...model, visibility: state })
    }

    const visible = (model: ModelKey) => {
      const key = modelKey(model)
      const state = visibility().get(key)
      if (state === "hide") return false
      if (state === "show") return true
      if (model.providerID === "local") return true
      if (model.providerID === "opencode") return true
      return true
    }

    const setVisibility = (model: ModelKey, state: boolean) => {
      update(model, state ? "show" : "hide")
    }

    const push = (model: ModelKey) => {
      const uniq = uniqueBy([model, ...store.recent], (x) => `${x.providerID}:${x.modelID}`)
      if (uniq.length > RECENT_LIMIT) uniq.pop()
      setStore("recent", uniq)
    }

    const variantKey = (model: ModelKey) => `${model.providerID}/${model.modelID}`
    const getVariant = (model: ModelKey) => store.variant?.[variantKey(model)]

    const setVariant = (model: ModelKey, value: string | undefined) => {
      const key = variantKey(model)
      if (!store.variant) {
        setStore("variant", { [key]: value })
        return
      }
      setStore("variant", key, value)
    }

    const [recentModels] = createResource(
      async () => {
        const recent = store.recent
        await ready.promise
        return recent
      },
      (p) => p,
      { initialValue: [] },
    )
    return {
      ready,
      list,
      find,
      visible,
      setVisibility,
      recent: {
        list: () => recentModels()!,
        push,
      },
      variant: {
        get: getVariant,
        set: setVariant,
      },
      // Local models are managed entirely from Settings → Local (disk scan plus
      // Hugging Face download). The selector only reflects what is installed.
      isDownloaded,
      downloadModel,
      searchLocalModels,
    }
  },
})
