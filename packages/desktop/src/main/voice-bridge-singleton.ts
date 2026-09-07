/**
 * Voice Bridge Singleton — ensures ONE module instance across all imports.
 * Both ipc.ts and index.ts MUST use this instead of direct require/import.
 */

import type {
  startVoiceBridge as StartVoiceBridge,
  setRendererCallback as SetRendererCallback,
  setVoiceLanguage as SetVoiceLanguage,
  setVoiceGender as SetVoiceGender,
  setVoiceListening as SetVoiceListening,
  stopVoiceBridge as StopVoiceBridge,
} from "./voice-bridge"

// The actual module reference — set once by index.ts on startup
let _mod: typeof import("./voice-bridge") | null = null

/**
 * Set the voice bridge module reference. Called ONCE from index.ts after dynamic import.
 */
export function setVoiceBridgeModule(mod: typeof import("./voice-bridge")) {
  _mod = mod
  console.log("[VoiceBridgeSingleton] Module registered")
}

/**
 * Get the voice bridge module. Returns null if not yet initialized.
 * Used by ipc.ts — guaranteed to be the SAME instance as index.ts.
 */
export function getVoiceBridgeModule(): typeof import("./voice-bridge") | null {
  return _mod
}
