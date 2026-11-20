// Copyright (c) 2026 onelpawarai. All rights reserved.

import { chromium } from "@playwright/test"
const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
const wait = (ms) => page.waitForTimeout(ms)
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await wait(6000)
await page.getByText("Settings", { exact: true }).first().click()
await wait(3000)

const sections = await page.evaluate(() =>
  [...document.querySelectorAll('[data-action^="settings-nav-"]')].map((e) => e.getAttribute("data-action")),
)

const hit = (a, b) => !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top)

for (const action of sections) {
  const el = page.locator(`[data-action="${action}"]`).first()
  if (!(await el.count())) continue
  await el.click().catch(() => {})
  await wait(1400)
  const r = await page.evaluate(() => {
    const close = document.querySelector(".settings-v2-close")?.getBoundingClientRect()
    const rail = document.querySelector(".settings-v2-rail")?.getBoundingClientRect()
    const out = []
    const scope = document.querySelector('[data-slot="tabs-v2-content"]')
    if (scope && close) {
      for (const el of scope.querySelectorAll("button, a, input, h2, h3")) {
        const b = el.getBoundingClientRect()
        if (!b.width || !b.height) continue
        const ov = !(b.right < close.left || close.right < b.left || b.bottom < close.top || close.bottom < b.top)
        if (ov) out.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 40), text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 30), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) })
      }
    }
    return {
      close: close ? { x: Math.round(close.x), y: Math.round(close.y), r: Math.round(close.right), b: Math.round(close.bottom) } : null,
      rail: rail ? { r: Math.round(rail.right) } : null,
      collisions: out,
    }
  })
  const label = action.replace("settings-nav-", "")
  console.log(
    `${r.collisions.length ? "HIT " : "ok  "} ${label.padEnd(13)} close=@${r.close?.x},${r.close?.y} railRight=${r.rail?.r}` +
      (r.collisions.length ? "  collides: " + JSON.stringify(r.collisions) : ""),
  )
}
await browser.close()
