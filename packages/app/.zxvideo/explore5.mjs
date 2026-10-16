import { chromium } from "@playwright/test"

const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(5000)

await page.getByText("New session", { exact: true }).first().click({ timeout: 8000 })
await page.waitForTimeout(6000)

// List tabs / side panel toggles
const tabs = await page.$$eval('[role="tab"], button', (els) =>
  els
    .map((e) => ({ t: (e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 30), a: e.getAttribute("data-action"), c: e.getAttribute("data-component") }))
    .filter((x) => x.t || x.a || x.c),
)
console.log("=== TABS/BUTTONS ===")
console.log(JSON.stringify(tabs.slice(0, 70), null, 0))

// find Review
for (const name of ["Review", "Files", "Terminal", "Preview"]) {
  const el = page.getByText(name, { exact: true }).first()
  const c = await el.count()
  console.log(name, "count:", c)
}

// open review if present
const review = page.getByText("Review", { exact: true }).first()
if (await review.count()) {
  await review.click().catch((e) => console.log("review click err", e.message))
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "/tmp/zx-review.png" })
  const t = await page.evaluate(() => document.body.innerText)
  console.log("=== REVIEW TEXT ===\n", t.slice(-1800))
}

await browser.close()
