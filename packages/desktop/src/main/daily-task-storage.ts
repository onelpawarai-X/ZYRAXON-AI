// Copyright (c) 2026 onelpawarai. All rights reserved.

import { app } from "electron"
import path from "path"
import fs from "fs"

export interface DailyTask {
  id: string
  prompt: string
  time: string // "HH:MM" format
  days: string[] // ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  enabled: boolean
  createdAt: string
  lastRun?: string
  status: "idle" | "running" | "completed" | "failed"
}

const TASKS_DIR = path.join(app.getPath("userData"), "daily-tasks")
const TASKS_FILE = path.join(TASKS_DIR, "tasks.json")

function ensureDir(): void {
  if (!fs.existsSync(TASKS_DIR)) {
    fs.mkdirSync(TASKS_DIR, { recursive: true })
  }
}

const DAY_NAMES = new Set(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/

function isValidTime(time: unknown): time is string {
  return typeof time === "string" && TIME_PATTERN.test(time)
}

// The renderer used to write whatever the <input type="time"> last reported, which is
// "" as soon as the field is touched and left incomplete. A record with an empty time
// used to be coerced to midnight by the scheduler's parser, so it could only ever fire
// at 00:00 - i.e. never. Normalise on the way in so an unusable record is recognisable
// instead of silently meaning midnight.
function normalize(task: Partial<DailyTask>): DailyTask {
  return {
    id: String(task.id ?? ""),
    prompt: String(task.prompt ?? ""),
    time: isValidTime(task.time) ? task.time : "",
    days: Array.isArray(task.days) ? task.days.filter((day) => DAY_NAMES.has(day)) : [],
    enabled: task.enabled !== false,
    createdAt: String(task.createdAt ?? new Date().toISOString()),
    lastRun: task.lastRun ? String(task.lastRun) : undefined,
    status: task.status ?? "idle",
  }
}

export function loadTasks(): DailyTask[] {
  try {
    ensureDir()
    if (fs.existsSync(TASKS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"))
      return (Array.isArray(data?.tasks) ? data.tasks : []).map(normalize)
    }
  } catch (error) {
    console.error("[DailyTaskStorage] Failed to load tasks:", error)
  }
  return []
}

export function saveTasks(tasks: DailyTask[]): void {
  try {
    ensureDir()
    fs.writeFileSync(TASKS_FILE, JSON.stringify({ tasks }, null, 2), "utf-8")
  } catch (error) {
    console.error("[DailyTaskStorage] Failed to save tasks:", error)
  }
}

export function addTask(task: Omit<DailyTask, "id" | "createdAt" | "status">): DailyTask {
  const tasks = loadTasks()
  const newTask: DailyTask = {
    ...task,
    id: `dt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: "idle",
  }
  tasks.push(newTask)
  saveTasks(tasks)
  return newTask
}

export function removeTask(id: string): boolean {
  const tasks = loadTasks()
  const filtered = tasks.filter((t) => t.id !== id)
  if (filtered.length === tasks.length) return false
  saveTasks(filtered)
  return true
}

export function updateTask(id: string, updates: Partial<DailyTask>): DailyTask | null {
  const tasks = loadTasks()
  const index = tasks.findIndex((t) => t.id === id)
  if (index === -1) return null
  tasks[index] = { ...tasks[index], ...updates }
  saveTasks(tasks)
  return tasks[index]
}

export function getTaskById(id: string): DailyTask | null {
  const tasks = loadTasks()
  return tasks.find((t) => t.id === id) || null
}

// Stamp lastRun as the task leaves the main process so a delivery that never reaches
// the renderer cannot re-fire on every poll. Status stays "running" - the renderer
// acknowledging it would need a new IPC handler and main/ipc.ts is owned elsewhere.
// The old code set "completed" the moment webContents.send returned, which recorded
// success for prompts the renderer then dropped.
export function markTaskDelivered(id: string, at: Date): DailyTask | null {
  return updateTask(id, { status: "running", lastRun: at.toISOString() })
}

export function markTaskFailed(id: string, reason: string): DailyTask | null {
  console.error(`[DailyTaskStorage] Daily task ${id} failed: ${reason}`)
  return updateTask(id, { status: "failed" })
}
