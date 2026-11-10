// Copyright (c) 2026 onelpawarai. All rights reserved.

import { chromium } from "@playwright/test"
const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
const wait = (ms) => page.waitForTimeout(ms)

await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await wait(6000)

// select Default Project explicitly, then open a session
const proj = page.getByText("Default Project", { exact: true }).first()
if (await proj.count()) { await proj.click().catch(() => {}); await wait(2500) }

await page.getByText("New session", { exact: true }).first().click()
await wait(7000)
await page.screenshot({ path: "/tmp/e-session.png" })

// dump all actionable elements + titles
const dom = await page.evaluate(() => {
  const out = []
  document.querySelectorAll("button,[role=tab],[data-action],[title],[aria-label]").forEach((e) => {
    const tag = e.tagName
    const t = (e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 34)
    const a = e.getAttribute("data-action")
    const ti = e.getAttribute("title")
    const al = e.getAttribute("aria-label")
    if (a || ti || al || (t && t.length < 30)) out.push({ tag, t, a, ti: (ti || "").slice(0, 26), al: (al || "").slice(0, 26) })
  })
  return out
})
console.log("=== DOM ACTIONS ===")
console.log(JSON.stringify(dom.slice(0, 90), null, 0))

const t = await page.evaluate(() => document.body.innerText)
console.log("=== SESSION TEXT (first 1200) ===\n", t.slice(0, 1200))
await browser.close()
