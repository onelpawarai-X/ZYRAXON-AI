// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

﻿import { describe, expect, test } from "bun:test"
import {
  captureScreen,
  clickAt,
  currentPlatform,
  decodePngToRgb,
  desktopInfo,
  dragMouse,
  encodePng,
  listWindows,
  moveMouse,
  parseCombo,
  pressKeys,
  scrollAt,
  typeText,
} from "../src/x/desktop-control"

// These drive the real mouse, keyboard and screen of the machine running them, so they
// only make sense in an interactive session. A runner has no desktop to click, and a
// developer does not expect a test run to move their cursor, so require an explicit opt-in.
const isWindows = currentPlatform() === "windows"
const drivesRealInput = isWindows && process.env.ZYRAXON_DESKTOP_CONTROL_TESTS === "1"

describe("desktop control runs on every platform", () => {
  test("reports a platform this machine can actually drive", () => {
    expect(["windows", "macos", "linux"]).toContain(currentPlatform())
  })

  test("desktop information comes from the live system", async () => {
    const result = await desktopInfo()
    expect(result.ok).toBe(true)
    expect(result.data.platform).toBe(currentPlatform())
    expect(result.data.user.length).toBeGreaterThan(0)
    if (currentPlatform() !== "linux") {
      expect(result.data.screen.width).toBeGreaterThan(0)
      expect(result.data.screen.height).toBeGreaterThan(0)
    }
  })
})

describe("PNG codec round trips real pixels", () => {
  test("encoding then decoding returns the same image", () => {
    const width = 3
    const height = 2
    const rgb = Buffer.alloc(width * height * 3)
    for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 7) % 256
    const decoded = decodePngToRgb(encodePng(rgb, width, height))
    expect(decoded.info).toEqual({ width, height })
    expect(decoded.rgb.equals(rgb)).toBe(true)
  })

  test("a non-PNG buffer is rejected instead of decoded into noise", () => {
    expect(() => decodePngToRgb(Buffer.from("not a png at all"))).toThrow()
  })
})

describe.skipIf(!drivesRealInput)("screen capture produces a real frame", () => {
  test("captures the screen and reports its true size", async () => {
    const shot = await captureScreen()
    expect(shot.base64.length).toBeGreaterThan(0)
    expect(shot.width).toBeGreaterThan(0)
    expect(shot.height).toBeGreaterThan(0)
    const bytes = Buffer.from(shot.base64, "base64")
    const { info, rgb } = decodePngToRgb(bytes)
    expect(info.width).toBe(shot.width)
    expect(info.height).toBe(shot.height)
    // A real screenshot is not a single flat colour.
    expect(new Set(rgb.subarray(0, 3000)).size).toBeGreaterThan(1)
  }, 30000)

  test("a region capture stays inside the requested bounds", async () => {
    const shot = await captureScreen({ x: 10, y: 10, w: 200, h: 150 })
    expect(shot.width).toBe(200)
    expect(shot.height).toBe(150)
  }, 30000)
})

describe("key combinations parse before anything is sent", () => {
  test("accepts a normal chord", () => {
    expect(parseCombo("ctrl+shift+p")).toEqual(["ctrl", "shift", "p"])
  })

  test("accepts named keys and single characters", () => {
    expect(parseCombo("enter")).toEqual(["enter"])
    expect(parseCombo("alt+tab")).toEqual(["alt", "tab"])
  })

  test("an unknown key is an explicit error, not a silent no-op", () => {
    expect(() => parseCombo("ctrl+notakey")).toThrow(/unknown key/)
  })

  test("an empty combination is rejected", () => {
    expect(() => parseCombo("  +  ")).toThrow(/empty/)
  })
})

describe("invalid input is refused before touching the desktop", () => {
  test("unknown mouse button", async () => {
    expect(await clickAt(10, 10, "foot")).toEqual({ ok: false, error: "unknown mouse button: foot" })
  })

  test("click count out of range", async () => {
    expect(await clickAt(10, 10, "left", 99)).toEqual({
      ok: false,
      error: "clicks must be between 1 and 5",
    })
  })

  test("non-numeric coordinates", async () => {
    expect(await moveMouse(Number.NaN, 10)).toEqual({ ok: false, error: "x and y must be numbers" })
  })

  test("unknown scroll direction", async () => {
    expect(await scrollAt("sideways", 3)).toEqual({
      ok: false,
      error: "unknown scroll direction: sideways",
    })
  })

  test("scroll amount out of range", async () => {
    expect(await scrollAt("down", 0)).toEqual({ ok: false, error: "amount must be between 1 and 50" })
  })

  test("drag step count out of range", async () => {
    expect(await dragMouse(0, 0, 10, 10, 1)).toEqual({
      ok: false,
      error: "steps must be between 2 and 200",
    })
  })

  test("empty text", async () => {
    expect(await typeText("")).toEqual({ ok: false, error: "text is required" })
  })

  test("typing interval out of range", async () => {
    expect(await typeText("hello", 9999)).toEqual({
      ok: false,
      error: "intervalMs must be between 0 and 1000",
    })
  })
})

describe("desktop actions reach the operating system", () => {
  test.skipIf(!drivesRealInput)("moving the mouse succeeds", async () => {
    const result = await moveMouse(300, 200)
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ moved: true, x: 300, y: 200, platform: "windows" })
  }, 30000)

  test.skipIf(!drivesRealInput)("a left click succeeds", async () => {
    const result = await clickAt(300, 200, "left", 1)
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ clicked: true, button: "left", clicks: 1 })
  }, 30000)

  test.skipIf(!drivesRealInput)("a right click succeeds", async () => {
    const result = await clickAt(300, 200, "right")
    expect(result.ok).toBe(true)
  }, 30000)

  test.skipIf(!drivesRealInput)("a drag succeeds", async () => {
    const result = await dragMouse(250, 180, 400, 260, 8)
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({
      dragged: true,
      from: { x: 250, y: 180 },
      to: { x: 400, y: 260 },
    })
  }, 40000)

  test.skipIf(!drivesRealInput)("scrolling in each direction succeeds", async () => {
    for (const direction of ["up", "down", "left", "right"] as const) {
      const result = await scrollAt(direction, 2, 300, 200)
      expect(result.ok).toBe(true)
    }
  }, 40000)

  test.skipIf(!drivesRealInput)("a modifier chord succeeds and can be released", async () => {
    const pressed = await pressKeys("ctrl+shift+esc")
    expect(pressed.ok).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 500))
    const released = await pressKeys("esc")
    expect(released.ok).toBe(true)
  }, 30000)

  test.skipIf(!drivesRealInput)("real windows are enumerated with titles and geometry", async () => {
    const windows = await listWindows()
    expect(windows.length).toBeGreaterThan(0)
    for (const w of windows) {
      expect(typeof w.title).toBe("string")
      expect(w.title.length).toBeGreaterThan(0)
      expect(Number.isFinite(w.width)).toBe(true)
      expect(Number.isFinite(w.pid)).toBe(true)
    }
  }, 30000)
})
