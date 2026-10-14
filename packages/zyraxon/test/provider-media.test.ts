// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { message as transformMessage } from "../src/provider/transform"
import type { Provider } from "../src/provider/provider"

type Msg = Parameters<typeof transformMessage>[0][number]
type Part = { type?: string; mediaType?: string; text?: string; filename?: string }

function model(npm: string, input: { image?: boolean; audio?: boolean; video?: boolean; pdf?: boolean }): Provider.Model {
  return {
    id: "test-model" as Provider.Model["id"],
    providerID: "test" as Provider.Model["providerID"],
    api: { id: "test", url: "https://api.example.com/v1", npm },
    name: "Test",
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: true,
      toolcall: true,
      input: {
        text: true,
        image: input.image ?? false,
        audio: input.audio ?? false,
        video: input.video ?? false,
        pdf: input.pdf ?? false,
      },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 }, tier: { type: "context", size: 0 } },
    limit: { context: 0, output: 0 },
    status: "active",
    options: {},
    headers: {},
    release_date: "",
  } as Provider.Model
}

const userWithFile = (mime: string, filename: string): Msg[] =>
  [{ role: "user", content: [{ type: "file", data: "AAAA", mediaType: mime, filename }] } as unknown as Msg]

function partsAfter(msgs: Msg[], target: Provider.Model): Part[] {
  const transformed = transformMessage(msgs, target, {})
  const parts: Part[] = []
  for (const msg of transformed) {
    if (!Array.isArray(msg.content)) continue
    for (const part of msg.content) parts.push(part as Part)
  }
  return parts
}

describe("server keeps media that the model can read", () => {
  test("a video reaches a model whose SDK encodes video", () => {
    const parts = partsAfter(userWithFile("video/mp4", "clip.mp4"), model("@ai-sdk/google", { video: true }))
    const media = parts.filter((part) => part.type === "file")
    expect(media).toHaveLength(1)
    expect(media[0]).toMatchObject({ type: "file", mediaType: "video/mp4" })
  })

  test("an audio file reaches a model whose SDK encodes audio", () => {
    const parts = partsAfter(userWithFile("audio/mpeg", "song.mp3"), model("@ai-sdk/openai", { audio: true }))
    const media = parts.filter((part) => part.type === "file")
    expect(media).toHaveLength(1)
    expect(media[0]).toMatchObject({ type: "file", mediaType: "audio/mpeg" })
  })

  test("an image reaches a vision model", () => {
    const parts = partsAfter(userWithFile("image/png", "shot.png"), model("@ai-sdk/openai", { image: true }))
    expect(parts.filter((part) => part.type === "file")).toHaveLength(1)
  })

  test("a video is downgraded to a readable note when the SDK cannot encode it", () => {
    // openai has no video encoder, so the part must not be sent as video: the SDK would
    // throw and fail the whole request rather than the single attachment.
    const parts = partsAfter(userWithFile("video/mp4", "clip.mp4"), model("@ai-sdk/openai", { video: true }))
    expect(parts.some((part) => part.type === "file")).toBe(false)
    expect(parts.some((part) => part.type === "text" && (part.text ?? "").includes("does not support video"))).toBe(true)
  })

  test("a video is downgraded when the model does not declare video input", () => {
    const parts = partsAfter(userWithFile("video/mp4", "clip.mp4"), model("@ai-sdk/google", { video: false }))
    expect(parts.some((part) => part.type === "file")).toBe(false)
    expect(parts.some((part) => part.type === "text" && (part.text ?? "").includes("does not support video"))).toBe(true)
  })

  test("a video reaches an openai-compatible model with video input", () => {
    // openai-compatible has no video encoder upstream, so it is patched to emit
    // `video_url`. Both the model flag and the patched carrier must agree.
    const parts = partsAfter(userWithFile("video/mp4", "clip.mp4"), model("@ai-sdk/openai-compatible", { video: true }))
    const media = parts.filter((part) => part.type === "file")
    expect(media).toHaveLength(1)
    expect(media[0]).toMatchObject({ type: "file", mediaType: "video/mp4" })
  })

  test("an audio file reaches an openai-compatible model with audio input", () => {
    const parts = partsAfter(userWithFile("audio/mpeg", "song.mp3"), model("@ai-sdk/openai-compatible", { audio: true }))
    expect(parts.filter((part) => part.type === "file")).toHaveLength(1)
  })

  test("a video is downgraded for xai because its SDK has no video encoder", () => {
    const parts = partsAfter(userWithFile("video/mp4", "clip.mp4"), model("@ai-sdk/xai", { video: true }))
    expect(parts.some((part) => part.type === "file")).toBe(false)
    expect(parts.some((part) => part.type === "text" && (part.text ?? "").includes("does not support video"))).toBe(true)
  })
})
