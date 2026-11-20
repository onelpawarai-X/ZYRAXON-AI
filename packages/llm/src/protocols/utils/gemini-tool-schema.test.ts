// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { GeminiToolSchema } from "./gemini-tool-schema"

const convert = (schema: unknown) => GeminiToolSchema.convert(schema) as Record<string, unknown>

describe("GeminiToolSchema.convert", () => {
  test("keeps required on a real object and forces type object", () => {
    const out = convert({
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    })
    expect(out.type).toBe("object")
    expect(out.required).toEqual(["city"])
  })

  test("promotes an inferred object so required is legal", () => {
    const out = convert({ properties: { city: { type: "string" } }, required: ["city"] })
    expect(out.type).toBe("object")
    expect(out.required).toEqual(["city"])
  })

  test("drops required on a union variant that carries no object type", () => {
    const out = convert({
      anyOf: [
        { type: "string", required: ["ghost"] },
        { type: "number", required: ["ghost"] },
      ],
    })
    const variants = out.anyOf as Record<string, unknown>[]
    expect(variants.every((variant) => variant.required === undefined)).toBe(true)
  })

  test("drops required that names a property the node does not declare", () => {
    const out = convert({
      type: "object",
      properties: { city: { type: "string" } },
      required: ["missing"],
    })
    expect(out.required).toBeUndefined()
  })

  test("drops an empty required list rather than sending required: []", () => {
    const out = convert({ type: "object", properties: { city: { type: "string" } }, required: [] })
    expect(out.required).toBeUndefined()
  })

  test("never emits required on a node whose type is not object", () => {
    const out = convert({ type: "string", required: ["x"] })
    expect(out.required).toBeUndefined()
    expect(out.type).toBe("string")
  })
})
