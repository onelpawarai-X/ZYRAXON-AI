import { type Accessor, createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { DateTime } from "luxon"
import { filter, firstBy, flat, groupBy, mapValues, pipe, uniqueBy, values } from "remeda"
import { createSimpleContext } from "@zyraxon-ai/ui/context"
import { useProviders } from "@/hooks/use-providers"
import { Persist, persisted } from "@/utils/persist"

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

export const LOCAL_PINNED: LocalPinnedModel[] = [
  { id: "pinned-dolphin-8b", name: "Dolphin 2.9 Llama3 8B (5.7GB)", family: "chat", contextLength: 8192, release_date: "2024-01-01", attachment: false, reasoning: true, temperature: true, tool_call: true, cost: undefined, limit: { context: 8192, input: 8192, output: 4096 }, status: "active", hfUrl: "https://huggingface.co/bartowski/dolphin-2.9-llama3-8b-GGUF", hfSizeGB: 5.7, ggufPattern: "*q4_k_m*", downloadUrl: "https://huggingface.co/bartowski/dolphin-2.9-llama3-8b-GGUF/resolve/main/dolphin-2.9-llama3-8b-Q5_K_M.gguf", hfFile: "dolphin-2.9-llama3-8b-Q5_K_M.gguf" },
  { id: "pinned-dolphin-70b", name: "Dolphin 2.9 Llama3 70B (40GB)", family: "chat-large", contextLength: 8192, release_date: "2024-01-01", attachment: false, reasoning: true, temperature: true, tool_call: true, cost: undefined, limit: { context: 8192, input: 8192, output: 4096 }, status: "active", hfUrl: "https://huggingface.co/bartowski/dolphin-2.9-llama3-70b-GGUF", hfSizeGB: 40, ggufPattern: "*q4_k_m*", downloadUrl: "https://huggingface.co/bartowski/dolphin-2.9-llama3-70b-GGUF/resolve/main/dolphin-2.9-llama3-70b-Q4_K_M.gguf", hfFile: "dolphin-2.9-llama3-70b-Q4_K_M.gguf" },
  { id: "pinned-deepseek-r1", name: "DeepSeek R1 Distill 70B (42GB)", family: "chat-large", contextLength: 128000, release_date: "2025-01-01", attachment: false, reasoning: true, temperature: true, tool_call: true, cost: undefined, limit: { context: 128000, input: 128000, output: 4096 }, status: "active", hfUrl: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Llama-70B-GGUF", hfSizeGB: 42, ggufPattern: "*q4_k_m*", downloadUrl: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Llama-70B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-70B-Q4_K_M.gguf", hfFile: "DeepSeek-R1-Distill-Llama-70B-Q4_K_M.gguf" },
  { id: "pinned-qwen-72b", name: "Qwen2.5 Coder 72B (45GB)", family: "chat-large", contextLength: 128000, release_date: "2024-12-01", attachment: false, reasoning: true, temperature: true, tool_call: true, cost: undefined, limit: { context: 128000, input: 128000, output: 4096 }, status: "active", hfUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-72B-Instruct-GGUF", hfSizeGB: 45, ggufPattern: "*q4_k_m*", downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-72B-Instruct-GGUF/resolve/main/qwen2.5-coder-72b-instruct-q4_k_m.gguf", hfFile: "qwen2.5-coder-72b-instruct-q4_k_m.gguf" },
  { id: "pinned-flux-dev", name: "FLUX.1 Dev (4GB)", family: "image", contextLength: 0, release_date: "2024-08-01", attachment: false, reasoning: false, temperature: true, tool_call: false, cost: undefined, limit: { context: 0, input: 0, output: 0 }, status: "active", hfUrl: "https://huggingface.co/city96/FLUX.1-dev-gguf", hfSizeGB: 4, ggufPattern: "*.gguf", downloadUrl: "https://huggingface.co/city96/FLUX.1-dev-gguf/resolve/main/flux1-dev-Q2_K.gguf", hfFile: "flux1-dev-Q2_K.gguf" },
  { id: "pinned-flux-schnell", name: "FLUX.1 Schnell (4GB)", family: "image", contextLength: 0, release_date: "2024-08-01", attachment: false, reasoning: false, temperature: true, tool_call: false, cost: undefined, limit: { context: 0, input: 0, output: 0 }, status: "active", hfUrl: "https://huggingface.co/city96/FLUX.1-schnell-gguf", hfSizeGB: 4, ggufPattern: "*.gguf", downloadUrl: "https://huggingface.co/city96/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-Q2_K.gguf", hfFile: "flux1-schnell-Q2_K.gguf" },
  { id: "pinned-wan-video", name: "Wan2.1 T2V 1.3B (3.2GB)", family: "video", contextLength: 0, release_date: "2025-03-01", attachment: false, reasoning: false, temperature: true, tool_call: false, cost: undefined, limit: { context: 0, input: 0, output: 0 }, status: "active", hfUrl: "https://huggingface.co/city96/Wan2.1-T2V-1.3B-GGUF", hfSizeGB: 3.2, ggufPattern: "*.gguf", downloadUrl: "https://huggingface.co/city96/Wan2.1-T2V-1.3B-GGUF/resolve/main/wan2.1-t2v-1.3b-Q4_K_M.gguf", hfFile: "wan2.1-t2v-1.3b-Q4_K_M.gguf" },
  { id: "pinned-wan-video-small", name: "Wan2.1 T2V 1.3B Small (3.2GB)", family: "video", contextLength: 0, release_date: "2025-03-01", attachment: false, reasoning: false, temperature: true, tool_call: false, cost: undefined, limit: { context: 0, input: 0, output: 0 }, status: "active", hfUrl: "https://huggingface.co/city96/Wan2.1-T2V-1.3B-GGUF", hfSizeGB: 3.2, ggufPattern: "*.gguf", downloadUrl: "https://huggingface.co/city96/Wan2.1-T2V-1.3B-GGUF/resolve/main/wan2.1-t2v-1.3b-Q4_K_M.gguf", hfFile: "wan2.1-t2v-1.3b-Q4_K_M.gguf" },
  { id: "pinned-musicgen", name: "MusicGen Medium (3GB)", family: "audio", contextLength: 0, release_date: "2024-06-01", attachment: false, reasoning: false, temperature: true, tool_call: false, cost: undefined, limit: { context: 0, input: 0, output: 0 }, status: "active", hfUrl: "https://huggingface.co/facebook/musicgen-medium", hfSizeGB: 3, ggufPattern: "*.safetensors", downloadUrl: "https://huggingface.co/facebook/musicgen-medium/resolve/main/musicgen-medium.safetensors", hfFile: "musicgen-medium.safetensors" },
  { id: "pinned-bark", name: "Bark Small (2GB)", family: "tts", contextLength: 0, release_date: "2024-06-01", attachment: false, reasoning: false, temperature: true, tool_call: false, cost: undefined, limit: { context: 0, input: 0, output: 0 }, status: "active", hfUrl: "https://huggingface.co/suno/bark", hfSizeGB: 2, ggufPattern: "*.safetensors", downloadUrl: "https://huggingface.co/suno/bark/resolve/main/bark_small.safetensors", hfFile: "bark_small.safetensors" },
  { id: "pinned-xtts", name: "XTTS v2 TTS (5GB)", family: "tts", contextLength: 0, release_date: "2024-08-01", attachment: false, reasoning: false, temperature: true, tool_call: false, cost: undefined, limit: { context: 0, input: 0, output: 0 }, status: "active", hfUrl: "https://huggingface.co/coqui/XTTS-v2", hfSizeGB: 5, ggufPattern: "*.safetensors", downloadUrl: "https://huggingface.co/coqui/XTTS-v2/resolve/main/model.pth", hfFile: "model.pth" },
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

      const localModels = Object.values(LOCAL_PROVIDER.models).map((m) => ({
        ...m,
        provider: LOCAL_PROVIDER,
      }))

      // Merge: local first, then opencode free, then connected
      // Deduplicate by id+provider
      const seen = new Set<string>()
      const result: any[] = []
      for (const m of [...localModels, ...opencodeFreeModels, ...connectedModels]) {
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
      localPinned: LOCAL_PINNED,
      isDownloaded: isModelDownloaded,
      markDownloaded: markModelDownloaded,
    }
  },
})
