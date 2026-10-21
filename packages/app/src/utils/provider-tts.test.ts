// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { detectSpeechLocale } from "./provider-tts"

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
