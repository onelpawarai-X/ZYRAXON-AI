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

const rail = await page.evaluate(() => {
  const r = document.querySelector(".settings-v2-rail")
  const rb = r.getBoundingClientRect()
  const cs = getComputedStyle(r)
  const kids = [...r.children].map((c) => {
    const b = c.getBoundingClientRect()
    return { cls: c.className, y: Math.round(b.y), h: Math.round(b.height), bottom: Math.round(b.bottom), scrollH: c.scrollHeight }
  })
  const footer = document.querySelector(".settings-v2-nav-footer")
  const fb = footer?.getBoundingClientRect()
  return {
    rail: { y: Math.round(rb.y), h: Math.round(rb.height), bottom: Math.round(rb.bottom), scrollH: r.scrollHeight, clientH: r.clientHeight, overflowY: cs.overflowY },
    kids,
    footer: fb ? { y: Math.round(fb.y), h: Math.round(fb.height), bottom: Math.round(fb.bottom), text: footer.innerText.replace(/\s+/g, " ") } : null,
    groups: (() => {
      const g = document.querySelector(".settings-v2-rail-groups")
      if (!g) return null
      const b = g.getBoundingClientRect()
      return { y: Math.round(b.y), h: Math.round(b.height), bottom: Math.round(b.bottom), scrollH: g.scrollHeight, clientH: g.clientHeight }
    })(),
  }
})
console.log("RAIL:", JSON.stringify(rail, null, 1))

// any other footer-ish element with desktop/directory text
const extra = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll("*")) {
    const t = (el.innerText || "")
    if (/desktop|directory|version/i.test(t) && el.children.length === 0 && t.length < 80) {
      const b = el.getBoundingClientRect()
      if (b.width && b.height) out.push({ cls: (el.className || "").toString().slice(0, 50), t: t.replace(/\s+/g, " "), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) })
    }
  }
  return out.slice(0, 25)
})
console.log("\nTEXT MATCHES:")
for (const e of extra) console.log(`  ${e.cls} @${e.x},${e.y} w=${e.w} "${e.t}"`)
await browser.close()
