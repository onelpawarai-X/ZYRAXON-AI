import { type Component, Show } from "solid-js"
import type { AgentInfo } from "@zyraxon-ai/collab"

interface AgentCardProps {
  agent: AgentInfo
}

const StatusIcon = (props: { name: string; class?: string }) => {
  const icons: Record<string, any> = {
    refresh: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
    pause: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
    hourglass: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>,
    x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
    circle: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>,
    question: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  }
  return <span class={props.class}>{icons[props.name] ?? icons.question}</span>
}

export const AgentCard: Component<AgentCardProps> = (props) => {
  const getStatusColor = () => {
    switch (props.agent.status) {
      case "working":
        return "text-green-400 bg-green-400/10"
      case "idle":
        return "text-zinc-400 bg-zinc-400/10"
      case "waiting":
        return "text-yellow-400 bg-yellow-400/10"
      case "failed":
        return "text-red-400 bg-red-400/10"
      case "offline":
        return "text-zinc-500 bg-zinc-500/10"
      default:
        return "text-zinc-400 bg-zinc-400/10"
    }
  }

  const getStatusIcon = () => {
    switch (props.agent.status) {
      case "working": return "refresh"
      case "idle": return "pause"
      case "waiting": return "hourglass"
      case "failed": return "x"
      case "offline": return "circle"
      default: return "question"
    }
  }

  const getProgressColor = () => {
    if (props.agent.progress >= 100) return "bg-green-500"
    if (props.agent.progress >= 60) return "bg-blue-500"
    if (props.agent.progress >= 30) return "bg-yellow-500"
    return "bg-zinc-500"
  }

  return (
    <div class="agent-card p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 hover:border-zinc-600/50 transition-colors">
      {/* Header */}
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <div
            class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
            style={{ "background-color": props.agent.color ?? "#6366f1" }}
          >
            <Show when={props.agent.icon} fallback={props.agent.name.charAt(0)}>
              {props.agent.icon}
            </Show>
          </div>
          <div>
            <div class="font-medium text-white">{props.agent.name}</div>
            <div class="text-xs text-zinc-400">{props.agent.id}</div>
          </div>
        </div>
        <div class={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor()}`}>
          <StatusIcon name={getStatusIcon()} /> {props.agent.status}
        </div>
      </div>

      {/* Progress Bar */}
      <div class="mb-3">
        <div class="flex justify-between text-xs text-zinc-400 mb-1">
          <span>Progress</span>
          <span>{props.agent.progress}%</span>
        </div>
        <div class="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
          <div
            class={`h-full ${getProgressColor()} transition-all duration-300`}
            style={{ width: `${props.agent.progress}%` }}
          />
        </div>
      </div>

      {/* Current Task */}
      <Show when={props.agent.currentTask}>
        <div class="text-xs text-zinc-400 mb-2">
          <span class="text-zinc-500">Current Task:</span>{" "}
          <span class="text-zinc-300">{props.agent.currentTask}</span>
        </div>
      </Show>

      {/* Stats */}
      <div class="flex justify-between text-xs text-zinc-500">
        <span class="flex items-center gap-1"><StatusIcon name="check" class="text-green-400" /> {props.agent.completedTasks} completed</span>
        <Show when={props.agent.failedTasks > 0}>
          <span class="flex items-center gap-1 text-red-400"><StatusIcon name="x" /> {props.agent.failedTasks} failed</span>
        </Show>
      </div>
    </div>
  )
}
