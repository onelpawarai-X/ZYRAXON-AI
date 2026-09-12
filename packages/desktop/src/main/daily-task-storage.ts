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

export function loadTasks(): DailyTask[] {
  try {
    ensureDir()
    if (fs.existsSync(TASKS_FILE)) {
      const data = fs.readFileSync(TASKS_FILE, "utf-8")
      return JSON.parse(data).tasks || []
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

export function getDueTasks(): DailyTask[] {
  const now = new Date()
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const currentDay = dayNames[now.getDay()]
  const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`

  return loadTasks().filter((task) => {
    if (!task.enabled) return false
    if (!task.days.includes(currentDay)) return false
    if (task.time !== currentHHMM) return false
    if (task.lastRun) {
      const lastRun = new Date(task.lastRun)
      if (lastRun.toDateString() === now.toDateString()) return false
    }
    return true
  })
}
