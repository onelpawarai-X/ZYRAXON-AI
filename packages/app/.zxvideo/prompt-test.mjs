// Copyright (c) 2026 onelpawarai. All rights reserved.

import { chromium } from "@playwright/test"

const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
page.on("console", (m) => { if (m.type() === "error") console.log("ERR:", m.text().slice(0, 160)) })
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(5000)

await page.getByText("New session", { exact: true }).first().click({ timeout: 8000 })
await page.waitForTimeout(5000)

// type into the contenteditable prompt box
const box = page.locator('[contenteditable=true]').first()
await box.click()
await box.type("Who are you?", { delay: 30 })
await page.waitForTimeout(800)
await page.screenshot({ path: "/tmp/zx-typed.png" })
await page.keyboard.press("Enter")
console.log("sent, waiting for response...")

for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(2000)
  const txt = await page.evaluate(() => document.body.innerText)
  if (/ZYRAXON|I am|assistant|error|failed|unauthor/i.test(txt) && txt.length > 0) {
    // print progress sparingly
  }
  const hasStop = txt.includes("Stop") || txt.includes("Cancel")
  const marker = txt.match(/(Who are you\?[\s\S]{0,900})/)
  if (marker && marker[1].length > 80) {
    console.log(`\n--- t=${i * 2}s ---\n`, marker[1])
    if (i > 4) break
  }
  if (hasStop) console.log("still streaming t=", i * 2)
}
await page.screenshot({ path: "/tmp/zx-response.png" })
const final = await page.evaluate(() => document.body.innerText)
console.log("\n=== BOTTOM 1200 CHARS ===\n", final.slice(-1200))
await browser.close()
