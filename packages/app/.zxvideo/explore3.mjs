// Copyright (c) 2026 onelpawarai. All rights reserved.

import { chromium } from "@playwright/test"

const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(5000)

await page.getByText("New session", { exact: true }).first().click({ timeout: 8000 })
await page.waitForTimeout(6000)
await page.screenshot({ path: "/tmp/zx-sess1.png" })

// open the model selector: the button showing current model / provider
const modelBtn = page.locator("button").filter({ hasText: /Pickle|openhands|Select|provider/i }).first()
console.log("modelBtn count", await modelBtn.count())
if (await modelBtn.count()) {
  await modelBtn.click({ timeout: 5000 }).catch((e) => console.log("click model err", e.message))
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "/tmp/zx-models.png" })
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 2500))
  console.log("=== MODELS DIALOG TEXT ===\n", txt)
}
await browser.close()
