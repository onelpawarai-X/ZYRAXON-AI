// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import {
  isAudioAttachment,
  isMedia,
  isVideoAttachment,
  mediaCarrierAccepts,
  sniffAttachmentMime,
} from "../src/util/media"

describe("media attachments", () => {
  test("classifies video and audio mimes", () => {
    expect(isVideoAttachment("video/mp4")).toBe(true)
    expect(isAudioAttachment("audio/mpeg")).toBe(true)
    expect(isMedia("video/mp4")).toBe(true)
    expect(isMedia("audio/mpeg")).toBe(true)
    expect(isVideoAttachment("image/png")).toBe(false)
  })

  test("only lets SDKs with a real video encoder carry video", () => {
    expect(mediaCarrierAccepts("@ai-sdk/google", "video/mp4")).toBe(true)
    expect(mediaCarrierAccepts("@ai-sdk/openai", "video/mp4")).toBe(false)
  })

  test("openai-compatible carries audio but not video", () => {
    expect(mediaCarrierAccepts("@ai-sdk/openai-compatible", "audio/mpeg")).toBe(true)
    expect(mediaCarrierAccepts("@ai-sdk/openai-compatible", "video/mp4")).toBe(false)
  })

  test("sniffs a real mp4 header as video", () => {
    const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])
    expect(sniffAttachmentMime(bytes, "application/octet-stream")).toBe("video/mp4")
  })

  test("sniffs a webm header as video", () => {
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03, 0x04])
    expect(sniffAttachmentMime(bytes, "application/octet-stream")).toBe("video/webm")
  })

  test("sniffs an id3 header as audio", () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00])
    expect(sniffAttachmentMime(bytes, "application/octet-stream")).toBe("audio/mpeg")
  })
})
