import { chromium } from "@playwright/test"
const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
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

const rows = []
for (const s of sections) {
  await page.locator(`[data-action="${s.action}"]`).first().click().catch(() => {})
  await page.waitForTimeout(1200)
  const m = await page.evaluate(() => {
    const rail = document.querySelector(".settings-v2-rail")?.getBoundingClientRect()
    const panel = document.querySelector(".settings-v2-panel")?.getBoundingClientRect()
    const header = document.querySelector(".settings-v2-tab-header")?.getBoundingClientRect()
    const title = document.querySelector(".settings-v2-tab-title")?.getBoundingClientRect()
    const body = document.querySelector(".settings-v2-tab-body")?.getBoundingClientRect()
    const right = document.querySelector(".settings-v2-panel")?.getBoundingClientRect().right
    const rect = (r) => (r ? { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null)
    return {
      panel: rect(panel),
      header: rect(header),
      title: rect(title),
      body: rect(body),
      bodyPadTop: header && body ? Math.round(body.top - header.bottom) : null,
      titleLeft: title && panel ? Math.round(title.left - panel.left) : null,
      bodyLeft: body && panel ? Math.round(body.left - panel.left) : null,
      bodyRight: body && right ? Math.round(right - body.right) : null,
      hasHeader: !!header,
    }
  })
  rows.push({ label: s.label, ...m })
}

const base = rows.find((r) => r.label === "General")
console.log("GENERAL ref:", JSON.stringify(base))
for (const r of rows) {
  console.log(
    `${r.label.padEnd(15)} header=${r.hasHeader ? "y" : "N"} titleLeft=${r.titleLeft} bodyLeft=${r.bodyLeft} bodyRight=${r.bodyRight} bodyGapTop=${r.bodyPadTop} bodyTop=${r.body?.t}`,
  )
}
await browser.close()
