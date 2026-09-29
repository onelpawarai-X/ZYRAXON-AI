// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { expect, test } from "bun:test"
import { run } from "../src"

test("exports the canonical application lifecycle", () => {
  expect(typeof run).toBe("function")
})
