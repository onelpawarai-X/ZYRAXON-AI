import { type Accessor, createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { DateTime } from "luxon"
import { filter, firstBy, flat, groupBy, mapValues, pipe, uniqueBy, values } from "remeda"
import { createSimpleContext } from "@zyraxon-ai/ui/context"
import { useProviders } from "@/hooks/use-providers"
import { Persist, persisted } from "@/utils/persist"

const LOCAL_PINNED = [
  { id: "pinned-dolphin-8b", name: "Dolphin 2.9 Llama3 8B (5.7GB)", family: "chat", contextLength: 8192, release_date: "2024-01-01", attachment: false, reasoning: true, temperature: true, tool_call: true, cost: undefined, limit: { context: 8192, input: 8192, output: 4096 }, status: "active" as const },
  { id: "pinned-dolphin-70b", name: "Dolphin 2.9 Llama3 70B (40GB)", family: "chat-large", contextLength: 8192, release_date: "2024-01-01", attachment: false, reasoning: true, temperature: true, tool_call: true, cost: undefined, limit: { context: 8192, input: 8192, output: 4096 }, status: "active" as const },
  { id: "pinned-flux-dev", name: "FLUX.1 Dev (4GB)", family: "image", contextLength: 0, release_date: "2024-01-01", attachment: false, reasoning: false, temperature: true, tool_call: false, cost: undefined, limit: { context: 0, input: 0, output: 0 }, status: "active" as const },
  { id: "pinned-wan-video", name: "Wan2.1 T2V 1.3B (3.2GB)", family: "video", contextLength: 0, release_date: "2024-01-01", attachment: false, reasoning: false, temperature: true, tool_call: false, cost: undefined, limit: { context: 0, input: 0, output: 0 }, status: "active" as const },
  { id: "pinned-musicgen", name: "MusicGen Medium (3GB)", family: "audio", contextLength: 0, release_date: "2024-01-01", attachment: false, reasoning: false, temperature: true, tool_call: false, cost: undefined, limit: { context: 0, input: 0, output: 0 }, status: "active" as const },
  { id: "pinned-bark", name: "Bark Small TTS (2GB)", family: "tts", contextLength: 0, release_date: "2024-01-01", attachment: false, reasoning: false, temperature: true, tool_call: false, cost: undefined, limit: { context: 0, input: 0, output: 0 }, status: "active" as const },
]

const LOCAL_PROVIDER = {
  id: "local",
  name: "Local Models",
  source: "custom" as const,
  env: [],
  options: {},
  models: Object.fromEntries(LOCAL_PINNED.map((m) => [m.id, m])),
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
  init: (props: { directory?: Accessor<string | undefined> } = {}) => {
    const providers = useProviders(props.directory)

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
      if (!all) return []
      const connectedIds = new Set(connectedList.map((p: any) => p.id))
      const entries = all instanceof Map ? [...all.entries()] : (Array.isArray(all) ? all : [])
      const connectedModels = entries
        .filter(([id]: any) => connectedIds.has(id))
        .flatMap(([, p]: any) =>
          Object.values(p?.models ?? {}).map((m: any) => ({
            ...m,
            provider: p,
          })),
        )
      const localModels = Object.values(LOCAL_PROVIDER.models).map((m) => ({
        ...m,
        provider: LOCAL_PROVIDER,
      }))
      return [...localModels, ...connectedModels]
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
      if (latestSet().has(key)) return true
      const date = release().get(key)
      if (!date?.isValid) return true
      return false
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
    }
  },
})
