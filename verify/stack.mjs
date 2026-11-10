// Pause the frozen main thread via CDP and dump the JS call stack so the
// infinite loop shows itself by function name.
import { chromium } from "playwright-core"

const BASE = process.env.BASE ?? "http://127.0.0.1:12000"
const log = (...a) => console.log(...a)

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
})
const page = await (await browser.newContext()).newPage()
const cdp = await page.context().newCDPSession(page)
await cdp.send("Debugger.enable").catch(() => {})
await cdp.send("Profiler.enable").catch(() => {})

log("goto")
await page.goto(BASE, { waitUntil: "commit", timeout: 30000 })

// Let it spin, then pause and read the stack.
await page.waitForTimeout(20000)
log("pausing...")

let stack = null
cdp.on("Debugger.paused", (p) => {
  stack = {
    total: p.callFrames.length,
    frames: p.callFrames.slice(0, 40).map((f) => ({
      fn: f.functionName || "(anonymous)",
      url: (f.url || "").split("/").pop(),
      line: f.location.lineNumber + 1,
      col: f.location.columnNumber + 1,
      scriptId: f.location.scriptId,
    })),
    deepest: p.callFrames.slice(-12).map((f) => ({
      fn: f.functionName || "(anonymous)",
      url: (f.url || "").split("/").pop(),
      line: f.location.lineNumber + 1,
      col: f.location.columnNumber + 1,
    })),
  }
})
await cdp.send("Debugger.pause").catch((e) => log("pause err", String(e).split("\n")[0]))
await page.waitForTimeout(3000)

log("STACK:")
log(JSON.stringify(stack, null, 2))

await browser.close()
