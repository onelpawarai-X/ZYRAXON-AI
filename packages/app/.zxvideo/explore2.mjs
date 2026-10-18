// Copyright (c) 2026 onelpawarai. All rights reserved.

import { chromium } from "@playwright/test"

const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(6000)

async function shot(name) {
  await page.screenshot({ path: `/tmp/zx-${name}.png` })
}
async function dump(label) {
  const btns = await page.$$eval("button", (els) =>
    els.map((e) => (e.innerText || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ")).filter(Boolean),
  )
  const uniq = [...new Set(btns)]
  console.log(`\n=== ${label} (${uniq.length}) ===`)
  console.log(uniq.slice(0, 90).join(" | "))
  await shot(label)
}

// MCP Connect
try {
  await page.getByText("MCP Connect", { exact: true }).first().click({ timeout: 5000 })
  await page.waitForTimeout(3500)
  await dump("mcp")
} catch (e) { console.log("mcp err", e.message) }

// close via Escape
await page.keyboard.press("Escape")
await page.waitForTimeout(1000)

// New session
try {
  await page.getByText("New session", { exact: true }).first().click({ timeout: 5000 })
  await page.waitForTimeout(5000)
  await dump("session")
} catch (e) { console.log("session err", e.message) }

// look for mode selector / model
const inputs = await page.$$eval("textarea, input[contenteditable], [contenteditable=true]", (els) =>
  els.map((e) => ({ tag: e.tagName, ph: e.getAttribute("placeholder"), cls: (e.className || "").toString().slice(0, 60) })),
)
console.log("\nINPUTS:", JSON.stringify(inputs, null, 1).slice(0, 1500))

await browser.close()
