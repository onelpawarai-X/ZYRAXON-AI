// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { detectSpeechLocale, providerSpeechBody, resolveSpeechLocale, speechGender } from "./provider-tts"

describe("detectSpeechLocale", () => {
  test("returns undefined for plain Latin script so the caller keeps its default", () => {
    expect(detectSpeechLocale("Hello from ZYRAXON.")).toBeUndefined()
    expect(detectSpeechLocale("")).toBeUndefined()
  })

  test("identifies Bengali so an English voice never reads Bengali letters", () => {
    expect(detectSpeechLocale("আমি একটি ZYRAXON মডেল।")).toBe("bn")
  })

  test("identifies other non-Latin scripts", () => {
    expect(detectSpeechLocale("नमस्ते दुनिया")).toBe("hi")
    expect(detectSpeechLocale("Привет мир")).toBe("ru")
    expect(detectSpeechLocale("こんにちは")).toBe("ja")
  })

  test("counts characters so the dominant script wins over a quoted word", () => {
    // A Bengali answer quoting one English word must still be read in Bengali.
    expect(detectSpeechLocale("এটি একটি দীর্ঘ বাংলা বাক্য যেখানে error আছে।")).toBe("bn")
  })
})

describe("resolveSpeechLocale", () => {
  test("the text's script beats the configured language", () => {
    // The endpoint answers 200 with an empty body when the voice cannot cover the
    // text, so deferring to the setting here would silently mute every Bengali
    // reply while the default language is English.
    expect(resolveSpeechLocale("আমি বাংলায় কথা বলি।", "en-US")).toBe("bn")
    expect(resolveSpeechLocale("নমস্কার", "en")).toBe("bn")
  })

  test("the configured language still applies to Latin script", () => {
    expect(resolveSpeechLocale("Hello there.", "de-DE")).toBe("de")
    expect(resolveSpeechLocale("Hello there.", "en-US")).toBe("en")
  })

  test("auto leaves the choice to the endpoint", () => {
    expect(resolveSpeechLocale("Hello there.", "auto")).toBeUndefined()
    expect(resolveSpeechLocale("Hello there.")).toBeUndefined()
  })
})

describe("speechGender", () => {
  test("passes the app's own male and female settings through", () => {
    expect(speechGender("male")).toBe("male")
    expect(speechGender("female")).toBe("female")
  })

  test("accepts the local server's short codes too", () => {
    expect(speechGender("m")).toBe("male")
    expect(speechGender("f")).toBe("female")
  })

  test("an absent or unknown value is left to the endpoint", () => {
    expect(speechGender(undefined)).toBeUndefined()
    expect(speechGender("")).toBeUndefined()
    expect(speechGender("robot")).toBeUndefined()
  })
})

describe("providerSpeechBody", () => {
  test("a male setting reaches the request as gender, not dropped", () => {
    // The endpoint answers with a female voice when gender is missing, so this is
    // the exact field whose absence made Male sound like Female.
    expect(providerSpeechBody("Hello there.", "en", "male")).toEqual({
      text: "Hello there.",
      locale: "en",
      gender: "male",
    })
  })

  test("a female setting is sent explicitly", () => {
    expect(providerSpeechBody("Hello there.", "en", "female").gender).toBe("female")
  })

  test("omits gender only when there is no preference", () => {
    expect("gender" in providerSpeechBody("Hello there.", "en", undefined)).toBe(false)
  })

  test("the text's script still picks the locale when none is given", () => {
    expect(providerSpeechBody("আমি বাংলায় কথা বলি।", undefined, "male")).toEqual({
      text: "আমি বাংলায় কথা বলি।",
      locale: "bn",
      gender: "male",
    })
  })
})
