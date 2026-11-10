// Copyright (c) 2026 onelpawarai. All rights reserved.

const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((value, index) => bytes[index] === value)

export function isPdfAttachment(mime: string) {
  return mime === "application/pdf"
}

export function isMedia(mime: string) {
  return mime.startsWith("image/") || isPdfAttachment(mime) || isAudioAttachment(mime) || isVideoAttachment(mime)
}

export function isImageAttachment(mime: string) {
  return mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/vnd.fastbidsheet"
}

export function isAudioAttachment(mime: string) {
  return mime.startsWith("audio/")
}

export function isVideoAttachment(mime: string) {
  return mime.startsWith("video/")
}

// SDKs that will actually encode a video or audio file part for their provider.
// The advertised capability flag alone is not enough: an SDK with no encoder for
// the type rejects the part at call time, and that rejection fails the whole
// request rather than the single attachment.
//
// The list is read from what each installed SDK actually encodes, not from the
// catalogue's capability flag. A model that advertises video input on an SDK with
// no video encoder would otherwise be sent a part the SDK cannot serialize, and
// the provider would reject the entire message instead of the one attachment.
const MEDIA_CARRIERS: Record<"video" | "audio", readonly string[]> = {
  video: [
    "@ai-sdk/google",
    "@ai-sdk/google-vertex",
    "@ai-sdk/google-vertex/anthropic",
    "@openrouter/ai-sdk-provider",
    // Patched to encode `video_url`; the unpatched release throws on video parts.
    "@ai-sdk/openai-compatible",
  ],
  audio: [
    "@ai-sdk/openai",
    "@ai-sdk/google",
    "@ai-sdk/google-vertex",
    "@ai-sdk/openai-compatible",
    "@openrouter/ai-sdk-provider",
    "@ai-sdk/azure",
    "@ai-sdk/groq",
  ],
}

/** Whether the provider SDK behind `npm` will carry this media file instead of throwing. */
export function mediaCarrierAccepts(npm: string, mime: string) {
  if (mime.startsWith("video/")) return MEDIA_CARRIERS.video.includes(npm)
  if (mime.startsWith("audio/")) return MEDIA_CARRIERS.audio.includes(npm)
  return true
}

// Inline media is base64-inflated (4/3) inside a JSON body that also carries the
// whole prompt and tool catalogue, and the free gateway answers an opaque
// `400 Param Incorrect` once the body crosses its payload limit. The verified
// safe ceiling is well under the raw body cap, so the decoded budget here is
// deliberately conservative: 24 MiB. Anything larger is re-encoded (and, when a
// single re-encode still cannot fit, split into multiple parts) by
// `media-normalize` before the provider ever sees it.
export const MAX_INLINE_MEDIA_DECODED_BYTES = 24 * 1024 * 1024

/** Decoded byte length of an inline base64 payload (data URL or bare base64). */
export function inlineMediaDecodedBytes(value: string) {
  if (value.startsWith("data:")) {
    const comma = value.indexOf(",")
    if (comma === -1) return undefined
    const meta = value.slice(5, comma)
    if (!meta.includes(";base64")) return undefined
    value = value.slice(comma + 1)
  }
  return Math.floor((value.length * 3) / 4)
}

/** Decoded byte length of a raw media payload (base64 string or bytes). */
export function mediaDecodedBytes(data: unknown) {
  if (typeof data === "string") return inlineMediaDecodedBytes(data)
  if (data instanceof Uint8Array) return data.byteLength
  if (data instanceof ArrayBuffer) return data.byteLength
  return undefined
}

/** Whether an inline media payload is large enough to trip the provider payload limit. */
export function inlineMediaTooLarge(mime: string, data: unknown) {
  if (!isMedia(mime)) return false
  const bytes = mediaDecodedBytes(data)
  return bytes !== undefined && bytes > MAX_INLINE_MEDIA_DECODED_BYTES
}

/**
 * Whether the catalogue's own capability flag agrees that a part can be carried.
 *
 * `mediaCarrierAccepts` answers "can this SDK encode it". This answers "does the
 * model say it accepts it". Both must hold, and keeping them as two named
 * predicates makes it obvious which one a mismatch came from.
 */
export function modelAcceptsInputModality(
  input: { image?: boolean; audio?: boolean; video?: boolean; pdf?: boolean } | undefined,
  mime: string,
) {
  if (!input) return false
  if (mime.startsWith("image/")) return input.image === true
  if (mime.startsWith("audio/")) return input.audio === true
  if (mime.startsWith("video/")) return input.video === true
  if (mime === "application/pdf") return input.pdf === true
  return true
}

/** MPEG transport stream sync byte, which repeats every 188 bytes. */
function isTransportStream(bytes: Uint8Array) {
  if (bytes.length < 377 || bytes[0] !== 0x47 || bytes[188] !== 0x47 || bytes[376] !== 0x47) return false
  for (let offset = 0; offset < 1880 && offset + 188 <= bytes.length; offset += 188) {
    if (bytes[offset] !== 0x47) return false
  }
  return true
}

/**
 * Whether a prefix of the file reads as text rather than binary.
 *
 * The extension `.ts` belongs to both TypeScript source and MPEG transport
 * streams, and the type table resolves it to `video/mp2t`. A source file handed
 * to the model as video is rejected by every provider that has no video input,
 * and that rejection takes the whole message with it — so the content, not the
 * extension, is what decides.
 */
function looksLikeText(bytes: Uint8Array) {
  const sample = bytes.subarray(0, 4096)
  if (sample.length === 0) return false
  let printable = 0
  for (const byte of sample) {
    if (byte === 0) return false
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte < 0x7f) || byte >= 0x80) printable++
  }
  if (printable / sample.length < 0.92) return false
  // Reject the encodings that survive the byte test but are not text.
  if (sample.length >= 2 && ((sample[0] === 0xff && sample[1] === 0xfe) || (sample[0] === 0xfe && sample[1] === 0xff))) return false
  return true
}

export function sniffAttachmentMime(bytes: Uint8Array, fallback: string) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif"
  if (startsWith(bytes, [0x42, 0x4d])) return "image/bmp"
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp"
  }
  if (startsWith(bytes, [0x49, 0x44, 0x33])) return "audio/mpeg"
  if (startsWith(bytes, [0x66, 0x4c, 0x61, 0x43])) return "audio/flac"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x41, 0x56, 0x45])) return "audio/wav"
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm"
  if (startsWith(bytes, [0x00, 0x00, 0x00]) && startsWith(bytes.subarray(4), [0x66, 0x74, 0x79, 0x70])) return "video/mp4"
  if (isTransportStream(bytes)) return "video/mp2t"

  // Checked last: a real transport stream would otherwise be read as text,
  // because its sync byte is a printable ASCII character.
  const claimedMedia =
    fallback.startsWith("video/") || fallback.startsWith("audio/") || fallback.startsWith("image/") || fallback === "application/octet-stream"
  if (claimedMedia && looksLikeText(bytes)) return "text/plain"

  return fallback
}
