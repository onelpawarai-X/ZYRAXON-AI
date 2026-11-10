// Copyright (c) 2026 onelpawarai. All rights reserved.

// The mic records the whole utterance and sends it once, so the pieces that have
// to be right are the ones that build the bytes the server reads: resampling to
// the rate the endpoint wants, joining the recorded frames without losing or
// repeating a sample, and writing a WAV header the recogniser accepts.

import { describe, expect, test } from "bun:test"
import { concatFrames, encodeWav, toInt16 } from "./stt-client"

describe("toInt16", () => {
  test("keeps the samples when the rate already matches", () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1])
    const out = toInt16(input, 16000, 16000)
    expect(Array.from(out)).toEqual([0, 16384, -16383, 32767, -32767])
  })

  test("resamples 48k speech down to 16k at a third of the length", () => {
    const input = new Float32Array(48000)
    for (let i = 0; i < input.length; i++) input[i] = Math.sin((i / 48000) * 2 * Math.PI * 440)
    const out = toInt16(input, 48000, 16000)
    expect(out.length).toBe(16000)
    expect(Math.max(...out)).toBeGreaterThan(0)
    expect(Math.min(...out)).toBeLessThan(0)
  })
})

describe("concatFrames", () => {
  test("joins frames in order with no sample lost or duplicated", () => {
    const merged = concatFrames([new Float32Array([1, 2]), new Float32Array([3]), new Float32Array([4, 5, 6])])
    expect(Array.from(merged)).toEqual([1, 2, 3, 4, 5, 6])
  })

  test("an empty recording is an empty buffer", () => {
    expect(concatFrames([]).length).toBe(0)
  })
})

describe("encodeWav", () => {
  test("writes a mono 16-bit header whose length matches the samples", () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767])
    const view = new DataView(encodeWav(pcm, 16000))
    const ascii = (offset: number, length: number) =>
      Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("")
    expect(ascii(0, 4)).toBe("RIFF")
    expect(ascii(8, 4)).toBe("WAVE")
    expect(ascii(36, 4)).toBe("data")
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(pcm.length * 2)
    expect(view.getUint32(4, true)).toBe(36 + pcm.length * 2)
    const samples = new Int16Array(view.buffer, 44)
    expect(Array.from(samples)).toEqual(Array.from(pcm))
  })
})
