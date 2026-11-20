// Copyright (c) 2026 onelpawarai. All rights reserved.

import { BrowserWindow } from "electron"
import { loadTasks, markTaskDelivered, markTaskFailed, type DailyTask } from "./daily-task-storage"

const CHECK_INTERVAL_MS = 30000 // Check every 30 seconds
const APP_OPEN_AHEAD_MS = 60000 // Surface the app 1 minute before task time

let schedulerInterval: ReturnType<typeof setInterval> | null = null
let logger: { info: (msg: string, data?: any) => void; warn: (msg: string, data?: any) => void } | undefined

function initLogger() {
  logger = {
    info: (msg: string, data?: any) => console.log(`[DailyTaskScheduler] ${msg}`, data || ""),
    warn: (msg: string, data?: any) => console.warn(`[DailyTaskScheduler] ${msg}`, data || ""),
  }
}

// The old code did require("./log") + getLogger("DailyTaskScheduler"). Neither exists:
// the module is ./logging and its getLogger() takes no scope and returns the shared
// electron-log instance. The require therefore always threw into the catch above and
// every scheduler diagnostic went to a console nobody captures - which is why main.log
// showed "Daily task scheduler started" (logged by index.ts through the real logger)
// but no scheduler output at all. Route through logging.write so runs are diagnosable.
function info(message: string, extra?: Record<string, unknown>) {
  if (logger) logger.info(message, extra)
  void import("./logging").then((m) => m.write("daily-task", message, extra)).catch(() => {})
}

function warn(message: string, extra?: Record<string, unknown>) {
  if (logger) logger.warn(message, extra)
  void import("./logging").then((m) => m.write("daily-task", message, extra, "warn")).catch(() => {})
}

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed())
  // The focused window is the one the user is actually looking at; getAllWindows()[0]
  // can be a helper window (Jarvis browser, cloud agent) that never renders the app.
  return BrowserWindow.getFocusedWindow() ?? windows.find((win) => win.isVisible()) ?? windows[0] ?? null
}

// Only focuses a window that already exists. It cannot start the app, so a task whose
// time passes while ZYRAXON is closed can only ever be a catch-up run on next launch.
function ensureAppReady(): boolean {
  const win = getMainWindow()
  if (!win) return false
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  return true
}

function shouldRunToday(task: DailyTask): boolean {
  const now = new Date()
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const currentDay = dayNames[now.getDay()]
  return task.days.includes(currentDay)
}

export function parseTaskTime(taskTime: string | undefined): { hours: number; minutes: number } | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(taskTime ?? "")
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return undefined
  return { hours, minutes }
}

function minutesSinceMidnight(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

// A task is due once its time has passed today and it has not run yet. Matching the
// exact minute (the old behaviour) meant a single missed poll, a sleeping machine or
// a task saved with no time at all silently skipped the whole day.
function isDue(task: DailyTask, now: Date): boolean {
  const parsed = parseTaskTime(task.time)
  if (!parsed) return false
  return minutesSinceMidnight(now) >= parsed.hours * 60 + parsed.minutes
}

function isDueSoon(task: DailyTask, now: Date): boolean {
  const parsed = parseTaskTime(task.time)
  if (!parsed) return false
  const diff = parsed.hours * 60 + parsed.minutes - minutesSinceMidnight(now)
  return diff > 0 && diff * 60_000 <= APP_OPEN_AHEAD_MS
}

function hasRunToday(task: DailyTask): boolean {
  if (!task.lastRun) return false
  const lastRun = new Date(task.lastRun)
  const now = new Date()
  return lastRun.toDateString() === now.toDateString()
}

function deliver(task: DailyTask): boolean {
  info("delivering daily task to renderer", { taskId: task.id, time: task.time, prompt: task.prompt })
  ensureAppReady()
  const win = getMainWindow()
  if (!win || win.isDestroyed()) {
    warn("no window available to deliver daily task", { taskId: task.id })
    return false
  }
  win.webContents.send("daily-task:activate", {
    taskId: task.id,
    prompt: task.prompt,
    time: task.time,
  })
  return true
}

function checkAndRunTasks(): void {
  const tasks = loadTasks()
  const now = new Date()

  for (const task of tasks) {
    if (!task.enabled) continue
    if (!shouldRunToday(task)) continue
    if (hasRunToday(task)) continue

    // Surface the app shortly before the task time. This only focuses an already
    // running window - there is no OS-level launch registration, so it is a no-op
    // when the app is closed.
    if (isDueSoon(task, now)) {
      info("surfacing app for upcoming daily task", { taskId: task.id, time: task.time })
      ensureAppReady()
    }

    if (!parseTaskTime(task.time)) {
      warn("skipping daily task with no usable time", { taskId: task.id, time: task.time })
      continue
    }

    if (!isDue(task, now)) continue

    // Stamp lastRun before delivering so a task that is dropped downstream cannot
    // re-fire on every 30s tick for the rest of the day.
    markTaskDelivered(task.id, now)
    if (!deliver(task)) markTaskFailed(task.id, "no renderer window available")
  }
}

export function startScheduler(): void {
  if (schedulerInterval) return
  initLogger()
  info("starting daily task scheduler", { intervalMs: CHECK_INTERVAL_MS })
  schedulerInterval = setInterval(checkAndRunTasks, CHECK_INTERVAL_MS)
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    info("stopped daily task scheduler")
  }
}
