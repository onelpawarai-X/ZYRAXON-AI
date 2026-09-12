import { Component, createSignal, For, onMount, Show } from "solid-js"
import { Button } from "@zyraxon-ai/ui/button"
import { Icon } from "@zyraxon-ai/ui/icon"
import { IconButton } from "@zyraxon-ai/ui/icon-button"
import { showToast } from "@/utils/toast"

interface DailyTask {
  id: string
  prompt: string
  time: string
  days: string[]
  enabled: boolean
  createdAt?: string
  lastRun?: string
  status?: string
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function DailyTasksPanel() {
  const [tasks, setTasks] = createSignal<DailyTask[]>([])
  const [isAdding, setIsAdding] = createSignal(false)
  const [newPrompt, setNewPrompt] = createSignal("")
  const [newTime, setNewTime] = createSignal("09:00")
  const [newDays, setNewDays] = createSignal<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"])

  onMount(() => {
    loadTasks()
    // Listen for refresh events
    const handler = () => loadTasks()
    window.addEventListener("daily-tasks-refresh", handler)
    return () => window.removeEventListener("daily-tasks-refresh", handler)
  })

  const loadTasks = async () => {
    try {
      const api = (window as any).api
      if (api?.dailyTasksGet) {
        const result = await api.dailyTasksGet()
        setTasks(result || [])
      }
    } catch (error) {
      console.error("[DailyTasks] Failed to load:", error)
    }
  }

  const saveTasks = async (newTasks: DailyTask[]) => {
    try {
      const api = (window as any).api
      if (api?.dailyTasksSave) {
        await api.dailyTasksSave(newTasks)
        setTasks(newTasks)
      }
    } catch (error) {
      console.error("[DailyTasks] Failed to save:", error)
    }
  }

  const addTask = async () => {
    const prompt = newPrompt().trim()
    if (!prompt) {
      showToast({ variant: "error", title: "Please enter a prompt" })
      return
    }

    const task: DailyTask = {
      id: `dt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      time: newTime(),
      days: newDays(),
      enabled: true,
      createdAt: new Date().toISOString(),
    }

    const newTasks = [...tasks(), task]
    await saveTasks(newTasks)

    // Reset form
    setNewPrompt("")
    setNewTime("09:00")
    setNewDays(["Mon", "Tue", "Wed", "Thu", "Fri"])
    setIsAdding(false)

    showToast({ variant: "success", title: "Daily task added!" })
  }

  const toggleTask = async (id: string) => {
    const newTasks = tasks().map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    await saveTasks(newTasks)
  }

  const deleteTask = async (id: string) => {
    const newTasks = tasks().filter((t) => t.id !== id)
    await saveTasks(newTasks)
    showToast({ variant: "success", title: "Task deleted" })
  }

  const toggleDay = (day: string) => {
    const current = newDays()
    if (current.includes(day)) {
      setNewDays(current.filter((d) => d !== day))
    } else {
      setNewDays([...current, day])
    }
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Header with plus icon */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-border">
        <span class="text-13-medium text-text-strong">Daily Tasks</span>
        <IconButton
          icon="plus"
          variant="ghost"
          size="small"
          onClick={() => setIsAdding(!isAdding())}
          aria-label="Add daily task"
        />
      </div>

      {/* Add task form */}
      <Show when={isAdding()}>
        <div class="px-3 py-3 border-b border-border bg-surface">
          <div class="space-y-2">
            {/* Prompt input */}
            <textarea
              value={newPrompt()}
              onInput={(e) => setNewPrompt(e.currentTarget.value)}
              placeholder="What should AI do? (e.g., Open Chrome and check emails)"
              class="w-full px-2 py-1.5 text-13-regular text-text-strong bg-background rounded border border-border focus:outline-none focus:border-border-active resize-none"
              rows={3}
            />

            {/* Time picker */}
            <div class="flex items-center gap-2">
              <Icon name="clock" size="small" class="text-icon-weak" />
              <input
                type="time"
                value={newTime()}
                onInput={(e) => setNewTime(e.currentTarget.value)}
                class="px-2 py-1 text-13-regular text-text-strong bg-background rounded border border-border focus:outline-none"
              />
            </div>

            {/* Day selector */}
            <div class="flex items-center gap-1 flex-wrap">
              <For each={DAYS}>
                {(day) => (
                  <button
                    type="button"
                    onClick={() => toggleDay(day)}
                    class={`px-1.5 py-0.5 text-11-regular rounded ${
                      newDays().includes(day)
                        ? "bg-accent text-accent-text"
                        : "bg-surface text-text-weak hover:bg-surface-hover"
                    }`}
                  >
                    {day}
                  </button>
                )}
              </For>
            </div>

            {/* Add button */}
            <Button
              variant="primary"
              size="small"
              class="w-full"
              onClick={addTask}
            >
              Add Task
            </Button>
          </div>
        </div>
      </Show>

      {/* Task list */}
      <div class="flex-1 overflow-y-auto px-3 py-2">
        <Show
          when={tasks().length > 0}
          fallback={
            <div class="text-center py-8 text-13-regular text-text-weak">
              No tasks yet. Click + to add one.
            </div>
          }
        >
          <For each={tasks()}>
            {(task) => (
              <div class="mb-2 p-2 rounded-lg border border-border bg-surface">
                <div class="flex items-start gap-2">
                  <IconButton
                    icon={task.enabled ? "check-circle" : "circle"}
                    variant="ghost"
                    size="small"
                    onClick={() => toggleTask(task.id)}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="text-13-medium text-text-strong break-words">
                      {task.prompt}
                    </div>
                    <div class="text-12-regular text-text-weak mt-0.5">
                      {task.time} · {task.days.join(", ")}
                    </div>
                  </div>
                  <IconButton
                    icon="trash"
                    variant="ghost"
                    size="small"
                    onClick={() => deleteTask(task.id)}
                  />
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}
