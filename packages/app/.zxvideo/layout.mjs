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

for (const s of ["Language", "About", "Providers", "Models", "Security", "Advanced"]) {
  const el = page.getByText(s, { exact: true }).first()
  if (await el.count()) {
    await el.click().catch(() => {})
    await wait(1600)
    await page.screenshot({ path: `/tmp/S-${s.replace(/\s/g, "")}.png` })
    console.log("shot", s)
  }
}
await page.keyboard.press("Escape")
await wait(1500)

await page.getByText("MCP Connect", { exact: true }).first().click()
await wait(3200)
await page.screenshot({ path: "/tmp/S-mcp.png" })
await page.getByText("AI & Media", { exact: true }).first().click().catch(() => {})
await wait(1500)
await page.screenshot({ path: "/tmp/S-mcp-cat.png" })

// measure the nav/content boxes in settings to find the overlap
await page.keyboard.press("Escape")
await wait(1200)
await page.getByText("Settings", { exact: true }).first().click()
await wait(2500)
const lang = page.getByText("Language", { exact: true }).first()
await lang.click().catch(() => {})
await wait(1800)
const boxes = await page.evaluate(() => {
  const pick = (sel) => {
    const e = document.querySelector(sel)
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  return [
    pick(".settings-v2-nav, [data-component=settings-v2-nav], nav"),
    pick(".settings-v2-content, main, [data-component=settings-v2-content]"),
    pick("[class*=settings-v2]"),
  ]
})
console.log("BOXES:", JSON.stringify(boxes))
const classes = await page.evaluate(() =>
  [...document.querySelectorAll("div")].map((e) => e.className).filter((c) => typeof c === "string" && c.includes("settings-v2")).slice(0, 20),
)
console.log("CLASSES:", JSON.stringify(classes))
await browser.close()
