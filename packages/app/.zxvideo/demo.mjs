// ZYRAXON demo video — scripted Playwright tour.
// Records 1920x1080 webm; the in-app recorder UI is hidden so it never reaches the video.
import { chromium } from "@playwright/test"

const APP = process.env.APP_URL ?? "http://127.0.0.1:12000/"
const OUT = process.env.VIDEO_DIR ?? "/workspace/tools/video/raw"

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1", "--hide-scrollbars"],
})
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
})
const page = await ctx.newPage()

// Never show the in-app recorder controls or the debug status line.
async function hideRecorder() {
  await page
    .addStyleTag({
      content: `#__zx_rec, #zx-status { display: none !important; visibility: hidden !important; }`,
    })
    .catch(() => {})
}
page.on("pageerror", (e) => console.log("PAGEERR:", String(e).slice(0, 140)))
await page.addInitScript(() => {
  const s = document.createElement("style")
  s.textContent = "#__zx_rec,#zx-status{display:none!important}"
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s))
  ;(document.head || document.documentElement).appendChild(s)
})

const wait = (ms) => page.waitForTimeout(ms)
async function clickText(text, opts = {}) {
  const el = page.getByText(text, { exact: opts.exact ?? true }).first()
  if (await el.count()) {
    await el.click({ timeout: opts.timeout ?? 5000 }).catch((e) => console.log(`clickText ${text}:`, e.message.slice(0, 80)))
    return true
  }
  console.log(`clickText ${text}: not found`)
  return false
}
async function clickAction(action) {
  const el = page.locator(`[data-action="${action}"]`).first()
  if (await el.count()) {
    await el.click({ timeout: 4000 }).catch((e) => console.log(`clickAction ${action}:`, e.message.slice(0, 80)))
    return true
  }
  console.log(`clickAction ${action}: not found`)
  return false
}
async function hoverText(text) {
  const el = page.getByText(text, { exact: true }).first()
  if (await el.count()) await el.hover().catch(() => {})
}

console.log("== opening app ==")
await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(7000)
await hideRecorder()
await wait(1200)

// ---------- 1. HOME ----------
console.log("== home ==")
await hoverText("Marketplace")
await wait(900)
await hoverText("Ecosystem")
await wait(900)
await page.mouse.move(960, 500)
await page.mouse.wheel(0, 900)
await wait(1600)
await page.mouse.wheel(0, -900)
await wait(1200)

// ---------- 2. SETTINGS ----------
console.log("== settings ==")
await clickText("Settings")
await wait(3000)
await page.screenshot({ path: "/tmp/v-settings.png" })

// General: enable "Show agent" so the mode selector exists, and exercise toggles.
await wait(800)
await clickAction("settings-show-custom-agents")
await wait(900)
for (const action of [
  "settings-show-file-tree",
  "settings-show-search",
  "settings-show-status",
  "settings-feed-shell-tool-parts-expanded",
]) {
  await clickAction(action)
  await wait(600)
}
// flip two back so the on/off is visibly demonstrated
await clickAction("settings-show-search")
await wait(600)
await clickAction("settings-show-file-tree")
await wait(800)
// scroll through the General panel
await page.mouse.move(960, 620)
await page.mouse.wheel(0, 500)
await wait(1200)
await page.mouse.wheel(0, -500)
await wait(800)

const sections = [
  "Language", "Appearance", "Notifications", "Shortcuts",
  "Servers", "Providers", "Models", "Local", "Agents", "Extensions",
  "Data & storage", "Security", "Advanced", "Subscription", "About",
]
for (const s of sections) {
  if (!(await clickText(s))) continue
  await wait(1400)
}
await page.screenshot({ path: "/tmp/v-settings-about.png" })
await wait(1000)
await page.keyboard.press("Escape").catch(() => {})
await wait(1500)

// ---------- 3. MCP CONNECT ----------
console.log("== mcp ==")
await clickText("MCP Connect")
await wait(3200)
await page.screenshot({ path: "/tmp/v-mcp.png" })
for (const cat of ["AI & Media", "Developer", "System", "Database"]) {
  await clickText(cat)
  await wait(1400)
}
await page.mouse.move(960, 620)
await page.mouse.wheel(0, 700)
await wait(1500)
await page.mouse.wheel(0, -700)
await wait(1000)
// open details of the first app card
await wait(600)
const details = page.getByText("Details", { exact: true }).first()
if (await details.count()) {
  await details.click().catch((e) => console.log("details:", e.message.slice(0, 80)))
  await wait(3000)
  await page.screenshot({ path: "/tmp/v-mcp-details.png" })
  await wait(2200)
  await page.keyboard.press("Escape").catch(() => {})
  await wait(1200)
}
await page.keyboard.press("Escape").catch(() => {})
await wait(1500)

// ---------- 4. NEW SESSION + MODEL / MODE ----------
console.log("== session ==")
await clickText("New session")
await wait(6000)
await page.screenshot({ path: "/tmp/v-session.png" })

// model selector -> free catalog
await clickAction("prompt-model")
await wait(2500)
await page.screenshot({ path: "/tmp/v-models.png" })
await page.mouse.move(960, 700)
await page.mouse.wheel(0, 500)
await wait(1800)
await page.screenshot({ path: "/tmp/v-models2.png" })
await page.keyboard.press("Escape").catch(() => {})
await wait(1200)

// agent mode selector -> show the mode list (free + locked), then pick Build
const agentTrigger = page.locator('button[title*="Choose agent"]').first()
console.log("agent trigger count:", await agentTrigger.count())
if (await agentTrigger.count()) {
  await agentTrigger.click().catch((e) => console.log("agent:", e.message.slice(0, 80)))
  await wait(2200)
  await page.screenshot({ path: "/tmp/v-modes.png" })
  // hover the locked entries so the LOCK badges are visible on camera
  for (const m of ["Beast", "PRO", "APEX PREDATOR", "DARK EMPEROR", "PRO BUILDER"]) {
    const el = page.getByRole("menuitemradio", { name: new RegExp(m, "i") }).first()
    if (await el.count()) await el.hover().catch(() => {})
    await wait(700)
  }
  await page.screenshot({ path: "/tmp/v-modes-locked.png" })
  await wait(1000)
  // select Build
  const buildItem = page.getByRole("menuitemradio", { name: /^Build$/i }).first()
  if (await buildItem.count()) {
    await buildItem.click().catch((e) => console.log("build select:", e.message.slice(0, 80)))
  } else {
    await clickText("Build")
  }
  await wait(1500)
} else {
  console.log("agent selector not present")
}

// ---------- 5. ASK THE AI ----------
console.log("== prompts ==")
const box = page.locator('[contenteditable=true]').first()
for (const q of ["Who are you?", "Who made you?", "What can you do?"]) {
  await box.click().catch(() => {})
  await box.type(q, { delay: 18 })
  await wait(900)
  await page.keyboard.press("Enter")
  await wait(7000)
  await page.screenshot({ path: `/tmp/v-q-${q.replace(/[^a-z]/gi, "")}.png` })
  await page.mouse.wheel(0, 400)
  await wait(1500)
}

// ---------- 6. COMMAND PALETTE ----------
console.log("== palette ==")
await page.keyboard.press("Control+k").catch(() => {})
await wait(2200)
await page.screenshot({ path: "/tmp/v-palette.png" })
await wait(1800)
await page.keyboard.press("Escape").catch(() => {})
await wait(2500)

console.log("== done ==")
await ctx.close()
await browser.close()
console.log("VIDEO:", await page.video()?.path().catch(() => "n/a"))
