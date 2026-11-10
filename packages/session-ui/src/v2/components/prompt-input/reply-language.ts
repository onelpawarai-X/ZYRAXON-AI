// Copyright (c) 2026 onelpawarai. All rights reserved.

// A locale code means nothing to a language model. "bn-BD" has to become "Bengali"
// before it goes into a prompt, otherwise the model either ignores it or guesses.
// Kept next to the composer's picker so the two can never drift apart.
export const VOICE_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "auto", label: "Auto-Detect" },
  { code: "bn-BD", label: "Bengali" },
  { code: "bn-IN", label: "Bengali (India)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-IN", label: "English (India)" },
  { code: "ar-SA", label: "Arabic" },
  { code: "ar-EG", label: "Arabic (Egypt)" },
  { code: "es-ES", label: "Spanish" },
  { code: "es-MX", label: "Spanish (Mexico)" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "pt-PT", label: "Portuguese" },
  { code: "ru-RU", label: "Russian" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
  { code: "vi-VN", label: "Vietnamese" },
  { code: "it-IT", label: "Italian" },
  { code: "th-TH", label: "Thai" },
  { code: "tr-TR", label: "Turkish" },
  { code: "pl-PL", label: "Polish" },
  { code: "nl-NL", label: "Dutch" },
  { code: "uk-UA", label: "Ukrainian" },
  { code: "sv-SE", label: "Swedish" },
  { code: "da-DK", label: "Danish" },
  { code: "fi-FI", label: "Finnish" },
  { code: "nb-NO", label: "Norwegian" },
  { code: "cs-CZ", label: "Czech" },
  { code: "ro-RO", label: "Romanian" },
  { code: "el-GR", label: "Greek" },
  { code: "he-IL", label: "Hebrew" },
  { code: "hu-HU", label: "Hungarian" },
  { code: "id-ID", label: "Indonesian" },
  { code: "ms-MY", label: "Malay" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "ur-PK", label: "Urdu" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "fa-IR", label: "Persian" },
  { code: "sw-KE", label: "Swahili" },
  { code: "af-ZA", label: "Afrikaans" },
  { code: "ca-ES", label: "Catalan" },
  { code: "sr-RS", label: "Serbian" },
  { code: "bg-BG", label: "Bulgarian" },
  { code: "hr-HR", label: "Croatian" },
  { code: "sk-SK", label: "Slovak" },
  { code: "sl-SI", label: "Slovenian" },
  { code: "lt-LT", label: "Lithuanian" },
  { code: "lv-LV", label: "Latvian" },
  { code: "et-EE", label: "Estonian" },
  { code: "is-IS", label: "Icelandic" },
  { code: "sq-AL", label: "Albanian" },
  { code: "mk-MK", label: "Macedonian" },
  { code: "km-KH", label: "Khmer" },
  { code: "ne-NP", label: "Nepali" },
  { code: "si-LK", label: "Sinhala" },
  { code: "my-MM", label: "Burmese" },
  { code: "ka-GE", label: "Georgian" },
  { code: "hy-AM", label: "Armenian" },
  { code: "az-AZ", label: "Azerbaijani" },
  { code: "uz-UZ", label: "Uzbek" },
  { code: "kk-KZ", label: "Kazakh" },
  { code: "be-BY", label: "Belarusian" },
  { code: "mn-MN", label: "Mongolian" },
]

/**
 * The human-readable name for a locale, or undefined when the user has not chosen a
 * real language. "auto" deliberately returns undefined: it is a speech-recognition
 * setting, and forcing a language on the model because the user left the picker on
 * Auto would be wrong.
 */
export function replyLanguageName(code: string | undefined): string | undefined {
  if (!code || code === "auto") return undefined
  const label = VOICE_LANGUAGES.find((language) => language.code === code)?.label
  if (!label) return undefined
  // "English (India)" reads as a language instruction; the region is noise the model
  // does not need and occasionally follows literally.
  return label.replace(/\s*\(.*\)\s*$/, "").trim()
}
