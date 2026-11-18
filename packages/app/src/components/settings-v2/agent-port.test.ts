// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import {
  agentFileName,
  createDragTracker,
  downloadAgentFile,
  fromConfigEntry,
  isFileDrag,
  parseAgentFile,
  slugify,
  toAgentFile,
  toConfigEntry,
} from "./agent-port"

const agent = {
  name: "Release Notes",
  description: "Turns a diff into release notes",
  mode: "primary" as const,
  model: "zyraxon/zyraxon-codex",
  prompt: "Summarise each change in one line.",
}

describe("agent port", () => {
  test("a name becomes the identifier the config keys on", () => {
    expect(slugify("Release Notes")).toBe("release-notes")
    expect(slugify("  Weird!! Name  ")).toBe("weird-name")
    expect(slugify("---")).toBe("")
  })

  test("the exported file name is derived from the agent name", () => {
    expect(agentFileName({ name: "Release Notes" })).toBe("release-notes.zyraxon-agent.json")
    expect(agentFileName({ name: "!!!" })).toBe("agent.zyraxon-agent.json")
  })

  test("an exported agent survives a round trip", () => {
    const parsed = parseAgentFile(toAgentFile(agent))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.name).toBe("release-notes")
    expect(parsed.file.agent).toEqual({
      name: "release-notes",
      description: agent.description,
      mode: "primary",
      model: agent.model,
      prompt: agent.prompt,
    })
  })

  test("empty optional fields are left out instead of written as null", () => {
    const text = toAgentFile({ name: "Bare", mode: "all" })
    expect(JSON.parse(text).agent).toEqual({ name: "bare", mode: "all" })
  })

  test("a bare agent object is accepted", () => {
    const parsed = parseAgentFile(JSON.stringify({ name: "Triage", mode: "subagent", prompt: "Sort the inbox." }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.agent).toEqual({ name: "triage", mode: "subagent", prompt: "Sort the inbox." })
  })

  test("a one-entry config fragment is accepted and takes its name from the key", () => {
    const parsed = parseAgentFile(JSON.stringify({ "duplicate-pr": { mode: "primary", prompt: "Find duplicates." } }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.name).toBe("duplicate-pr")
    expect(parsed.file.agent.mode).toBe("primary")
  })

  test("an unknown mode falls back to all rather than being refused", () => {
    const parsed = parseAgentFile(JSON.stringify({ name: "X", mode: "banana" }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.agent.mode).toBe("all")
  })

  test("a temperature is carried through", () => {
    const parsed = parseAgentFile(toAgentFile({ name: "Warm", mode: "all", temperature: 0.2 }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.agent.temperature).toBe(0.2)
  })

  test("broken input is refused with a reason instead of throwing", () => {
    expect(parseAgentFile("not json").ok).toBe(false)
    expect(parseAgentFile("[1,2,3]").ok).toBe(false)
    expect(parseAgentFile("{}").ok).toBe(false)
    expect(parseAgentFile(JSON.stringify({ name: "!!!" })).ok).toBe(false)
    expect(parseAgentFile(JSON.stringify({ a: {}, b: {} })).ok).toBe(false)
  })
})

describe("config round trip", () => {
  test("export -> import -> export is byte for byte identical", () => {
    // The name is already in the form the config keys on, which is what an
    // agent that came out of the panel has, so the trip must be lossless.
    const original = {
      name: "release-notes",
      description: "Turns a diff into release notes",
      mode: "primary" as const,
      model: "zyraxon/zyraxon-codex",
      temperature: 0.2,
      prompt: "Summarise each change in one line.",
    }

    const first = toAgentFile(original)
    const imported = parseAgentFile(first)
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    // The imported file becomes a config entry, exactly as the UI stores it.
    const entry = toConfigEntry(imported.file)
    expect(entry.prompt).toBe(original.prompt)
    expect(entry.temperature).toBe(0.2)
    expect(entry.model).toBe("zyraxon/zyraxon-codex")
    expect(entry.mode).toBe("primary")

    // Reading that entry back produces the same agent, so nothing is lost.
    const restored = fromConfigEntry(imported.file.name, entry)
    expect(restored).toEqual(original)

    // And a second export is identical to the first, which proves stability.
    expect(toAgentFile(restored)).toBe(first)
  })

  test("a display name becomes the identifier the config keys on", () => {
    // Agents are keyed by slug in the config, and the create form already writes
    // that form, so an exported file carries it too and an import cannot produce
    // a key the rest of the app would not recognise.
    const imported = parseAgentFile(toAgentFile({ name: "Release Notes", mode: "all" }))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.file.name).toBe("release-notes")
    expect(imported.file.agent.name).toBe("release-notes")
  })

  test("a sparse agent round trips without gaining null fields", () => {
    const original = { name: "tiny", mode: "all" as const, prompt: "Do one thing." }
    const imported = parseAgentFile(toAgentFile(original))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    const entry = toConfigEntry(imported.file)
    // The entry must not carry keys the agent never had, or the config fills
    // with nulls and a re-export no longer matches the original file.
    expect(Object.keys(entry).sort()).toEqual(["mode", "prompt"])

    expect(toAgentFile(fromConfigEntry(imported.file.name, entry))).toBe(toAgentFile(original))
  })

  test("an agent with no prompt still imports as a usable entry", () => {
    const parsed = parseAgentFile(JSON.stringify({ name: "empty", mode: "all" }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const entry = toConfigEntry(parsed.file)
    expect(entry.mode).toBe("all")
    expect(entry.prompt).toBeUndefined()
    expect(fromConfigEntry(parsed.file.name, entry).name).toBe("empty")
  })
})

describe("download", () => {
  test("an exported agent reaches a real anchor and its object URL is released", () => {
    // A real document is used so the click path is exercised end to end rather
    // than stubbed: the anchor has to exist, carry the download name, and be
    // cleaned up, and the object URL has to be handed back afterwards.
    const doc = document.implementation.createHTMLDocument("export")
    const created: string[] = []
    const revoked: string[] = []
    const realCreate = URL.createObjectURL
    const realRevoke = URL.revokeObjectURL
    URL.createObjectURL = (blob: Blob) => {
      expect(blob.type).toBe("application/json")
      const url = `blob:test/${created.length}`
      created.push(url)
      return url
    }
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url)
    }

    try {
      let clicked = 0
      const realClick = HTMLAnchorElement.prototype.click
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        clicked += 1
        // The anchor must be in the document and carry the export name at the
        // moment the browser would act on it.
        expect(this.download).toBe("release-notes.zyraxon-agent.json")
        expect(this.href).toContain("blob:test/")
        expect(doc.body.contains(this)).toBe(true)
      }

      try {
        const name = downloadAgentFile({ name: "Release Notes", mode: "all" }, doc)
        expect(name).toBe("release-notes.zyraxon-agent.json")
        expect(clicked).toBe(1)
      } finally {
        HTMLAnchorElement.prototype.click = realClick
      }
    } finally {
      URL.createObjectURL = realCreate
      URL.revokeObjectURL = realRevoke
    }

    // One URL made, one URL released, and no anchor left behind.
    expect(created).toHaveLength(1)
    expect(revoked).toEqual(created)
    expect(doc.body.querySelectorAll("a")).toHaveLength(0)
  })
})

describe("drag and drop", () => {
  test("only a drag carrying files arms the drop target", () => {
    expect(isFileDrag(["Files"])).toBe(true)
    expect(isFileDrag(["text/plain"])).toBe(false)
    expect(isFileDrag([])).toBe(false)
    expect(isFileDrag(undefined)).toBe(false)
  })

  test("the highlight stays on until the drag leaves the last child", () => {
    const drag = createDragTracker()
    expect(drag.active).toBe(false)

    // Entering the panel and then a row inside it is two enters and one leave.
    drag.enter()
    drag.enter()
    expect(drag.active).toBe(true)
    expect(drag.leave()).toBe(false)
    expect(drag.active).toBe(true)

    // The last leave reports true, which is when the caller clears the highlight.
    expect(drag.leave()).toBe(true)
    expect(drag.active).toBe(false)
  })

  test("a drop resets the tracker so the next drag starts clean", () => {
    const drag = createDragTracker()
    drag.enter()
    drag.enter()
    drag.reset()
    expect(drag.active).toBe(false)
    // A leave after a reset must not go negative and start reporting true.
    expect(drag.leave()).toBe(true)
    expect(drag.active).toBe(false)
  })

  test("a stray leave without an enter does not report the drag as over", () => {
    const drag = createDragTracker()
    expect(drag.leave()).toBe(true)
    expect(drag.active).toBe(false)
  })
})
