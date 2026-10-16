import { chromium } from "@playwright/test"
const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
const wait = (ms) => page.waitForTimeout(ms)
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await wait(6000)

const openSettings = async () => {
  await page.getByText("Settings", { exact: true }).first().click()
  await wait(2500)
}
const closed = async () => (await page.locator('[data-component="dialog-v2"]').count()) === 0

await openSettings()
console.log("opened dialog present:", !(await closed()))
await page.locator(".settings-v2-close").first().click()
await wait(1500)
console.log("closed after X click:", await closed())

// reopen and confirm one section renders and scrolls
await openSettings()
const panelScroll = await page.evaluate(() => {
  const p = document.querySelector(".settings-v2-panel")
  return p ? { scrollH: p.scrollHeight, clientH: p.clientHeight, canScroll: p.scrollHeight > p.clientHeight } : null
})
console.log("panel scroll:", JSON.stringify(panelScroll))
await browser.close()
