// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import {
  isAudioAttachment,
  isMedia,
  isVideoAttachment,
  mediaCarrierAccepts,
  modelAcceptsInputModality,
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

  test("openai-compatible carries both audio and video", () => {
    // The installed 2.0.41 release throws on video parts, so it is patched in
    // patches/@ai-sdk%2Fopenai-compatible@2.0.41.patch to emit `video_url`.
    expect(mediaCarrierAccepts("@ai-sdk/openai-compatible", "audio/mpeg")).toBe(true)
    expect(mediaCarrierAccepts("@ai-sdk/openai-compatible", "video/mp4")).toBe(true)
  })

  test("carries media on the SDKs that added encoders for it", () => {
    // openrouter and google convert both; azure and groq convert audio only.
    expect(mediaCarrierAccepts("@openrouter/ai-sdk-provider", "video/mp4")).toBe(true)
    expect(mediaCarrierAccepts("@ai-sdk/azure", "audio/wav")).toBe(true)
    expect(mediaCarrierAccepts("@ai-sdk/groq", "audio/wav")).toBe(true)
    // xai, bedrock and anthropic have no inline converter for either.
    expect(mediaCarrierAccepts("@ai-sdk/xai", "video/mp4")).toBe(false)
    expect(mediaCarrierAccepts("@ai-sdk/amazon-bedrock", "video/mp4")).toBe(false)
    expect(mediaCarrierAccepts("@ai-sdk/anthropic", "audio/wav")).toBe(false)
  })

  test("agrees with the model's declared input modalities", () => {
    const input = { image: true, audio: false, video: true, pdf: false }
    expect(modelAcceptsInputModality(input, "image/png")).toBe(true)
    expect(modelAcceptsInputModality(input, "video/mp4")).toBe(true)
    expect(modelAcceptsInputModality(input, "audio/wav")).toBe(false)
    expect(modelAcceptsInputModality(input, "application/pdf")).toBe(false)
    expect(modelAcceptsInputModality(undefined, "image/png")).toBe(false)
    // A type the catalogue does not track is not blocked here.
    expect(modelAcceptsInputModality(input, "text/plain")).toBe(true)
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
