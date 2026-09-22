import { execSync } from "node:child_process"

/**
 * KERNEL 03: Background Loop
 * Algorithm: Parallel Task Scheduling with Weighted Fair Queuing + DAG Resolution + Critical Path + Resource-Aware Scheduling
 * Input: Sub-task definitions with dependencies and priorities
 * Output: Execution results, scheduling metrics, resource utilization
 * Boundary: Max 16 parallel tasks; task timeout 60s; DAG cycle detection via DFS
 * Verification: Tasks A→B→C scheduled so C runs after B after A; critical path = [A, B, C]
 */

export interface SubTask {
  id: string
  description: string
  command: string
  priority: number
  dependencies: string[]
  timeout: number
  retryCount: number
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  result?: string
  error?: string
  startTime?: number
  endTime?: number
  resourceCost?: number
}

export interface SchedulingMetrics {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  avgWaitTime: number
  avgExecutionTime: number
  maxConcurrency: number
  resourceUtilization: number
}

function deterministicHash(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function weightedFairQueuing(tasks: SubTask[]): SubTask[] {
  const now = Date.now()
  const scored = tasks.map((task) => {
    const age = task.startTime ? now - task.startTime : 0
    const ageBonus = Math.min(age / 10000, 1.0) * 0.3
    const priorityScore = (task.priority / 10) * 0.5
    const depScore = task.dependencies.length > 0 ? 0.2 : 0
    const resourcePenalty = task.resourceCost ? (task.resourceCost / 10) * 0.1 : 0
    return { task, score: priorityScore + ageBonus + depScore - resourcePenalty }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.task)
}

function shannonEntropy(values: number[]): number {
  const total = values.reduce((s, v) => s + v, 0)
  if (total === 0) return 0
  let entropy = 0
  for (const v of values) {
    if (v > 0) {
      const p = v / total
      entropy -= p * Math.log2(p)
    }
  }
  return entropy
}

export class BackgroundLoop {
  private activeTasks: Map<string, SubTask> = new Map()
  private completedTasks: SubTask[] = []
  private maxParallel = 16
  private taskQueue: SubTask[] = []
  private schedulingMetrics: SchedulingMetrics = {
    totalTasks: 0, completedTasks: 0, failedTasks: 0, avgWaitTime: 0,
    avgExecutionTime: 0, maxConcurrency: 0, resourceUtilization: 0,
  }
  private taskHistory: Array<{ taskId: string; command: string; duration: number; success: boolean; timestamp: number }> = []
  private resourceBudget = 100
  private resourceUsed = 0

  async spawnParallel(tasks: SubTask[]): Promise<Map<string, SubTask>> {
    this.validateDAG(tasks)
    const results = new Map<string, SubTask>()
    const ready = this.getReadyTasks(tasks)
    const running: Promise<void>[] = []
    let currentConcurrency = 0
    while (ready.length > 0 || running.length > 0) {
      while (ready.length > 0 && currentConcurrency < this.maxParallel) {
        const task = ready.shift()!
        const taskCost = task.resourceCost ?? 1
        if (this.resourceUsed + taskCost > this.resourceBudget && running.length > 0) break
        task.status = "running"
        task.startTime = Date.now()
        this.activeTasks.set(task.id, task)
        this.resourceUsed += taskCost
        currentConcurrency++
        const promise = this.executeTask(task)
          .then(() => {
            task.status = "completed"
            task.endTime = Date.now()
            this.completedTasks.push(task)
            this.activeTasks.delete(task.id)
            this.resourceUsed -= taskCost
            currentConcurrency--
            this.updateSchedulingMetrics(task)
            this.recordTaskHistory(task, true)
            const newReady = this.getReadyTasks(tasks).filter((t) => !results.has(t.id) && t.status === "pending")
            ready.push(...newReady)
          })
          .catch((err: unknown) => {
            task.status = "failed"
            task.error = err instanceof Error ? err.message : String(err)
            task.endTime = Date.now()
            this.completedTasks.push(task)
            this.activeTasks.delete(task.id)
            this.resourceUsed -= taskCost
            currentConcurrency--
            this.recordTaskHistory(task, false)
            if (task.retryCount > 0) {
              task.retryCount--
              task.status = "pending"
              ready.push(task)
            }
          })
        running.push(promise)
        results.set(task.id, task)
      }
      if (running.length > 0) {
        await Promise.race(running)
        const toRemove: number[] = []
        for (let i = 0; i < running.length; i++) {
          const state = (running[i] as Promise<void> & { __state?: string }).__state
          if (state === "fulfilled" || state === "rejected") toRemove.push(i)
        }
        for (let i = toRemove.length - 1; i >= 0; i--) running.splice(toRemove[i], 1)
      }
      if (running.length === 0 && ready.length === 0) break
      if (currentConcurrency >= this.maxParallel && running.length > 0) await Promise.race(running)
    }
    this.schedulingMetrics.maxConcurrency = Math.max(this.schedulingMetrics.maxConcurrency, currentConcurrency)
    return results
  }

  private validateDAG(tasks: SubTask[]) {
    const taskMap = new Map(tasks.map((t) => [t.id, t]))
    const visited = new Set<string>()
    const inStack = new Set<string>()
    const dfs = (id: string) => {
      if (inStack.has(id)) throw new Error(`Circular dependency detected: ${id}`)
      if (visited.has(id)) return
      visited.add(id)
      inStack.add(id)
      const task = taskMap.get(id)
      if (task) for (const dep of task.dependencies) dfs(dep)
      inStack.delete(id)
    }
    for (const task of tasks) dfs(task.id)
  }

  private getReadyTasks(tasks: SubTask[]): SubTask[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]))
    const ready: SubTask[] = []
    for (const task of tasks) {
      if (task.status !== "pending") continue
      const allDepsMet = task.dependencies.every((dep) => {
        const depTask = taskMap.get(dep)
        return depTask && depTask.status === "completed"
      })
      if (allDepsMet) ready.push(task)
    }
    return weightedFairQueuing(ready)
  }

  private async executeTask(task: SubTask): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = execSync(task.command, { timeout: task.timeout || 60000, encoding: "utf-8", maxBuffer: 1024 * 1024 })
      resolve(proc.slice(0, 5000))
    })
  }

  private updateSchedulingMetrics(task: SubTask) {
    const m = this.schedulingMetrics
    m.totalTasks++
    if (task.status === "completed") m.completedTasks++
    if (task.status === "failed") m.failedTasks++
    if (task.startTime && task.endTime) {
      const execTime = task.endTime - task.startTime
      m.avgExecutionTime = (m.avgExecutionTime * (m.totalTasks - 1) + execTime) / m.totalTasks
    }
    if (task.startTime) {
      const waitTime = Date.now() - task.startTime
      m.avgWaitTime = (m.avgWaitTime * (m.totalTasks - 1) + waitTime) / m.totalTasks
    }
    m.resourceUtilization = this.resourceBudget > 0 ? this.resourceUsed / this.resourceBudget : 0
  }

  private recordTaskHistory(task: SubTask, success: boolean) {
    const duration = (task.endTime ?? Date.now()) - (task.startTime ?? Date.now())
    this.taskHistory.push({
      taskId: task.id,
      command: task.command,
      duration,
      success,
      timestamp: Date.now(),
    })
    if (this.taskHistory.length > 500) this.taskHistory.shift()
  }

  async startLoop(loopId: string, tasks: SubTask[]) {
    this.taskQueue.push(...tasks)
    const results = await this.spawnParallel(tasks)
    this.taskQueue = this.taskQueue.filter((t) => !results.has(t.id))
  }

  getLoopStatus(loopId: string): SubTask[] { return this.taskQueue.filter((t) => t.status !== "completed") }
  getMetrics(): SchedulingMetrics { return { ...this.schedulingMetrics } }
  getActiveTasks(): SubTask[] { return Array.from(this.activeTasks.values()) }
  getCompletedTasks(): SubTask[] { return [...this.completedTasks] }

  cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId)
    if (task) { task.status = "cancelled"; this.activeTasks.delete(taskId); return true }
    return false
  }

  getTaskDependencyOrder(tasks: SubTask[]): string[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]))
    const inDegree = new Map<string, number>()
    const adjList = new Map<string, string[]>()
    for (const task of tasks) { inDegree.set(task.id, 0); adjList.set(task.id, []) }
    for (const task of tasks) {
      for (const dep of task.dependencies) {
        if (taskMap.has(dep)) { adjList.get(dep)!.push(task.id); inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1) }
      }
    }
    const queue: string[] = []
    for (const [id, degree] of inDegree) if (degree === 0) queue.push(id)
    const sorted: string[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      sorted.push(id)
      for (const neighbor of adjList.get(id) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) queue.push(neighbor)
      }
    }
    return sorted
  }

  computeCriticalPath(tasks: SubTask[]): string[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]))
    const longestPath = new Map<string, number>()
    const predecessor = new Map<string, string | null>()
    const sorted = this.getTaskDependencyOrder(tasks)
    for (const id of sorted) longestPath.set(id, 0)
    for (const id of sorted) {
      const task = taskMap.get(id)!
      const currentLen = longestPath.get(id) ?? 0
      for (const depId of task.dependencies) {
        if (!taskMap.has(depId)) continue
        const depLen = longestPath.get(depId) ?? 0
        const taskWeight = (task.endTime ?? Date.now()) - (task.startTime ?? Date.now())
        if (depLen + taskWeight > currentLen) {
          longestPath.set(id, depLen + taskWeight)
          predecessor.set(id, depId)
        }
      }
    }
    let maxLen = 0, endNode = sorted[0]
    for (const [id, len] of longestPath) { if (len > maxLen) { maxLen = len; endNode = id } }
    const path: string[] = []
    let current: string | null = endNode
    while (current) { path.unshift(current); current = predecessor.get(current) ?? null }
    return path
  }

  getMetricsSummary(): { throughput: number; failureRate: number; avgCycleTime: number } {
    const m = this.schedulingMetrics
    return {
      throughput: m.completedTasks / Math.max(m.avgExecutionTime / 1000, 1),
      failureRate: m.totalTasks > 0 ? m.failedTasks / m.totalTasks : 0,
      avgCycleTime: m.avgWaitTime + m.avgExecutionTime,
    }
  }

  getTaskHistoryStats(): { totalTasks: number; avgDuration: number; successRate: number; durationEntropy: number } {
    if (this.taskHistory.length === 0) return { totalTasks: 0, avgDuration: 0, successRate: 0, durationEntropy: 0 }
    const durations = this.taskHistory.map((t) => t.duration)
    const successCount = this.taskHistory.filter((t) => t.success).length
    const buckets = new Map<string, number>()
    for (const d of durations) {
      const bucket = Math.floor(d / 1000).toString()
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
    }
    return {
      totalTasks: this.taskHistory.length,
      avgDuration: durations.reduce((s, v) => s + v, 0) / durations.length,
      successRate: successCount / this.taskHistory.length,
      durationEntropy: shannonEntropy(Array.from(buckets.values())),
    }
  }

  getResourceUtilization(): { budget: number; used: number; utilization: number } {
    return { budget: this.resourceBudget, used: this.resourceUsed, utilization: this.resourceBudget > 0 ? this.resourceUsed / this.resourceBudget : 0 }
  }

  async learn(toolName: string, result: unknown) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result)
    if (resultStr.includes("error") || resultStr.includes("Error")) this.schedulingMetrics.failedTasks++
  }
}
