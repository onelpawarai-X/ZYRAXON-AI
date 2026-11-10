// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Check the shape of every catalog entry.
 *
 *   bun run "MCP Hub/scripts/verify-catalog.mjs"
 *
 * The catalog is data, so a broken entry is a broken product and TypeScript cannot
 * catch most of it: a `kind` with no matching tier, an OAuth card with no URL, a local
 * card with no command, two apps sharing an id, a setup guide with an empty step. Every
 * one of those reaches the user as a card that does not work, and none of them fails a
 * typecheck. This runs the checks the types cannot express and exits non-zero on the
 * first broken entry.
 *
 * No network, no credentials, no subprocess — this only reads the catalog, so it is
 * safe to run anywhere and fast enough for every push.
 */

import { allSeedApps, browserApps, keyApps, localApps, openApps, tierOf } from "../catalog/seed.ts"

const errors = []
const fail = (id, message) => errors.push(`${id}: ${message}`)

const apps = allSeedApps()

// Ids are the handle for everything else — storage, guides, icons — so a duplicate
// silently makes two cards one.
const seen = new Map()
for (const app of apps) {
  if (seen.has(app.id)) fail(app.id, "duplicate id")
  seen.set(app.id, app)
}

const tierCount = { browser: 0, key: 0, open: 0, local: 0 }

for (const app of apps) {
  const tier = tierOf(app)
  tierCount[tier]++

  if (!app.name?.trim()) fail(app.id, "missing name")
  if (!app.description?.trim()) fail(app.id, "missing description")
  // The category list is derived from the entries themselves, so a card cannot point
  // at a category that does not exist — but an empty one still renders as a blank
  // filter chip, so it is rejected here.
  if (!app.category?.trim()) fail(app.id, "missing category")
  if (!/^#[0-9A-Fa-f]{6}$/.test(app.color)) fail(app.id, `color "${app.color}" is not a hex colour`)

  if (tier === "browser") {
    if (!app.url) fail(app.id, "browser app without a url")
    // A card that needs a client id has to say where to make one, or the user is stuck.
    if (app.kind === "oauth-client" && !app.consoleUrl) fail(app.id, "client-id app without a consoleUrl")
  }

  if (tier === "key" && !app.url) fail(app.id, "key app without a url")

  if (tier === "open" && !app.url) fail(app.id, "open app without a url")

  if (tier === "local") {
    if (app.command) {
      if (!app.command.command?.trim()) fail(app.id, "local command is empty")
      if (!Array.isArray(app.command.args)) fail(app.id, "local command args is not an array")
    }
    for (const entry of app.env ?? []) {
      if (!entry.key?.trim()) fail(app.id, "env entry without a key")
      if (!entry.label?.trim()) fail(app.id, `env ${entry.key} has no label`)
    }
  }

  // A card that explains itself must actually explain itself: a step that is empty or
  // a step that is only a URL leaves the reader with nothing to do.
  for (const step of app.steps ?? []) {
    if (!step.trim()) fail(app.id, "empty setup step")
  }
}

// The section arrays are what the Hub renders; a kind that lands in the wrong one shows
// the user the wrong instructions, so the split is asserted rather than assumed.
for (const app of browserApps) if (tierOf(app) !== "browser") fail(app.id, "in browserApps but not a browser app")
for (const app of keyApps) if (tierOf(app) !== "key") fail(app.id, "in keyApps but not a key app")
for (const app of openApps) if (tierOf(app) !== "open") fail(app.id, "in openApps but not an open app")
for (const app of localApps) if (tierOf(app) !== "local") fail(app.id, "in localApps but not a local app")

console.log(`MCP Hub catalog — ${apps.length} apps`)
console.log(`  browser ${tierCount.browser}  key ${tierCount.key}  open ${tierCount.open}  local ${tierCount.local}\n`)

if (errors.length) {
  for (const error of errors) console.log(`  FAIL ${error}`)
  console.log(`\n${errors.length} problem${errors.length === 1 ? "" : "s"}`)
  process.exit(1)
}

console.log("every entry is well formed")
