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
  [...document.querySelectorAll('[data-action^="settings-nav-"]')].map((e) => ({
    action: e.getAttribute("data-action"),
    label: e.innerText.replace(/\s+/g, " ").trim(),
  })),
)
console.log("SECTIONS:", sections.map((s) => s.label).join(", "))

for (const s of sections) {
  const el = page.locator(`[data-action="${s.action}"]`).first()
  if (!(await el.count())) continue
  await el.click().catch(() => {})
  await wait(1500)
  const r = await page.evaluate(() => {
    const rail = document.querySelector(".settings-v2-rail")?.getBoundingClientRect()
    const panel = document.querySelector(".settings-v2-panel")?.getBoundingClientRect()
    const railRight = rail ? Math.round(rail.right) : 0
    const panelTop = panel ? Math.round(panel.top) : 0
    let minLeft = Infinity, minTop = Infinity, worstLeft = null, worstTop = null
    const scope = document.querySelector('[data-slot="tabs-v2-content"]')
    if (scope) {
      for (const el of scope.querySelectorAll("*")) {
        const b = el.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) continue
        if (b.left < minLeft) { minLeft = b.left; worstLeft = { cls: (el.className || "").toString().slice(0, 44), left: Math.round(b.left), top: Math.round(b.top), text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 30) } }
        if (b.top < minTop) { minTop = b.top; worstTop = { cls: (el.className || "").toString().slice(0, 44), left: Math.round(b.left), top: Math.round(b.top), text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 30) } }
      }
    }
    return { railRight, panelTop, minLeft: Math.round(minLeft), minTop: Math.round(minTop), worstLeft, worstTop }
  })
  const leftBad = r.minLeft < r.railRight - 1
  const topBad = r.minTop < r.panelTop - 1
  console.log(
    `${leftBad ? "LEFT!" : "ok   "} ${topBad ? "TOP!" : "ok  "} ${s.label.padEnd(16)} minLeft=${r.minLeft} railRight=${r.railRight} minTop=${r.minTop} panelTop=${r.panelTop}` +
      (leftBad ? `  <- ${JSON.stringify(r.worstLeft)}` : "") +
      (topBad ? `  ^ ${JSON.stringify(r.worstTop)}` : ""),
  )
}
await browser.close()
