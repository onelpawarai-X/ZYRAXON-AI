// Copyright (c) 2026 onelpawarai. All rights reserved.

import { expect, test } from "bun:test"
import path from "path"
import { testRender } from "@opentui/solid"
import { abbreviateHome } from "../src/runtime"
import { TuiPathsProvider, useTuiPaths } from "../src/context/runtime"

test("abbreviates paths within home boundaries", () => {
  // abbreviateHome joins with path.sep, so the expected suffix follows the platform.
  const home = path.resolve(path.sep, "home", "test")
  const outside = path.resolve(path.sep, "home", "tester", "project")
  const other = path.resolve(path.sep, "tmp", "project")

  expect(abbreviateHome(home, home)).toBe("~")
  expect(abbreviateHome(path.join(home, "project"), home)).toBe("~" + path.sep + "project")
  expect(abbreviateHome(outside, home)).toBe(outside)
  expect(abbreviateHome(other, home)).toBe(other)
})

test("provides focused immutable runtime inputs", async () => {
  let paths: ReturnType<typeof useTuiPaths>

  function Runtime() {
    paths = useTuiPaths()
    return <text>{paths.cwd}</text>
  }

  const app = await testRender(
    () => (
      <TuiPathsProvider value={{ cwd: "/work", home: "/home/test", state: "/state", worktree: "/worktree" }}>
        <Runtime />
      </TuiPathsProvider>
    ),
    { width: 40, height: 3 },
  )

  try {
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("/work")
    expect(Object.isFrozen(paths!)).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})
