// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { buildBundle, bundleFileName, parseBundle, remapIds, resession, serializeBundle, type StoredMessage } from "@zyraxon-ai/schema/session-port"

const session = {
  id: "ses_abc",
  project_id: "prj_1",
  title: "Fix the login flow",
  cost: 0.25,
  tokens_input: 10,
  tokens_output: 20,
  tokens_reasoning: 0,
  tokens_cache_read: 0,
  tokens_cache_write: 0,
  time_created: 1000,
  time_updated: 2000,
}

const messages: StoredMessage[] = [
  {
    id: "msg_2",
    type: "assistant",
    seq: 2,
    time_created: 1200,
    data: { sessionID: "ses_abc", text: "Done." },
    parts: [],
  },
  {
    id: "msg_1",
    type: "user",
    seq: 1,
    time_created: 1100,
    data: { sessionID: "ses_abc", text: "Hello" },
    parts: [],
  },
]

describe("session port bundle", () => {
  test("a bundle survives a full round trip", () => {
    const text = serializeBundle(buildBundle({ session, messages }))
    const parsed = parseBundle(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.bundle.session.id).toBe("ses_abc")
    expect(parsed.bundle.session.title).toBe("Fix the login flow")
    expect(parsed.bundle.messages).toHaveLength(2)
    expect(parsed.bundle.messages[0]?.id).toBe("msg_1")
    expect(parsed.bundle.messages[1]?.id).toBe("msg_2")
  })

  test("messages are written in conversation order, not arrival order", () => {
    const bundle = buildBundle({ session, messages })
    expect(bundle.messages.map((m) => m.seq)).toEqual([1, 2])
  })

  test("parts travel with their message so a restored chat has content", () => {
    const withParts: StoredMessage[] = [
      {
        id: "msg_1",
        type: "user",
        seq: 1,
        time_created: 1100,
        data: { sessionID: "ses_abc", role: "user" },
        parts: [
          { id: "prt_1", time_created: 1100, data: { type: "text", text: "Hello" } },
          { id: "prt_2", time_created: 1101, data: { type: "text", text: " again" } },
        ],
      },
    ]
    const parsed = parseBundle(serializeBundle(buildBundle({ session, messages: withParts })))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.bundle.messages[0]?.parts).toHaveLength(2)
    expect(parsed.bundle.messages[0]?.parts[0]).toMatchObject({ id: "prt_1", data: { text: "Hello" } })
  })

  test("a message whose parts are malformed is refused", () => {
    const parsed = parseBundle(
      JSON.stringify({
        kind: "zyraxon-session-port",
        version: 1,
        session: { id: "ses_x", project_id: "prj_x" },
        messages: [{ id: "msg_1", type: "user", seq: 1, time_created: 1, data: {}, parts: [{ id: "prt_1" }] }],
      }),
    )
    expect(parsed.ok).toBe(false)
  })

  test("broken input is refused with a reason instead of throwing", () => {
    expect(parseBundle("not json").ok).toBe(false)
    expect(parseBundle("[1,2,3]").ok).toBe(false)
    expect(parseBundle("{}").ok).toBe(false)
    expect(parseBundle(JSON.stringify({ kind: "something-else", version: 1 })).ok).toBe(false)
    expect(parseBundle(JSON.stringify({ kind: "zyraxon-session-port", version: 99 })).ok).toBe(false)
    expect(
      parseBundle(JSON.stringify({ kind: "zyraxon-session-port", version: 1, session: {}, messages: [] })).ok,
    ).toBe(false)
    expect(
      parseBundle(
        JSON.stringify({ kind: "zyraxon-session-port", version: 1, session: { id: "a", project_id: "b" }, messages: [{}] }),
      ).ok,
    ).toBe(false)
  })

  test("a sparse session fills defaults rather than writing nulls", () => {
    const parsed = parseBundle(
      JSON.stringify({
        kind: "zyraxon-session-port",
        version: 1,
        session: { id: "ses_x", project_id: "prj_x" },
        messages: [],
      }),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.bundle.session.cost).toBe(0)
    expect(parsed.bundle.session.title).toBe("Imported session")
    expect(parsed.bundle.session.parent_id).toBeNull()
    expect(parsed.bundle.session.model).toBeNull()
  })
})

describe("session id remap", () => {
  test("an embedded session id follows the imported session", () => {
    const message = { sessionID: "ses_old", text: "hi", nested: { sessionID: "ses_old", other: "ses_other" } }
    const moved = resession(message, "ses_old", "ses_new") as typeof message
    expect(moved.sessionID).toBe("ses_new")
    expect(moved.nested.sessionID).toBe("ses_new")
    // A different session id is left alone.
    expect(moved.nested.other).toBe("ses_other")
  })

  test("arrays and primitives pass through unchanged", () => {
    expect(resession([1, "a", { sessionID: "ses_old" }], "ses_old", "ses_new")).toEqual([1, "a", { sessionID: "ses_new" }])
    expect(resession("plain", "ses_old", "ses_new")).toBe("plain")
    expect(resession(null, "ses_old", "ses_new")).toBeNull()
  })

  test("every id present in the map is rewritten, including nested references", () => {
    const body = {
      sessionID: "ses_old",
      parts: [{ messageID: "msg_a", id: "prt_1" }, { messageID: "msg_b", id: "prt_2" }],
      revert: { messageID: "msg_b" },
    }
    const moved = remapIds(body, { ses_old: "ses_new", msg_a: "msg_x", msg_b: "msg_y" }) as typeof body
    expect(moved.sessionID).toBe("ses_new")
    expect(moved.parts[0]?.messageID).toBe("msg_x")
    expect(moved.parts[1]?.messageID).toBe("msg_y")
    expect(moved.revert.messageID).toBe("msg_y")
    // An id that is not in the map is left alone, and a string that merely contains
    // an id as a substring is not rewritten by accident.
    expect(remapIds({ note: "msg_a and msg_a" }, { msg_a: "msg_x" })).toEqual({ note: "msg_a and msg_a" })
  })
})

describe("export file name", () => {
  test("the title becomes the file name", () => {
    expect(bundleFileName({ id: "ses_1", title: "Fix the login flow" })).toBe("fix-the-login-flow.zyraxon-session.json")
  })

  test("a missing title falls back to the session id", () => {
    expect(bundleFileName({ id: "ses_1" })).toBe("ses-1.zyraxon-session.json")
    expect(bundleFileName({ id: "ses_1", title: "!!!" })).toBe("ses-1.zyraxon-session.json")
    expect(bundleFileName({ id: "ses_1", title: "   " })).toBe("ses-1.zyraxon-session.json")
  })
})
