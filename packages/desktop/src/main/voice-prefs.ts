// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * The voice preferences TTS reads: which language to speak and which gender of
 * voice to use, plus whether the assistant is currently speaking.
 *
 * These used to live inside the Chrome voice bridge. Speech recognition no
 * longer runs there — the composer streams the microphone to the STT endpoint
 * itself — but synthesis still needs to know the language and the voice, so the
 * state moved here rather than dying with the bridge.
 */

let language = "en-US"
let gender = "female"
let speaking = false

export function getVoiceLanguage(): string {
  return language
}

export function setVoiceLanguage(value: string) {
  if (value) language = value
}

export function getVoiceGender(): string {
  return gender
}

export function setVoiceGender(value: string) {
  if (value) gender = value
}

/** True while the assistant's own audio is playing, so echo is never transcribed. */
export function isVoiceSpeaking(): boolean {
  return speaking
}

export function setVoiceSpeaking(active: boolean) {
  speaking = active
}
