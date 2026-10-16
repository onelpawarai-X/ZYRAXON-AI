import { chromium } from "@playwright/test"

const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
})
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
})
const page = await ctx.newPage()
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE_ERR:", m.text().slice(0, 200))
})
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(6000)
console.log("TITLE:", await page.title())

async function dump(label) {
  const btns = await page.$$eval("button", (els) =>
    els
      .map((e) => (e.innerText || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " "))
      .filter(Boolean),
  )
  const uniq = [...new Set(btns)]
  console.log(`\n=== ${label} buttons (${uniq.length}) ===`)
  console.log(uniq.slice(0, 80).join(" | "))
  await page.screenshot({ path: `/tmp/explore-${label}.png`, fullPage: false })
}

await dump("01-home")

// try to open settings
const settingsCandidates = ["Settings", "সেটিংস", "সেটিং"]
for (const c of settingsCandidates) {
  const el = page.getByText(c, { exact: true }).first()
  if (await el.count()) {
    try {
      await el.click({ timeout: 3000 })
      await page.waitForTimeout(2500)
      console.log(`clicked settings via text="${c}"`)
      break
    } catch {}
  }
}
await dump("02-settings")

await browser.close()
