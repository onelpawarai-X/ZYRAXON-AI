// ZYRAXON probe: does the page ever settle? Collects console/network only,
// avoids evaluate() until the very end so a busy main thread cannot hang us.
import { chromium } from "playwright-core"

const BASE = process.env.BASE ?? "http://127.0.0.1:12000"
const WAIT = Number(process.env.WAIT ?? 180000)
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a)

const consoleErrors = []
const pageErrors = []
const failed = []

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
})
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
page.on("console", (msg) => {
  if (msg.type() === "error") {
    consoleErrors.push(msg.text())
    log("CONSOLE.ERROR", msg.text().slice(0, 300))
  }
})
page.on("pageerror", (err) => {
  pageErrors.push(String(err))
  log("PAGEERROR", String(err).slice(0, 300))
})
page.on("requestfailed", (req) => failed.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`))

log("goto")
await page.goto(BASE, { waitUntil: "commit", timeout: 30000 })
log("committed; waiting", WAIT, "ms")

const started = Date.now()
while (Date.now() - started < WAIT) {
  await page.waitForTimeout(10000)
  log(`elapsed=${Math.round((Date.now() - started) / 1000)}s errors=${consoleErrors.length} pageerr=${pageErrors.length} failed=${failed.length}`)
}

log("final evaluate")
const info = await page
  .evaluate(() => ({
    ready: document.readyState,
    childCount: document.body?.children.length ?? -1,
    text: (document.body?.innerText ?? "").slice(0, 800),
  }))
  .catch((e) => ({ evalError: String(e).split("\n")[0] }))
log("info", JSON.stringify(info))

await page.screenshot({ path: "/workspace/project/ZYRAXON-AI/verify/01-home.png", animations: "disabled" }).catch((e) => log("shot err", String(e).split("\n")[0]))
log("done")
await browser.close()
