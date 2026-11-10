// Copyright (c) 2026 onelpawarai. All rights reserved.

// The rolling recogniser re-reads the last window every tick, so consecutive
// answers overlap: one tick ends "…পূর্ণিমা" and the next begins "পূর্ণিমা
// ভালোবাসি…". Folding them must join the shared words instead of replacing the
// transcript, and a re-read after a pause (which starts mid-word) must not be
// appended again.

import { describe, expect, test } from "bun:test"
import { mergeTranscript } from "./stt-client"

describe("mergeTranscript", () => {
  test("grows when the new answer extends the old one", () => {
    expect(mergeTranscript("তোমার", "তোমার চোখে")).toBe("তোমার চোখে")
    expect(mergeTranscript("hello world", "hello world how are you")).toBe("hello world how are you")
  })

  test("joins two ticks on their shared run", () => {
    expect(mergeTranscript("তোমার চোখে আকাশ আমার", "আমার চাঁদ যেন পূর্ণিমা")).toBe(
      "তোমার চোখে আকাশ আমার চাঁদ যেন পূর্ণিমা",
    )
    expect(mergeTranscript("hello world", "world how are you")).toBe("hello world how are you")
  })

  test("keeps the longer answer when one contains the other", () => {
    expect(mergeTranscript("hello world", "world")).toBe("hello world")
  })

  test("ignores a re-read whose tail is already on screen", () => {
    const settled = "তোমার চোখে আকাশ আমার চাঁদ যেন পূর্ণিমা ভালোবাসি তোমাকে আমি"
    expect(mergeTranscript(settled, "বাসী তোমাকে আমি")).toBe(settled)
    expect(mergeTranscript(settled, "ভালোবাসি তোমাকে আমি")).toBe(settled)
  })

  test("still joins genuinely new speech after the re-read guard", () => {
    expect(mergeTranscript("তোমার চোখে আকাশ", "নতুন একটা বাক্য")).toBe("তোমার চোখে আকাশ নতুন একটা বাক্য")
  })

  test("keeps a sentence that shares no words with the previous one", () => {
    expect(mergeTranscript("first sentence here", "completely different words now")).toBe(
      "first sentence here completely different words now",
    )
  })

  test("handles an empty side", () => {
    expect(mergeTranscript("", "প্রথম বাক্য")).toBe("প্রথম বাক্য")
    expect(mergeTranscript("প্রথম বাক্য", "")).toBe("প্রথম বাক্য")
  })

  test("does not duplicate a whole spoken sentence across ticks and a re-read", () => {
    const ticks = [
      "তোমার চোখে",
      "তোমার চোখে আকাশ আমার",
      "তোমার চোখে আকাশ আমার চাঁদ যেন পূর্ণিমা",
      "আমার চাঁদ যেন পূর্ণিমা ভালোবাসি তোমাকে",
      "পূর্ণিমা ভালোবাসি তোমাকে আমি",
      "বাসী তোমাকে আমি",
    ]
    const final = ticks.reduce((acc, tick) => mergeTranscript(acc, tick), "")
    expect(final).toBe("তোমার চোখে আকাশ আমার চাঁদ যেন পূর্ণিমা ভালোবাসি তোমাকে আমি")
  })
})
