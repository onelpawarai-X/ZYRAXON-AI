// ============================================================================
// ZYRAXON X — Pinned Model Registry
// ============================================================================
// 6 curated models — user downloads from model selector UI.
// Auto-scan: if GGUF already exists locally, download button hides.
// ============================================================================

import path from "path"

export type ModelCategory = "chat" | "chat-large" | "image" | "video" | "audio" | "tts"

export interface PinnedModel {
  id: string
  name: string
  category: ModelCategory
  description: string
  hfRepo: string
  hfFile: string
  downloadUrl: string
  expectedSizeBytes: number
  quantization: string
  family: string
  contextLength: number
  capabilities: {
    textInput: boolean
    imageInput: boolean
    audioInput: boolean
    textOutput: boolean
    imageOutput: boolean
    audioOutput: boolean
    videoOutput: boolean
    toolCall: boolean
    reasoning: boolean
  }
  serverFlags: string[]
  icon: string
  backend: "llama-server" | "python-diffusion" | "python-audiocraft" | "python-bark"
}

export const PINNED_MODELS: PinnedModel[] = [
  // ─── 1. CHAT SMALL — Dolphin 2.9 Llama3 8B (5.73GB) ───────────────────────
  {
    id: "pinned-dolphin-8b",
    name: "Dolphin 2.9 Llama3 8B",
    category: "chat",
    description: "Fast uncensored chat. Tool calling. 5.73GB — runs on any laptop.",
    hfRepo: "bartowski/dolphin-2.9-llama3-8b-GGUF",
    hfFile: "dolphin-2.9-llama3-8b-Q5_K_M.gguf",
    downloadUrl: "https://huggingface.co/bartowski/dolphin-2.9-llama3-8b-GGUF/resolve/main/dolphin-2.9-llama3-8b-Q5_K_M.gguf",
    expectedSizeBytes: 5_730_000_000,
    quantization: "Q5_K_M",
    family: "llama",
    contextLength: 8192,
    capabilities: {
      textInput: true, imageInput: false, audioInput: false,
      textOutput: true, imageOutput: false, audioOutput: false, videoOutput: false,
      toolCall: true, reasoning: true,
    },
    serverFlags: ["--ctx-size", "8192", "--n-gpu-layers", "0"],
    icon: "🧠",
    backend: "llama-server",
  },

  // ─── 2. CHAT LARGE — Dolphin 2.9 Llama3 70B (40GB, needs 48GB+ RAM) ──────
  {
    id: "pinned-dolphin-70b",
    name: "Dolphin 2.9 Llama3 70B",
    category: "chat-large",
    description: "Best quality uncensored chat + coding. 70B params. Needs 48GB+ RAM. 40GB Q4_K_M.",
    hfRepo: "bartowski/dolphin-2.9-llama3-70b-GGUF",
    hfFile: "dolphin-2.9-llama3-70b-Q4_K_M.gguf",
    downloadUrl: "https://huggingface.co/bartowski/dolphin-2.9-llama3-70b-GGUF/resolve/main/dolphin-2.9-llama3-70b-Q4_K_M.gguf",
    expectedSizeBytes: 40_000_000_000,
    quantization: "Q4_K_M",
    family: "llama",
    contextLength: 8192,
    capabilities: {
      textInput: true, imageInput: false, audioInput: false,
      textOutput: true, imageOutput: false, audioOutput: false, videoOutput: false,
      toolCall: true, reasoning: true,
    },
    serverFlags: ["--ctx-size", "8192", "--n-gpu-layers", "0"],
    icon: "🐋",
    backend: "llama-server",
  },

  // ─── 3. IMAGE — FLUX.1-dev Q2_K (4.02GB, 12B params) ─────────────────────
  {
    id: "pinned-flux-dev",
    name: "FLUX.1 Dev",
    category: "image",
    description: "Best quality image gen. 12B params. Text-to-image + image-to-image. 4GB.",
    hfRepo: "city96/FLUX.1-dev-gguf",
    hfFile: "flux1-dev-Q2_K.gguf",
    downloadUrl: "https://huggingface.co/city96/FLUX.1-dev-gguf/resolve/main/flux1-dev-Q2_K.gguf",
    expectedSizeBytes: 4_020_000_000,
    quantization: "Q2_K",
    family: "flux",
    contextLength: 0,
    capabilities: {
      textInput: true, imageInput: true, audioInput: false,
      textOutput: false, imageOutput: true, audioOutput: false, videoOutput: false,
      toolCall: false, reasoning: false,
    },
    serverFlags: [],
    icon: "🎨",
    backend: "python-diffusion",
  },

  // ─── 4. VIDEO — Wan2.1 T2V 1.3B (3.2GB) ──────────────────────────────────
  {
    id: "pinned-wan-video",
    name: "Wan2.1 T2V 1.3B",
    category: "video",
    description: "Video gen with music. Text-to-video + image-to-video. 3.2GB.",
    hfRepo: "city96/Wan2.1-T2V-1.3B-GGUF",
    hfFile: "wan2.1-t2v-1.3b-Q4_K_M.gguf",
    downloadUrl: "https://huggingface.co/city96/Wan2.1-T2V-1.3B-GGUF/resolve/main/wan2.1-t2v-1.3b-Q4_K_M.gguf",
    expectedSizeBytes: 3_200_000_000,
    quantization: "Q4_K_M",
    family: "wan",
    contextLength: 0,
    capabilities: {
      textInput: true, imageInput: true, audioInput: false,
      textOutput: false, imageOutput: false, audioOutput: false, videoOutput: true,
      toolCall: false, reasoning: false,
    },
    serverFlags: [],
    icon: "🎬",
    backend: "python-diffusion",
  },

  // ─── 5. AUDIO/MUSIC — MusicGen Medium 1.5B (3GB) ──────────────────────────
  {
    id: "pinned-musicgen",
    name: "MusicGen Medium",
    category: "audio",
    description: "Music generation. 1.5B params. Text-to-music + melody-guided. 3GB.",
    hfRepo: "facebook/musicgen-medium",
    hfFile: "musicgen-medium.safetensors",
    downloadUrl: "https://huggingface.co/facebook/musicgen-medium/resolve/main/musicgen-medium.safetensors",
    expectedSizeBytes: 3_000_000_000,
    quantization: "FP32",
    family: "musicgen",
    contextLength: 0,
    capabilities: {
      textInput: true, imageInput: false, audioInput: true,
      textOutput: false, imageOutput: false, audioOutput: true, videoOutput: false,
      toolCall: false, reasoning: false,
    },
    serverFlags: [],
    icon: "🎵",
    backend: "python-audiocraft",
  },

  // ─── 6. TTS — Bark Small (2GB, male/female, Bengali) ───────────────────────
  {
    id: "pinned-bark",
    name: "Bark Small",
    category: "tts",
    description: "Text-to-speech. Male & female voices. Bengali + any language. 2GB.",
    hfRepo: "suno/bark",
    hfFile: "bark_small.safetensors",
    downloadUrl: "https://huggingface.co/suno/bark/resolve/main/bark_small.safetensors",
    expectedSizeBytes: 2_000_000_000,
    quantization: "FP32",
    family: "bark",
    contextLength: 0,
    capabilities: {
      textInput: true, imageInput: false, audioInput: false,
      textOutput: false, imageOutput: false, audioOutput: true, videoOutput: false,
      toolCall: false, reasoning: false,
    },
    serverFlags: [],
    icon: "🗣️",
    backend: "python-bark",
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getPinnedModel(id: string): PinnedModel | undefined {
  return PINNED_MODELS.find((m) => m.id === id)
}

export function getPinnedByCategory(category: ModelCategory): PinnedModel[] {
  return PINNED_MODELS.filter((m) => m.category === category)
}

export function getPinnedModelIds(): string[] {
  return PINNED_MODELS.map((m) => m.id)
}

export function isPinnedModel(id: string): boolean {
  return PINNED_MODELS.some((m) => m.id === id)
}

export function getPinnedLocalPath(model: PinnedModel, modelsDir: string): string {
  return path.join(modelsDir, model.hfFile)
}

export function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`
  return `${(bytes / 1_000).toFixed(0)} KB`
}
