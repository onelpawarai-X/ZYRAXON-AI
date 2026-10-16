import { chromium } from "@playwright/test"
const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
const wait = (ms) => page.waitForTimeout(ms)
const txt = () => page.evaluate(() => document.body.innerText)

await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await wait(6000)

// settings + show agent
await page.getByText("Settings", { exact: true }).first().click()
await wait(2500)
const sw = page.locator('[data-action="settings-show-custom-agents"] [data-component="switch"]').first()
console.log("show-agent switch count:", await sw.count())
await sw.click().catch((e) => console.log("sw err", e.message.slice(0, 60)))
await wait(800)
console.log("show agent checked:", await sw.getAttribute("aria-checked").catch(() => "?"))
await page.keyboard.press("Escape")
await wait(1500)

// session
await page.getByText("New session", { exact: true }).first().click()
await wait(6000)
const trigger = page.locator('button[title*="Choose agent"]').first()
console.log("agent trigger:", await trigger.count(), await trigger.innerText().catch(() => ""))
await trigger.click()
await wait(1800)
const menuText = await page.evaluate(() => {
  const m = document.querySelector('[role="menu"], [data-popper-placement], [data-component="menu"]')
  return m ? m.innerText : "(no menu)"
})
console.log("=== MODE MENU ===\n", menuText.slice(0, 700))
const items = await page.$$eval('[role="menuitemradio"]', (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()))
console.log("menu items:", JSON.stringify(items))
await page.keyboard.press("Escape")
await wait(1200)

// prompts
const box = page.locator('[contenteditable=true]').first()
for (const q of ["Who are you?", "Who made you?", "What can you do?"]) {
  await box.click()
  await box.type(q, { delay: 15 })
  await wait(600)
  await page.keyboard.press("Enter")
  console.log(`\n### asked: ${q}`)
  for (let i = 0; i < 30; i++) {
    await wait(2500)
    const t = await txt()
    const idx = t.lastIndexOf(q)
    const tail = t.slice(idx, idx + 1400).replace(/\n{2,}/g, "\n")
    if (tail.length > q.length + 200 && i >= 2) {
      console.log(tail.slice(0, 900))
      break
    }
  }
}
await browser.close()
