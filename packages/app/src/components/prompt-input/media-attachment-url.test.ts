// Copyright (c) 2026 onelpawarai. All rights reserved.

import { test, expect } from "bun:test"
import { mediaAttachmentUrl } from "./build-request-parts"
import type { MediaAttachmentPart } from "@/context/prompt-state"

const media = (over: Partial<MediaAttachmentPart>): MediaAttachmentPart =>
  ({
    id: "p",
    type: "video",
    filename: "clip.mp4",
    mime: "video/mp4",
    dataUrl: "data:video/mp4;base64,AAAA",
    ...over,
  }) as MediaAttachmentPart

test("video with a known desktop path sends a file URL, not an inline data URL", () => {
  const url = mediaAttachmentUrl(media({ sourcePath: "/Users/me/Movies/clip.mp4" }))
  expect(url).toBe("file:///Users/me/Movies/clip.mp4")
})

test("video without a known path falls back to the inline data URL", () => {
  expect(mediaAttachmentUrl(media({}))).toBe("data:video/mp4;base64,AAAA")
})

test("audio with a known path sends a file URL", () => {
  const url = mediaAttachmentUrl(media({ mime: "audio/mpeg", filename: "tone.mp3", sourcePath: "/tmp/tone.mp3" }))
  expect(url).toBe("file:///tmp/tone.mp3")
})

test("an image always stays inline even when a path is known", () => {
  const url = mediaAttachmentUrl(
    media({ mime: "image/png", filename: "shot.png", sourcePath: "/tmp/shot.png", dataUrl: "data:image/png;base64,AAAA" }),
  )
  expect(url).toBe("data:image/png;base64,AAAA")
})

test("a path with spaces and unicode is encoded", () => {
  const url = mediaAttachmentUrl(media({ sourcePath: "/tmp/my clip ü.mp4" }))
  expect(url.startsWith("file:///tmp/my%20clip%20")).toBe(true)
})
