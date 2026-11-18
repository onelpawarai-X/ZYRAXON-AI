// Copyright (c) 2026 onelpawarai. All rights reserved.

import { chromium } from "@playwright/test"
const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(6000)
await page.getByText("Settings", { exact: true }).first().click()
await page.waitForTimeout(2500)

const m = await page.evaluate(() => {
  const rail = document.querySelector(".settings-v2-rail")
  const footer = document.querySelector(".settings-v2-nav-footer")
  const groups = document.querySelector(".settings-v2-rail-groups")
  if (!rail || !footer) return null
  const r = rail.getBoundingClientRect()
  const f = footer.getBoundingClientRect()
  const g = groups?.getBoundingClientRect() ?? null
  return {
    railBottom: Math.round(r.bottom),
    footerTop: Math.round(f.top),
    footerBottom: Math.round(f.bottom),
    footerText: footer.textContent?.trim().slice(0, 60),
    footerInsideRail: f.bottom <= r.bottom + 1 && f.top >= r.top - 1,
    groupsScrollable: g ? g.scrollHeight > g.clientHeight : null,
  }
})
console.log(JSON.stringify(m, null, 2))
await browser.close()
