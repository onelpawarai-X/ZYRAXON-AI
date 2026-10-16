import { chromium } from "@playwright/test"
const base = process.env.APP_URL ?? "http://127.0.0.1:12000"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage()
const url = `${base}/recordings/ZYRAXON-v19.0.6-demo.mp4`
const res = await page.goto(url, { waitUntil: "load", timeout: 60000 })
console.log("status:", res.status(), "type:", res.headers()["content-type"])
await page.waitForTimeout(1500)
const info = await page.evaluate(async () => {
  const v = document.createElement("video")
  v.src = location.href
  v.muted = true
  document.body.innerHTML = ""
  document.body.appendChild(v)
  await new Promise((r) => { v.onloadedmetadata = r; setTimeout(r, 8000) })
  try { await v.play() } catch (e) {}
  await new Promise((r) => setTimeout(r, 2500))
  return { duration: v.duration, w: v.videoWidth, h: v.videoHeight, current: v.currentTime, readyState: v.readyState, err: v.error && v.error.code }
})
console.log("PLAYBACK:", JSON.stringify(info))
// also the list page
const l = await page.goto(`${base}/recordings`, { waitUntil: "domcontentloaded" })
console.log("list status:", l.status())
console.log("list text:", (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 300))
await browser.close()
