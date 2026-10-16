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

async function boxes(label) {
  const r = await page.evaluate(() => {
    const g = (sel) => {
      const e = document.querySelector(sel)
      if (!e) return null
      const b = e.getBoundingClientRect()
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
    }
    return {
      dialog: g('[data-component="dialog-v2"]'),
      container: g('[data-component="dialog-v2"] [data-slot="dialog-container"]'),
      body: g('[data-component="dialog-v2"] [data-slot="dialog-body"]'),
      tabs: g('[data-component="tabs-v2"][data-variant="settings"]'),
      list: g('[data-component="tabs-v2"][data-variant="settings"] [data-slot="tabs-v2-list"]'),
      rail: g('.settings-v2-rail'),
      content: g('[data-component="tabs-v2"] [data-slot="tabs-v2-content"]'),
      panel: g('.settings-v2-panel'),
      header: g('.settings-v2-tab-header'),
    }
  })
  console.log(`\n[${label}]`)
  for (const [k, v] of Object.entries(r)) console.log(`  ${k}:`, v)
}
await boxes("General")

// Language
await page.getByText("Language", { exact: true }).first().click().catch(() => {})
await wait(2000)
await boxes("Language")
// first flag element positions vs rail width
const flags = await page.evaluate(() => {
  const rail = document.querySelector('.settings-v2-rail')?.getBoundingClientRect()
  const out = []
  document.querySelectorAll('[data-component="settings-v2-list"] > * , .settings-v2-panel *').forEach((e) => {})
  return { railRight: rail ? Math.round(rail.right) : null }
})
console.log("railRight:", flags.railRight)

// About
await page.getByText("About", { exact: true }).first().click().catch(() => {})
await wait(2000)
await boxes("About")

// rail footer (desktop dir/version overflow)
const footer = await page.evaluate(() => {
  const f = document.querySelector(".settings-v2-nav-footer")
  if (!f) return null
  const b = f.getBoundingClientRect()
  const items = [...f.children].map((c) => ({ t: c.innerText.replace(/\s+/g, " ").trim().slice(0, 60), h: Math.round(c.getBoundingClientRect().height) }))
  return { y: Math.round(b.y), h: Math.round(b.height), bottom: Math.round(b.bottom), items }
})
console.log("\n[rail footer]", JSON.stringify(footer, null, 1))
await browser.close()
