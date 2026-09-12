import { BrowserWindow, app } from "electron"
import { loadTasks, updateTask, type DailyTask } from "./daily-task-storage"

const CHECK_INTERVAL_MS = 30000 // Check every 30 seconds
const APP_OPEN_AHEAD_MS = 60000 // Open app 1 minute before task time

let schedulerInterval: ReturnType<typeof setInterval> | null = null
let logger: { info: (msg: string, data?: any) => void; warn: (msg: string, data?: any) => void }

function initLogger() {
  try {
    const { getLogger } = require("./log")
    logger = getLogger("DailyTaskScheduler")
  } catch {
    logger = {
      info: (msg: string, data?: any) => console.log(`[DailyTaskScheduler] ${msg}`, data || ""),
      warn: (msg: string, data?: any) => console.warn(`[DailyTaskScheduler] ${msg}`, data || ""),
    }
  }
}

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

function ensureAppReady(): void {
  const win = getMainWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

function shouldRunToday(task: DailyTask): boolean {
  const now = new Date()
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const currentDay = dayNames[now.getDay()]
  return task.days.includes(currentDay)
}

function parseTaskTime(taskTime: string): { hours: number; minutes: number } {
  const [hours, minutes] = taskTime.split(":").map(Number)
  return { hours: hours || 0, minutes: minutes || 0 }
}

function shouldTriggerNow(task: DailyTask): boolean {
  const now = new Date()
  const { hours, minutes } = parseTaskTime(task.time)
  // Trigger at the exact minute
  return now.getHours() === hours && now.getMinutes() === minutes
}

function shouldPreOpen(task: DailyTask): boolean {
  const now = new Date()
  const { hours, minutes } = parseTaskTime(task.time)
  // 1 minute before task time
  const taskTimeMs = (hours * 60 + minutes) * 60 * 1000
  const currentTimeMs = (now.getHours() * 60 + now.getMinutes()) * 60 * 1000
  const diff = taskTimeMs - currentTimeMs
  return diff > 0 && diff <= APP_OPEN_AHEAD_MS
}

function hasRunToday(task: DailyTask): boolean {
  if (!task.lastRun) return false
  const lastRun = new Date(task.lastRun)
  const now = new Date()
  return lastRun.toDateString() === now.toDateString()
}

async function activateAIForTask(task: DailyTask): Promise<void> {
  logger.info(`Activating AI for task: ${task.prompt}`)

  // Ensure main window is open and focused
  ensureAppReady()

  // Send task to renderer via IPC to create a new session with this prompt
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send("daily-task:activate", {
      taskId: task.id,
      prompt: task.prompt,
      time: task.time,
    })
    logger.info(`Sent activation signal to renderer for task: ${task.id}`)
  } else {
    logger.warn("No main window available to activate AI")
  }
}

function checkAndRunTasks(): void {
  const tasks = loadTasks()
  const now = new Date()

  for (const task of tasks) {
    if (!task.enabled) continue
    if (!shouldRunToday(task)) continue
    if (hasRunToday(task)) continue

    // Pre-open app 1 minute before
    if (shouldPreOpen(task)) {
      logger.info(`Pre-opening app for task: ${task.prompt}`)
      ensureAppReady()
    }

    // Trigger AI at exact time
    if (shouldTriggerNow(task)) {
      logger.info(`Triggering AI for task: ${task.prompt}`)
      updateTask(task.id, { status: "running" })
      activateAIForTask(task).then(() => {
        updateTask(task.id, {
          status: "completed",
          lastRun: now.toISOString(),
        })
      }).catch((error) => {
        logger.warn(`Failed to activate AI for task: ${task.id}`, error)
        updateTask(task.id, { status: "failed" })
      })
    }
  }
}

export function startScheduler(): void {
  if (schedulerInterval) return
  initLogger()
  logger.info("Starting daily task scheduler (30s interval)")
  schedulerInterval = setInterval(checkAndRunTasks, CHECK_INTERVAL_MS)
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    logger.info("Stopped daily task scheduler")
  }
}
