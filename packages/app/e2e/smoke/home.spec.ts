// Copyright (c) 2026 onelpawarai. All rights reserved.

import { expect, test } from "@playwright/test"
import { mockZyraxonServer } from "../utils/mock-server"
import { fixture, pageMessages } from "./session-timeline.fixture"

test.beforeEach(async ({ page }) => {
  await mockZyraxonServer(page, {
    provider: fixture.provider,
    directory: fixture.directory,
    project: fixture.project,
    sessions: fixture.sessions,
    pageMessages,
  })
})

test("home boots with the app shell", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(String(error)))

  await page.goto("/")

  await expect(page.locator("#root")).toBeAttached()
  await expect(page.getByRole("complementary", { name: "Projects" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Recent sessions" })).toBeVisible()

  expect(errors).toEqual([])
})

test("the Recent sessions panel exposes the Hub entry points", async ({ page }) => {
  await page.goto("/")

  const recent = page.getByRole("region", { name: "Recent sessions" })
  await expect(recent.getByRole("textbox", { name: "Search sessions" })).toBeVisible()
  await expect(page.getByRole("button", { name: "MCP Connect" })).toBeVisible()
  await expect(recent.getByRole("button", { name: "New session" }).first()).toBeVisible()
})
