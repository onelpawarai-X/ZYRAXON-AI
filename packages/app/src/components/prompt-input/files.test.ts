// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { attachmentMime } from "./files"

const file = (name: string, type = "") =>
  new File([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])], name, { type })

describe("attachmentMime", () => {
  test("keeps a browser-reported image type", async () => {
    expect(await attachmentMime(file("photo.png", "image/png"))).toBe("image/png")
  })

  test("keeps a browser-reported video type", async () => {
    expect(await attachmentMime(file("clip.mp4", "video/mp4"))).toBe("video/mp4")
  })

  test("keeps a browser-reported audio type", async () => {
    expect(await attachmentMime(file("song.mp3", "audio/mpeg"))).toBe("audio/mpeg")
  })

  test("trusts a video type outside the accepted list", async () => {
    expect(await attachmentMime(file("clip.mkv", "video/x-matroska"))).toBe("video/x-matroska")
  })

  test("resolves a video with no reported type from its extension", async () => {
    expect(await attachmentMime(file("clip.mp4"))).toBe("video/mp4")
  })

  test("resolves an audio with octet-stream from its extension", async () => {
    expect(await attachmentMime(file("song.m4a", "application/octet-stream"))).toBe("audio/mp4")
  })

  test("still treats a plain binary with no media extension as unsupported", async () => {
    expect(await attachmentMime(file("archive.zip", "application/zip"))).toBeUndefined()
  })

  test("still resolves a pdf", async () => {
    expect(await attachmentMime(file("doc.pdf", "application/pdf"))).toBe("application/pdf")
  })
})
