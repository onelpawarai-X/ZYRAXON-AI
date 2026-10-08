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
const MEDIA_CARRIERS: Record<"video" | "audio", readonly string[]> = {
  video: ["@ai-sdk/google", "@ai-sdk/google-vertex", "@ai-sdk/google-vertex/anthropic", "@ai-sdk/amazon-bedrock"],
  audio: [
    "@ai-sdk/openai",
    "@ai-sdk/google",
    "@ai-sdk/google-vertex",
    "@ai-sdk/openai-compatible",
    "@ai-sdk/amazon-bedrock",
  ],
}

/** Whether the provider SDK behind `npm` will carry this media file instead of throwing. */
export function mediaCarrierAccepts(npm: string, mime: string) {
  if (mime.startsWith("video/")) return MEDIA_CARRIERS.video.includes(npm)
  if (mime.startsWith("audio/")) return MEDIA_CARRIERS.audio.includes(npm)
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
