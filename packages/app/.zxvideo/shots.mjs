import { chromium } from "@playwright/test"
import fs from "node:fs"

const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const OUT = "/workspace/project/ZYRAXON-AI/packages/app/.zxvideo/shots"
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(6000)
await page.getByText("Settings", { exact: true }).first().click()
await page.waitForTimeout(2500)

const sections = await page.evaluate(() =>
  [...document.querySelectorAll('[data-action^="settings-nav-"]')].map((e) => ({
    action: e.getAttribute("data-action"),
    label: e.innerText.replace(/\s+/g, " ").trim(),
  })),
)
console.log("nav items:", sections.length, JSON.stringify(sections.map((s) => s.label)))

for (let i = 0; i < sections.length; i++) {
  const s = sections[i]
  const el = page.locator(`[data-action="${s.action}"]`).first()
  if (!(await el.count())) continue
  await el.click().catch(() => {})
  await page.waitForTimeout(1200)
  const safe = s.label.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "")
  await page.screenshot({ path: `${OUT}/p-${String(i).padStart(2, "0")}-${safe}.png` })
}
console.log("shots written to", OUT)
await browser.close()
