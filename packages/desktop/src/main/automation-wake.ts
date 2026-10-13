// Copyright (c) 2026 onelpawarai. All rights reserved.

import { app } from "electron"

import { write } from "./logging"

/**
 * The daemon appends this flag when it launches the app because automation events were
 * waiting. It is the only signal that separates "opened by a webhook" from "opened by the
 * person", and it is what later lets the app close itself again.
 */
export const AUTOMATION_WAKE_FLAG = "--automation-wake"
const POLL_INTERVAL_MS = 15_000
const MAX_WAIT_MS = 10 * 60_000

let armed = false
let timer: ReturnType<typeof setInterval> | null = null
let startedAt = 0

/** True when this launch came from the task daemon rather than the person. */
export function isAutomationWake(argv: readonly string[] = process.argv): boolean {
  return argv.includes(AUTOMATION_WAKE_FLAG)
}

type Status = { pending?: number }

async function fetchPending(url: string, password: string): Promise<number | null> {
  try {
    const auth = Buffer.from(`zyraxon:${password}`).toString("base64")
    const response = await fetch(`${url}/automation/status`, { headers: { authorization: `Basic ${auth}` } })
    if (!response.ok) return null
    const body = (await response.json()) as Status
    return typeof body.pending === "number" ? body.pending : null
  } catch {
    // A backend that is not answering yet is not a failure; the next poll retries.
    return null
  }
}

/**
 * Once the app is idle with an empty automation backlog, close it again — but only when
 * automation opened it. A person who launched the app is never interrupted, and a turn
 * that is still working keeps `pending` above zero, so the app stays up until the agent is
 * actually done.
 */
function watchUntilDrained(url: string, password: string) {
  timer = setInterval(() => {
    void (async () => {
      const pending = await fetchPending(url, password)
      if (pending === null || pending > 0) {
        if (Date.now() - startedAt > MAX_WAIT_MS) {
          write("automation-wake", "backlog never drained; leaving the app open", undefined, "warn")
          stopAutomationClose()
        }
        return
      }
      write("automation-wake", "automation backlog drained; closing the app")
      stopAutomationClose()
      app.quit()
    })()
  }, POLL_INTERVAL_MS)
  ;(timer as { unref?: () => void }).unref?.()
}

/** Arm the self-close watcher. No-op unless this launch came from the daemon. */
export function armAutomationClose(url: string, password: string, argv: readonly string[] = process.argv) {
  if (armed || !isAutomationWake(argv)) return
  armed = true
  startedAt = Date.now()
  write("automation-wake", "armed self-close watcher", { url })
  watchUntilDrained(url, password)
}

export function stopAutomationClose() {
  if (timer) clearInterval(timer)
  timer = null
  armed = false
}
