import { chromium } from "@playwright/test"
const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(6000)

// settings opened?
console.log("Settings button:", await page.getByText("Settings", { exact: true }).count())
await page.getByText("Settings", { exact: true }).first().click()
await page.waitForTimeout(3000)
console.log("prompt-agent-control has: appearance/data-storage text present?")
const secText = await page.evaluate(() => document.body.innerText)
console.log("has 'Appearance':", secText.includes("Appearance"), "| has 'Data & storage':", secText.includes("Data & storage"))
const switches = await page.locator('[data-component="switch"]').count()
console.log("switch components visible:", switches)
await page.keyboard.press("Escape")
await page.waitForTimeout(1500)

// session
await page.getByText("New session", { exact: true }).first().click()
await page.waitForTimeout(6000)

for (const sel of [
  '[data-action="prompt-agent"]',
  '[data-component="prompt-agent-control"]',
  '[data-action="prompt-model"]',
  '[data-component="prompt-model-control"]',
]) {
  console.log(sel, "=>", await page.locator(sel).count())
}
const ctrlText = await page.evaluate(() =>
  [...document.querySelectorAll('[data-component="prompt-agent-control"], [data-component="prompt-model-control"]')].map((e) => e.innerText.trim()),
)
console.log("control texts:", JSON.stringify(ctrlText))

// try keyboard cycle for agent (command keybind) - common: ctrl+.
for (const keys of ["Control+.", "Control+Shift+A", "Control+Alt+A"]) {
  await page.keyboard.press(keys).catch(() => {})
  await page.waitForTimeout(600)
}
const t2 = await page.evaluate(() => document.body.innerText)
console.log("after cycle, mentions Lock/ULTRA/PRO:", /LOCK|ULTRA|PRO|Free/.test(t2))

await browser.close()
