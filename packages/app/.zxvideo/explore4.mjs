import { chromium } from "@playwright/test"

const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(5000)

// ---- MCP panel ----
await page.getByText("MCP Connect", { exact: true }).first().click({ timeout: 8000 })
await page.waitForTimeout(3000)
await page.screenshot({ path: "/tmp/zx-mcp-open.png" })

// click a category
for (const cat of ["AI & Media", "Developer", "System"]) {
  const el = page.getByText(cat, { exact: true }).first()
  if (await el.count()) {
    await el.click().catch(() => {})
    await page.waitForTimeout(1500)
    console.log("clicked category", cat)
    break
  }
}
await page.screenshot({ path: "/tmp/zx-mcp-cat.png" })

// click first app card (a button/card that is not nav)
const cardButtons = page.locator('button, [role="button"]')
const n = await cardButtons.count()
console.log("card-ish buttons:", n)
// dump visible text of the panel body
const mcpText = await page.evaluate(() => document.body.innerText)
console.log("=== MCP TEXT (tail) ===\n", mcpText.slice(-1800))

// try Details
const details = page.getByText("Details", { exact: true }).first()
console.log("details count", await details.count())
if (await details.count()) {
  await details.click().catch((e) => console.log("details err", e.message))
  await page.waitForTimeout(2500)
  await page.screenshot({ path: "/tmp/zx-mcp-details.png" })
  const dtext = await page.evaluate(() => document.body.innerText)
  console.log("=== DETAILS TEXT ===\n", dtext.slice(-2200))
}

await page.keyboard.press("Escape")
await page.waitForTimeout(1000)

// ---- session side panel ----
await page.getByText("New session", { exact: true }).first().click({ timeout: 8000 })
await page.waitForTimeout(6000)
await page.screenshot({ path: "/tmp/zx-sess-panel.png" })
const sessText = await page.evaluate(() => document.body.innerText)
console.log("=== SESSION TEXT ===\n", sessText.slice(0, 1600))
const allBtns = await page.$$eval("button, [role=tab], [data-action]", (els) =>
  els.map((e) => ({ a: e.getAttribute("data-action"), t: (e.innerText || "").trim().slice(0, 40) })).filter((x) => x.a || x.t),
)
console.log("=== SESSION BUTTONS ===\n", JSON.stringify(allBtns.slice(0, 60), null, 0))

await browser.close()
