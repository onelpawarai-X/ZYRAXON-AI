// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { MockLanguageModelV3 } from "ai/test"
import { runOne } from "../src/tool/model_call"

function modelThatSays(text: string) {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    },
  })
}

describe("model_call delegation", () => {
  test("returns the other model's text", async () => {
    const answer = await runOne(modelThatSays("  42  "), "what is the answer", undefined, new AbortController().signal)
    expect(answer).toBe("42")
  })

  test("passes a system instruction through to the other model", async () => {
    const model = modelThatSays("ok")
    await runOne(model, "hi", "be terse", new AbortController().signal)
    const call = model.doGenerateCalls[0]
    const system = call.prompt.filter((message) => message.role === "system")
    expect(system).toHaveLength(1)
    expect(system[0]).toMatchObject({ content: "be terse" })
  })

  test("sends the prompt as a user message", async () => {
    const model = modelThatSays("ok")
    await runOne(model, "read this image", undefined, new AbortController().signal)
    const call = model.doGenerateCalls[0]
    const user = call.prompt.filter((message) => message.role === "user")
    expect(user).toHaveLength(1)
    expect(JSON.stringify(user[0])).toContain("read this image")
  })

  test("reports an empty reply instead of returning nothing", async () => {
    const answer = await runOne(modelThatSays(""), "hi", undefined, new AbortController().signal)
    expect(answer).toBe("(the model returned an empty reply)")
  })

  test("turns a provider failure into a readable sentence", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: () => {
        throw new Error("rate limited")
      },
    })
    const answer = await runOne(model, "hi", undefined, new AbortController().signal)
    expect(answer).toContain("The model call failed")
    expect(answer).toContain("rate limited")
  })
})
