// ZYRAXON verification harness — step-logging probe of the built app.
import { chromium } from "playwright-core"

const BASE = process.env.BASE ?? "http://127.0.0.1:12000"
const OUT = process.env.OUT ?? "/workspace/project/ZYRAXON-AI/verify"
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a)

const consoleErrors = []
const pageErrors = []
const failedRequests = []

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text())
})
page.on("pageerror", (err) => pageErrors.push(String(err)))
page.on("requestfailed", (req) => failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`))

log("goto")
await page.goto(BASE, { waitUntil: "commit", timeout: 30000 })
log("committed")

for (let i = 1; i <= 10; i++) {
  await page.waitForTimeout(5000)
  const info = await page
    .evaluate(() => ({
      ready: document.readyState,
      rootChildren: document.body?.children.length ?? -1,
      text: (document.body?.innerText ?? "").slice(0, 200),
      hasHero: !!document.querySelector('[data-action="home-hero-search"]'),
      hasSidebar: !!document.querySelector('[data-component="sidebar"], [data-component="sidebar-shell"]'),
    }))
    .catch((e) => ({ evalError: String(e).split("\n")[0] }))
  log(`t=${i * 5}s`, JSON.stringify(info))
  if (info.hasHero) break
}

log("screenshot")
await page.screenshot({ path: `${OUT}/01-home-loaded.png`, animations: "disabled" }).catch((e) => log("shot err", String(e).split("\n")[0]))
log("done")

console.log(
  JSON.stringify(
    {
      title: await page.title(),
      url: page.url(),
      consoleErrors: consoleErrors.slice(0, 40),
      pageErrors: pageErrors.slice(0, 40),
      failedRequests: failedRequests.slice(0, 40),
    },
    null,
    2,
  ),
)

await browser.close()
