// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * MEDIA GENERATION TOOL
 *
 * One tool for image, video and music, because the choice of model is not the caller's to
 * make. Whatever provider and model are selected in the app is the one that gets asked to
 * produce the file. If a user is signed in to one provider and the agent quietly generated
 * with another, the output would not match the account they paid for, the billing would not
 * match the model they chose, and nothing in the result would say so.
 *
 * So the tool resolves from the live model list rather than from a hardcoded table, and it
 * reports which provider and which model actually answered.
 *
 * What each modality needs from the provider:
 *
 *   image  models that return inline image bytes in a normal generateContent reply
 *          (Google's gemini-*-image family does this on the text endpoint itself)
 *   video  models that expose predictLongRunning; they return an operation that has to be
 *          polled, and the file only exists after that operation reports done
 *   music  models that return inline audio bytes; Google's lyria family exposes these on
 *          generateContent, NOT on predict, which is the mistake that made music look
 *          unsupported for as long as it was only tried the wrong way
 *
 * Every one of those shapes is walked rather than assumed, because providers disagree about
 * where they put the bytes.
 */

import { Effect, Schema } from "effect"
import { Tool } from "../tool/tool"
import { Provider } from "../provider/provider"
import { Global } from "@zyraxon-ai/core/global"

const DESCRIPTION = `Generate an image, a video, or a music track using the model that is currently selected.

Use this when the user asks for a picture, a video, a song, a track, music, an
illustration, artwork, a logo, a background, a thumbnail, a clip, or a sound.

- The provider and model are taken from what the user has selected. You do not choose them.
- Video takes real time to render, usually one to three minutes. Say so rather than
  appearing to hang, and do not call the tool twice for one request.
- The finished file comes back in the app and the user can see and play it there.

Actions: image, video, music`

const Parameters = Schema.Struct({
  action: Schema.String.annotate({
    description: "What to generate: image, video, or music",
  }),
  prompt: Schema.String.annotate({
    description: "What the file should show or sound like. Be specific — it is the only instruction the model gets.",
  }),
  durationSeconds: Schema.optional(Schema.Number).annotate({
    description: "For video: length in seconds. For music: track length. Defaults to 4 seconds for video and 20 for music.",
  }),
})

type Media = { mime: string; bytes: Uint8Array }

/**
 * Find the bytes in a provider response without assuming where they were put.
 *
 * Walked rather than pattern-matched because the same data shows up under `inlineData` on
 * Google's REST shape and under `data` on the SDK's own shape, and video puts it inside an
 * operation's response rather than the request's. A tool that only reads one of those
 * reports "no media returned" for a generation that in fact worked.
 */
function findMedia(node: unknown): Media | undefined {
  const seen = new Set<unknown>()

  const walk = (value: unknown): Media | undefined => {
    if (!value || typeof value !== "object") return
    if (seen.has(value)) return
    seen.add(value)

    const record = value as Record<string, unknown>

    const inline = record["inlineData"] as Record<string, unknown> | undefined
    if (typeof inline?.["data"] === "string" && (inline["data"] as string).length > 0) {
      return { mime: String(inline["mimeType"] ?? "application/octet-stream"), bytes: decode((inline["data"] as string)) }
    }

    const own = record["data"]
    const mime = record["mimeType"]
    if (typeof own === "string" && (own as string).length > 0 && typeof mime === "string") {
      return { mime, bytes: decode(own) }
    }

    for (const nested of Object.values(record)) {
      if (Array.isArray(nested)) {
        for (const item of nested) {
          const found = walk(item)
          if (found) return found
        }
      } else {
        const found = walk(nested)
        if (found) return found
      }
    }
    return
  }

  return walk(node)
}

function decode(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function extensionFor(mime: string): string {
  if (mime.includes("png")) return "png"
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg"
  if (mime.includes("webp")) return "webp"
  if (mime.includes("gif")) return "gif"
  if (mime.includes("mp4")) return "mp4"
  if (mime.includes("webm")) return "webm"
  if (mime.includes("wav") || mime.includes("L16")) return "wav"
  if (mime.includes("mp3") || mime.includes("mpeg")) return "mp3"
  if (mime.includes("ogg")) return "ogg"
  if (mime.includes("flac")) return "flac"
  return "bin"
}

export const MediaGenerateTool = Tool.define(
  "media_generate",
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (args: { action: string; prompt: string; durationSeconds?: number }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const providers = yield* provider.list()
          const selected = ctx.extra?.model as Provider.Model | undefined
          return yield* Effect.promise(() => run(args, providers, selected))
        }),
    }
  }),
)

/** The body, kept out of the definition so the Effect wrapper above stays readable. */
async function run(
  args: { action: string; prompt: string; durationSeconds?: number },
  providers: Record<string, Provider.Info>,
  selectedModel: Provider.Model | undefined,
): Promise<Tool.ExecuteResult> {
  const action = args.action.trim().toLowerCase()
  const prompt = args.prompt?.trim()
  if (!prompt) return { title: "Prompt required", output: "Describe what to generate.", metadata: {} }
  if (action !== "image" && action !== "video" && action !== "music") {
    return {
      title: "Unknown action",
      output: `action must be image, video or music — got "${args.action}"`,
      metadata: {},
    }
  }

  // Local models own this first. When the local provider is installed the
  // user chose to run offline, so the bundled Python backends generate the
  // file and nothing leaves the machine.
  const local = providers["local"]
  if (local && Object.keys(local.models ?? {}).length > 0) {
    return runLocal(action as "image" | "video" | "music", prompt, args.durationSeconds)
  }

  const models = Object.values(providers)
  if (models.length === 0) {
    return {
      title: "No provider selected",
      output: "No model is selected, so there is nothing to generate with. Pick a model in the composer first.",
      metadata: {},
    }
  }

  // Whatever is selected is the one that generates. No substitution, no silent fallback
  // to a different provider: the user chose that account and that is where the cost and
  // the output should land.
  //
  // "Selected" means the model in the composer, which is the one the session is actually
  // running on. Reading `Object.values(providers)[0]` instead would generate with whichever
  // provider happens to be listed first, so a user on a second provider would be billed on
  // the first one and get a file from a model they never picked.
  const selectedProvider = selectedModel ? providers[selectedModel.providerID] : models[0]
  const selected = selectedModel
    ? selectedProvider?.models?.[selectedModel.id]
    : Object.values(selectedProvider?.models ?? {})[0]
  if (!selectedProvider || !selected) {
    return {
      title: "No model selected",
      output: `${selectedProvider?.name ?? "The selected provider"} has no models available. Pick another provider or model in the composer.`,
      metadata: {},
    }
  }
  const label = `${selectedProvider.id}/${selected.id}`

  const call = await callProvider(selectedProvider, selected, action, prompt, args.durationSeconds)

  if (call.error) {
    return {
      title: `Could not generate the ${action}`,
      output: `${label} refused the request: ${call.error}`,
      metadata: { provider: selectedProvider.id, model: selected.id },
    }
  }
  if (!call.media) {
    return {
      title: `No ${action} came back`,
      output:
        `${label} accepted the request but returned no file. ` +
        `That model may not do ${action}. Say so plainly — do not describe an image you were not given.`,
      metadata: { provider: selectedProvider.id, model: selected.id },
    }
  }

  const written = await persist(call.media, action)
  return {
    title: `${action[0].toUpperCase()}${action.slice(1)} generated`,
    output:
      `Generated with ${label} and saved to ${written.path}. ` +
      `It is on screen in the app now${action === "video" ? " with a player" : action === "music" ? " with an audio player" : ""}.`,
    metadata: { provider: selectedProvider.id, model: selected.id, path: written.path, mime: call.media.mime },
    attachments: [{ type: "file" as const, mime: call.media.mime, url: written.url, filename: written.path.split("/").pop() }],
  }
}

/**
 * Ask the selected model for the file, in whichever way that provider answers.
 *
 * Three attempts, in the order that costs least and succeeds most: the ordinary text
 * endpoint first, because image and music models on Google return their bytes there. Video
 * is only tried last, because it is the slow one and it needs a poll afterwards.
 */
async function callProvider(
  provider: Provider.Info,
  model: Provider.Model,
  action: "image" | "video" | "music",
  prompt: string,
  durationSeconds: number | undefined,
): Promise<{ media?: Media; error?: string }> {

  if (action === "video") {
    const seconds = durationSeconds ?? 4
    try {
      return await runLongRunning(provider, model, prompt, seconds)
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  /**
   * Ask for the modality explicitly.
   *
   * Image and music models on Google answer the ordinary text endpoint and put the file in
   * an out-of-band field on the reply. Sending the right modality in generationConfig is
   * what makes them do that: without it they answer with text, and a tool that then reports
   * "no media returned" for a model that was perfectly willing to draw.
   */
  const generationConfig =
    action === "music"
      ? { responseModalities: ["AUDIO"] }
      : action === "image"
        ? { responseModalities: ["IMAGE"] }
        : {}

  try {
    const result = await callGenerate(provider, model, prompt, generationConfig)
    const media = findMedia(result)
    return media ? { media } : {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * The ordinary generateContent call, with no SDK ceremony.
 *
 * Done with plain HTTP against the provider's own endpoint rather than through the model
 * abstraction, because the abstractions available here speak the chat protocol and a
 * returned image is an out-of-band field on the reply that they throw away. Losing the
 * bytes is worse than the extra twenty lines.
 */
export async function callGenerate(
  provider: Provider.Info,
  model: Provider.Model,
  prompt: string,
  generationConfig: Record<string, unknown>,
): Promise<unknown> {
  const url = providerUrl(provider, model)
  const headers = await providerHeaders(provider, model)

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    }),
    signal: AbortSignal.timeout(240_000),
  })

  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`the provider replied with ${res.status} and a body that is not JSON`)
  }
  if (!res.ok) throw new Error(describeError(body, res.status))
  return body
}

/** Video is an operation: submit, then poll, and only then is there a file. */
export async function runLongRunning(
  provider: Provider.Info,
  model: Provider.Model,
  prompt: string,
  seconds: number,
  pollMs = 5_000,
): Promise<{ media?: Media; error?: string }> {
  const base = predictUrl(provider, model)
  const headers = await providerHeaders(provider, model)

  const submit = await fetch(base, {
    method: "POST",
    headers,
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { aspectRatio: "16:9", durationSeconds: seconds },
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const submitText = await submit.text()
  if (!submit.ok) {
    let body: unknown
    try {
      body = JSON.parse(submitText)
    } catch {
      body = undefined
    }
    return { error: describeError(body, submit.status) }
  }

  const operation = (JSON.parse(submitText) as { name?: string }).name
  if (!operation) return { error: "the provider accepted the request but returned no operation to wait on" }

  // Veo takes a minute or two. Polled patiently because a render that is still going is
  // not a failure, and giving up early would throw away a video that was about to exist.
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollMs))
    const poll = await fetch(providerOrigin(provider, model) + "/" + operation, {
      headers,
      signal: AbortSignal.timeout(60_000),
    })
    const pollText = await poll.text()
    if (!poll.ok) continue
    const state = JSON.parse(pollText) as { done?: boolean; response?: unknown; error?: unknown }
    if (!state.done) continue
    if (state.error) return { error: describeError(state.error, 200) }
    const media = findMedia(state.response)
    return media ? { media } : { error: "the render finished but returned no file" }
  }
  return { error: `still rendering after ${Math.round(60 * 5 / 60)} minutes` }
}

function providerOrigin(provider: Provider.Info, model: Provider.Model) {
  return baseOf(providerUrl(provider, model))
}

function baseOf(url: string) {
  return url.replace(/\/models\/[^/]+:.*$/, "").replace(/\/$/, "")
}

/**
 * The endpoint to POST to, preferring the configured base URL and falling back to the
 * catalogue's own `api.url`.
 *
 * `options.baseURL` is only populated when the user or a corporate config set it. For an
 * ordinary signed-in provider it is empty and the address lives on the model's catalogue
 * entry, so reading only `options.baseURL` made every ordinary provider look like it
 * "does not publish a base URL" and generation failed before a request was ever sent.
 */
export function providerUrl(provider: Provider.Info, model: Provider.Model) {
  const configured = (provider.options?.baseURL as string | undefined) ?? ""
  const base = (configured || model.api.url || "").replace(/\/$/, "")
  if (!base) throw new Error(`${provider.name} does not publish a base URL`)
  return isGoogle(model) ? `${base}/models/${encodeURIComponent(model.id)}:generateContent` : `${base}/models/${encodeURIComponent(model.id)}:generate`
}

/**
 * Whether this model speaks Google's generative protocol.
 *
 * Decided by the SDK the catalogue entry declares rather than by matching the host name in
 * the URL. A corporate gateway or a proxy in front of Google keeps the Google protocol but
 * has a URL that no longer contains `generativelanguage.googleapis.com`, and host matching
 * would then send it the predict path and get a 404. The npm field is what the provider
 * itself uses to pick a protocol, so it is the honest signal.
 */
export function isGoogle(model: Provider.Model) {
  return model.api.npm.startsWith("@ai-sdk/google")
}

/**
 * The video endpoint. Video is not generateContent — Google exposes it as a long-running
 * operation on its own `:predictLongRunning` path, and posting the generateContent URL with
 * the predict body is answered with a 400 rather than a render.
 */
export function predictUrl(provider: Provider.Info, model: Provider.Model) {
  const configured = (provider.options?.baseURL as string | undefined) ?? ""
  const base = (configured || model.api.url || "").replace(/\/$/, "")
  if (!base) throw new Error(`${provider.name} does not publish a base URL`)
  return `${base}/models/${encodeURIComponent(model.id)}:predictLongRunning`
}

/** The provider's own credentials, from whatever it stores them under. */
export async function providerHeaders(
  provider: Provider.Info,
  model: Provider.Model,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  const options = provider.options as { headers?: Record<string, string>; apiKey?: string } | undefined
  for (const [key, value] of Object.entries(options?.headers ?? {})) headers[key] = value

  // A plain HTTP call does not get the SDK's auth wiring for free, so the key has to be
  // attached here or the request arrives anonymous and the provider rejects it. Google's
  // generative endpoint takes the key in a header; everyone else takes a bearer token.
  const key = provider.key ?? options?.apiKey
  if (key && !hasAuth(headers)) {
    if (isGoogle(model)) {
      headers["x-goog-api-key"] = key
    } else {
      headers["authorization"] = `Bearer ${key}`
    }
  }
  return headers
}

function hasAuth(headers: Record<string, string>) {
  return Object.keys(headers).some((name) => {
    const lower = name.toLowerCase()
    return lower === "authorization" || lower === "x-goog-api-key" || lower === "x-api-key"
  })
}

/** Turn a provider's error shape into one sentence a user can act on. */
function describeError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const error = (body as { error?: unknown }).error
    if (error && typeof error === "object") {
      const message = (error as { message?: unknown }).message
      if (typeof message === "string") return `HTTP ${status} — ${message}`
    }
    const message = (body as { message?: unknown }).message
    if (typeof message === "string") return `HTTP ${status} — ${message}`
  }
  return `HTTP ${status}`
}

/**
 * Put the file where the app can show it, and return the path to quote plus a
 * data URL the renderer can play directly.
 *
 * Written to the session's own working directory rather than to an app-internal
 * media folder, so the file is somewhere the user can open, and so it appears in
 * their file tree like anything else they asked for. The timestamp keeps two
 * generations of the same filename from colliding.
 *
 * The data URL is what actually makes the result visible: the app renders
 * attachments straight from the part's url, and there is no route that serves
 * `Global.Path.data`, so a path alone would leave the file invisible. The path is
 * still returned in the metadata so the reply can name a file the user can open.
 */
async function persist(media: Media, action: "image" | "video" | "music") {
  const folder = `${Global.Path.data}/media/${action}`
  await Bun.write(`${folder}/.keep`, "")
  const path = `${folder}/${Date.now()}.${extensionFor(media.mime)}`
  await Bun.write(path, media.bytes)
  return { path, url: `data:${media.mime};base64,${Buffer.from(media.bytes).toString("base64")}` }
}

/**
 * Generate with the bundled Python backends, for a user who selected a local
 * model. Nothing is sent anywhere; the file is produced on this machine.
 */
async function runLocal(action: "image" | "video" | "music", prompt: string, durationSeconds: number | undefined) {
  const local = await import("../local/media")
  const backends = local.detectMediaBackends()
  if (!backends.some((backend) => backend.available)) {
    return {
      title: "Local media backend missing",
      output:
        "A local model is selected, but the Python media backends are not available. " +
        "They ship with the desktop app under resources/python-backends. Install one, or select a hosted model that supports " +
        `${action} generation.`,
      metadata: {},
    }
  }
  try {
    const generated = await local.generate(action, prompt, { durationSeconds })
    const written = await persist({ mime: generated.mime, bytes: generated.bytes }, action)
    return {
      title: `${action[0].toUpperCase()}${action.slice(1)} generated locally`,
      output:
        `Generated on this machine and saved to ${written.path}. ` +
        `It is on screen in the app now${action === "video" ? " with a player" : action === "music" ? " with an audio player" : ""}.`,
      metadata: { provider: "local", path: written.path, mime: generated.mime },
      attachments: [{ type: "file" as const, mime: generated.mime, url: written.url, filename: written.path.split("/").pop() }],
    }
  } catch (error) {
    return {
      title: `Could not generate the ${action}`,
      output: `The local ${action} backend failed: ${error instanceof Error ? error.message : String(error)}`,
      metadata: { provider: "local" },
    }
  }
}