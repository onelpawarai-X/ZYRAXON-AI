// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { callGenerate, predictUrl, providerHeaders, providerUrl, runLongRunning } from "../src/tool/media_generate"
import type { Provider } from "../src/provider/provider"

function provider(overrides: Partial<Provider.Info> = {}): Provider.Info {
  return {
    id: "google" as Provider.Info["id"],
    name: "Google",
    source: "api",
    env: [],
    options: {},
    models: {},
    ...overrides,
  } as Provider.Info
}

function model(overrides: Partial<Provider.Model> = {}): Provider.Model {
  return {
    id: "gemini-2.0-flash" as Provider.Model["id"],
    providerID: "google" as Provider.Model["providerID"],
    api: { id: "google", url: "https://generativelanguage.googleapis.com/v1beta", npm: "@ai-sdk/google" },
    name: "Gemini",
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: true,
      toolcall: true,
      input: { text: true, audio: true, image: true, video: true, pdf: true },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 }, tier: { type: "context", size: 0 } },
    limit: { context: 0, output: 0 },
    status: "active",
    options: {},
    headers: {},
    release_date: "",
    ...overrides,
  } as Provider.Model
}

describe("media_generate endpoint resolution", () => {
  test("falls back to the catalogue api.url when no base URL is configured", () => {
    expect(providerUrl(provider(), model())).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    )
  })

  test("a configured base URL wins over the catalogue entry", () => {
    const proxied = provider({ options: { baseURL: "https://gateway.example.com/v1" } })
    expect(providerUrl(proxied, model())).toBe(
      "https://gateway.example.com/v1/models/gemini-2.0-flash:generateContent",
    )
  })

  test("a Google model behind a proxy still uses the generative endpoint", () => {
    const proxied = provider({ options: { baseURL: "https://gateway.example.com/v1" } })
    expect(providerUrl(proxied, model())).toContain(":generateContent")
  })

  test("a Google-vertex model also uses the generative endpoint", () => {
    const vertex = model({
      api: { id: "google-vertex", url: "https://us-central1-aiplatform.googleapis.com/v1", npm: "@ai-sdk/google-vertex" },
    })
    expect(providerUrl(provider(), vertex)).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/models/gemini-2.0-flash:generateContent",
    )
  })

  test("a non-Google provider uses the predict endpoint", () => {
    const openai = model({ api: { id: "openai", url: "https://api.openai.com/v1", npm: "@ai-sdk/openai" } })
    expect(providerUrl(provider(), openai)).toBe("https://api.openai.com/v1/models/gemini-2.0-flash:generate")
  })

  test("video uses predictLongRunning rather than generateContent", () => {
    expect(predictUrl(provider(), model())).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:predictLongRunning",
    )
  })

  test("a configured base URL wins over the catalogue entry", () => {
    const proxied = provider({ options: { baseURL: "https://gateway.example.com/v1" } })
    expect(providerUrl(proxied, model())).toBe(
      "https://gateway.example.com/v1/models/gemini-2.0-flash:generateContent",
    )
  })

  test("a provider with no address at all fails loudly", () => {
    expect(() => providerUrl(provider(), model({ api: { id: "x", url: "", npm: "x" } }))).toThrow(
      "does not publish a base URL",
    )
  })
})

describe("media_generate credentials", () => {
  test("attaches the provider key as a bearer token for ordinary providers", async () => {
    const headers = await providerHeaders(provider({ key: "sk-test" }), model({ api: { id: "x", url: "https://api.example.com/v1", npm: "x" } }))
    expect(headers["authorization"]).toBe("Bearer sk-test")
  })

  test("uses the Google header for the generative endpoint", async () => {
    const headers = await providerHeaders(provider({ key: "g-key" }), model())
    expect(headers["x-goog-api-key"]).toBe("g-key")
    expect(headers["authorization"]).toBeUndefined()
  })

  test("does not overwrite an authorization header the user configured", async () => {
    const configured = provider({ key: "sk-test", options: { headers: { Authorization: "Bearer custom" } } })
    const headers = await providerHeaders(configured, model())
    expect(headers["Authorization"]).toBe("Bearer custom")
    expect(headers["authorization"]).toBeUndefined()
  })

  test("sends no auth header when no key is available", async () => {
    const headers = await providerHeaders(provider(), model())
    expect(headers["authorization"]).toBeUndefined()
    expect(headers["x-goog-api-key"]).toBeUndefined()
  })
})

/**
 * These run against a real HTTP server on localhost rather than a stubbed fetch, so the
 * request that actually leaves the process — its method, URL, auth header and body — is
 * the thing under test.
 */
describe("media_generate over HTTP", () => {
  async function withServer(
    handler: (request: Request) => Response | Promise<Response>,
    body: (baseURL: string) => Promise<void>,
  ) {
    const server = Bun.serve({ port: 0, fetch: handler })
    try {
      await body(`http://127.0.0.1:${server.port}`)
    } finally {
      await server.stop(true)
    }
  }

  test("an image request carries the prompt, the IMAGE modality and the key", async () => {
    let seen: { url: string; auth: string | null; json: any } | undefined
    await withServer(
      async (request) => {
        seen = {
          url: request.url,
          auth: request.headers.get("x-goog-api-key"),
          json: await request.json(),
        }
        const png = Buffer.from("fake-image-bytes").toString("base64")
        return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png } }] } }] })
      },
      async (baseURL) => {
        const configured = provider({ key: "g-key", options: { baseURL } })
        const result = await callGenerate(configured, model(), "a red cube", { responseModalities: ["IMAGE"] })
        expect(seen?.url).toBe(`${baseURL}/models/gemini-2.0-flash:generateContent`)
        expect(seen?.auth).toBe("g-key")
        expect(seen?.json.contents[0].parts[0].text).toBe("a red cube")
        expect(seen?.json.generationConfig.responseModalities).toEqual(["IMAGE"])
        expect(result).toMatchObject({ candidates: expect.any(Array) })
      },
    )
  })

  test("a non-Google provider is sent a bearer token instead of the Google header", async () => {
    let auth: string | null = null
    await withServer(
      async (request) => {
        auth = request.headers.get("authorization")
        return Response.json({})
      },
      async (baseURL) => {
        const configured = provider({ key: "sk-live", options: { baseURL } })
        const openai = model({ api: { id: "openai", url: baseURL, npm: "@ai-sdk/openai" } })
        await callGenerate(configured, openai, "a cat", {})
        expect(auth).toBe("Bearer sk-live")
      },
    )
  })

  test("a provider error is reported as a sentence, not a bare status", async () => {
    await withServer(
      async () => Response.json({ error: { message: "quota exhausted" } }, { status: 429 }),
      async (baseURL) => {
        const configured = provider({ options: { baseURL } })
        await expect(callGenerate(configured, model(), "x", {})).rejects.toThrow("quota exhausted")
      },
    )
  })

  test("video submits to predictLongRunning and returns the polled file", async () => {
    const png = Buffer.from("fake-video-bytes").toString("base64")
    let submittedTo = ""
    let polls = 0
    await withServer(
      async (request) => {
        const url = new URL(request.url)
        if (url.pathname.endsWith(":predictLongRunning")) {
          submittedTo = url.pathname
          return Response.json({ name: "operations/abc" })
        }
        polls += 1
        return Response.json({
          done: true,
          response: { generateVideoResponse: { generatedSamples: [{ video: { inlineData: { mimeType: "video/mp4", data: png } } }] } },
        })
      },
      async (baseURL) => {
        const configured = provider({ options: { baseURL } })
        const result = await runLongRunning(configured, model(), "a sunset", 4, 5)
        expect(submittedTo).toBe("/models/gemini-2.0-flash:predictLongRunning")
        expect(polls).toBeGreaterThan(0)
        expect(result.error).toBeUndefined()
        expect(result.media?.mime).toBe("video/mp4")
      },
    )
  })
})
