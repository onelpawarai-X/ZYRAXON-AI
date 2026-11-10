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

const probe = async (label) => {
  const r = await page.evaluate(() => {
    const rail = document.querySelector(".settings-v2-rail")?.getBoundingClientRect()
    const list = document.querySelector('[data-slot="tabs-v2-list"]')?.getBoundingClientRect()
    const panel = document.querySelector(".settings-v2-panel")?.getBoundingClientRect()
    const railRight = rail ? Math.round(rail.right) : null
    const bad = []
    const scope = document.querySelector('[data-slot="tabs-v2-content"]')
    if (scope) {
      for (const el of scope.querySelectorAll("*")) {
        const b = el.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) continue
        if (b.left < railRight - 1) {
          bad.push({
            cls: (el.className || "").toString().slice(0, 60),
            tag: el.tagName.toLowerCase(),
            left: Math.round(b.left),
            top: Math.round(b.top),
            w: Math.round(b.width),
            h: Math.round(b.height),
            text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 40),
          })
        }
      }
    }
    return {
      railRight,
      list: list ? { x: Math.round(list.x), w: Math.round(list.width) } : null,
      panel: panel ? { x: Math.round(panel.x), y: Math.round(panel.y), w: Math.round(panel.width) } : null,
      overlapCount: bad.length,
      sample: bad.slice(0, 14),
    }
  })
  console.log(`\n=== ${label} === railRight=${r.railRight} list=${JSON.stringify(r.list)} panel=${JSON.stringify(r.panel)} overlap=${r.overlapCount}`)
  for (const s of r.sample) console.log(`   ${s.tag}.${s.cls} L=${s.left} T=${s.top} ${s.w}x${s.h} "${s.text}"`)
}

await probe("General")
await page.getByText("Language", { exact: true }).first().click().catch(() => {})
await wait(2000)
await probe("Language")
await page.getByText("About", { exact: true }).first().click().catch(() => {})
await wait(2000)
await probe("About")
await page.getByText("Extensions", { exact: true }).first().click().catch(() => {})
await wait(2500)
await probe("Extensions/MCP")
await browser.close()
