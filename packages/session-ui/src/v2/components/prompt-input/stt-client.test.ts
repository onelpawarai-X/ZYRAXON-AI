// Copyright (c) 2026 onelpawarai. All rights reserved.

// The rolling recogniser re-reads the last window every tick, so consecutive
// answers overlap. Folding them must join the shared words instead of replacing
// the transcript, or the second sentence erases the first.

import { describe, expect, test } from "bun:test"
import { mergeGrowing } from "./stt-client"

describe("mergeGrowing", () => {
  test("joins two sentences on a shared ASCII word", () => {
    expect(mergeGrowing("hello world", "world how are you")).toBe("hello world how are you")
  })

  test("joins two sentences on a shared Bengali word", () => {
    // A Bengali word is a whole word in three characters; a fixed four-character
    // floor never matched it and the repeat was printed twice.
    expect(mergeGrowing("আমি ভালো আছি", "আছি তুমি কেমন")).toBe("আমি ভালো আছি তুমি কেমন")
  })

  test("does not collapse a short shared function word into a deletion", () => {
    expect(mergeGrowing("how can I help you", "you don't know")).toBe("how can I help you you don't know")
  })

  test("keeps the longer answer when one contains the other", () => {
    expect(mergeGrowing("hello world", "world")).toBe("hello world")
  })

  test("keeps a sentence that shares no words with the previous one", () => {
    expect(mergeGrowing("first sentence here", "completely different words now")).toBe(
      "first sentence here completely different words now",
    )
  })

  test("handles an empty side", () => {
    expect(mergeGrowing("", "প্রথম বাক্য")).toBe("প্রথম বাক্য")
    expect(mergeGrowing("প্রথম বাক্য", "")).toBe("প্রথম বাক্য")
  })
})
