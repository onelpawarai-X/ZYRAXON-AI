// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { buildRequestParts } from "./build-request-parts"
import type { MediaAttachmentPart } from "@/context/prompt"

function media(mime: string, filename: string): MediaAttachmentPart {
  const type = mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "image"
  return {
    type,
    id: `att-${filename}`,
    filename,
    mime,
    dataUrl: `data:${mime};base64,AAAA`,
  }
}

function build(images: MediaAttachmentPart[]) {
  return buildRequestParts({
    prompt: [],
    context: [],
    images,
    text: "look at this",
    messageID: "msg-1",
    sessionID: "ses-1",
    sessionDirectory: "/tmp/project",
  })
}

describe("media attachments reach the request", () => {
  test("a video attachment is sent as a file part with its own mime", () => {
    const { requestParts } = build([media("video/mp4", "clip.mp4")])
    const video = requestParts.find((part) => part.type === "file" && part.mime === "video/mp4")
    expect(video).toBeDefined()
    expect(video).toMatchObject({ type: "file", mime: "video/mp4", filename: "clip.mp4" })
    expect(video && "url" in video ? video.url : "").toBe("data:video/mp4;base64,AAAA")
  })

  test("an audio attachment is sent as a file part with its own mime", () => {
    const { requestParts } = build([media("audio/mpeg", "song.mp3")])
    const audio = requestParts.find((part) => part.type === "file" && part.mime === "audio/mpeg")
    expect(audio).toMatchObject({ type: "file", mime: "audio/mpeg", filename: "song.mp3" })
  })

  test("mime is never downgraded to octet-stream or text/plain", () => {
    const { requestParts } = build([media("video/webm", "clip.webm"), media("audio/wav", "tone.wav")])
    const mimes = requestParts.filter((part) => part.type === "file").map((part) => part.mime)
    expect(mimes).toContain("video/webm")
    expect(mimes).toContain("audio/wav")
    expect(mimes).not.toContain("application/octet-stream")
    expect(mimes).not.toContain("text/plain")
  })

  test("the optimistic part keeps the media mime so the composer shows it before the reply", () => {
    const { optimisticParts } = build([media("video/mp4", "clip.mp4")])
    const video = optimisticParts.find((part) => part.type === "file" && part.mime === "video/mp4")
    expect(video).toBeDefined()
  })
})
