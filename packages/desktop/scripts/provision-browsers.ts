#!/usr/bin/env bun
// Copyright (c) 2026 onelpawarai. All rights reserved.
//
// Provisions the Playwright Chromium build the bundled browser server drives into
// resources/jarvis-browser/browsers, so a packaged app can browse offline.
//
// The browsers are per-platform binaries (~650MB each) and cannot be committed,
// so every build downloads the one matching the runner it packages on. They are
// deliberately not the system Chrome: `--browser chrome` resolves to a Google
// Chrome install that most Linux and many macOS/Windows machines do not have, and
// the server then fails every tool with "Chromium distribution 'chrome' is not
// found". Chromium ships with the app instead.

import { $ } from "bun"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SOURCE = fileURLToPath(import.meta.url)
const JARVIS_DIR = path.resolve(path.dirname(SOURCE), "../resources/jarvis-browser")
const BROWSERS_DIR = path.join(JARVIS_DIR, "browsers")
const CLI = path.join(JARVIS_DIR, "node_modules", "playwright-core", "cli.js")

if (!fs.existsSync(CLI)) {
  console.error(`[provision-browsers] playwright-core CLI not found at ${CLI}`)
  console.error("[provision-browsers] run `bun install` in the repo root first")
  process.exit(1)
}

// The host must point playwright at the bundled directory for the download to
// land beside the app rather than in the user's cache, which is not packaged.
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS_DIR }

function chromiumPresent(): boolean {
  if (!fs.existsSync(BROWSERS_DIR)) return false
  return fs.readdirSync(BROWSERS_DIR).some((entry) => entry.startsWith("chromium-"))
}

if (chromiumPresent() && process.env.ZYRAXON_FORCE_BROWSER_DOWNLOAD !== "1") {
  console.log(`[provision-browsers] chromium already present in ${BROWSERS_DIR}`)
} else {
  console.log(`[provision-browsers] downloading chromium into ${BROWSERS_DIR} ...`)
  await $`node ${CLI} install chromium`.env(env)
}

if (!chromiumPresent()) {
  console.error(`[provision-browsers] chromium missing after install in ${BROWSERS_DIR}`)
  process.exit(1)
}

console.log(`[provision-browsers] chromium ready for ${process.platform}/${process.arch}`)
