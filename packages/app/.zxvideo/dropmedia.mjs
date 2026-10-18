// Copyright (c) 2026 onelpawarai. All rights reserved.

import { chromium } from "@playwright/test"
const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
page.on("console", (m) => {
  const t = m.text()
  if (/error|fail|unsupported|too large|attach/i.test(t)) console.log("console:", t.slice(0, 160))
})
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(6000)

const dom = await page.evaluate(() => ({
  body: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
  editors: document.querySelectorAll('[contenteditable="true"]').length,
  attachments: document.querySelectorAll('[data-slot="prompt-attachments"]').length,
  dropTargets: document.querySelectorAll("[data-slot]").length,
}))
console.log("DOM:", JSON.stringify(dom))

// Open a fresh session so the composer exists.
await page.getByText("New session", { exact: true }).first().click().catch(() => {})
await page.waitForTimeout(5000)
const after = await page.evaluate(() => ({
  editors: document.querySelectorAll('[contenteditable="true"]').length,
  body: document.body.innerText.replace(/\s+/g, " ").slice(0, 200),
}))
console.log("AFTER NEW SESSION:", JSON.stringify(after))

// Drop a small fake mp4 and a fake mp3 onto the document, exercising the real
// composer attachment path (handleGlobalDrop -> addAttachments -> attachmentMime).
const result = await page.evaluate(async () => {
  const make = (name, type, bytes) => new File([new Uint8Array(bytes)], name, { type })
  const dt = new DataTransfer()
  // ftyp mp4 magic so the sniff resolves video/mp4 even without a reported type
  dt.items.add(make("clip.mp4", "", [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0, 0x6d, 0x70, 0x34, 0x32]))
  dt.items.add(make("tone.mp3", "", [0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]))
  const target = document.querySelector('[data-slot="prompt-attachments"]')?.parentElement ?? document
  target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }))
  await new Promise((r) => setTimeout(r, 1500))
  const strip = document.querySelector('[data-slot="prompt-attachments"]')
  const video = document.querySelector('[data-slot="prompt-attachments"] video')
  const audio = document.querySelector('[data-slot="prompt-attachments"] audio')
  return {
    stripPresent: !!strip,
    videoPlayer: !!video,
    audioPlayer: !!audio,
    stripText: strip?.innerText?.replace(/\s+/g, " ").slice(0, 120) ?? null,
  }
})
console.log(JSON.stringify(result, null, 2))
await page.screenshot({ path: "/workspace/project/ZYRAXON-AI/packages/app/.zxvideo/shots/drop.png" })
await browser.close()
