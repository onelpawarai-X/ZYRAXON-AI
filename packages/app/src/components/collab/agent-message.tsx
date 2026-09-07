import { type Component, For, Show, createSignal, onMount, onCleanup } from "solid-js"
import type { AgentMessage, AgentInfo } from "@zyraxon-ai/collab"

interface AgentMessageProps {
  message: AgentMessage
  agents: Map<string, AgentInfo>
}

const IconClipboard = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
)
const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
)
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
)
const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
)
const IconRuler = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>
)
const IconQuestion = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
)
const IconChart = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
)
const IconAlert = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
)
const IconZap = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
)
const IconMessage = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
)

const MESSAGE_ICONS: Record<string, Component> = {
  "task-assign": IconClipboard,
  "task-update": IconRefresh,
  "task-complete": IconCheck,
  "task-failed": IconX,
  "plan-share": IconRuler,
  "status-request": IconQuestion,
  "status-response": IconChart,
  "alert": IconAlert,
  "broadcast": IconZap,
}

export const AgentMessageBubble: Component<AgentMessageProps> = (props) => {
  const getAgentInfo = () => props.agents.get(props.message.from)

  const getMessageIcon = () => MESSAGE_ICONS[props.message.type] ?? IconMessage

  const getAgentColor = () => {
    const agent = getAgentInfo()
    return agent?.color ?? "#6366f1"
  }

  const IconComp = getMessageIcon()

  return (
    <div class="agent-message flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
      {/* Agent Avatar */}
      <div
        class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
        style={{ "background-color": getAgentColor() }}
      >
        <Show when={getAgentInfo()?.icon} fallback={props.message.from.charAt(0).toUpperCase()}>
          {getAgentInfo()?.icon}
        </Show>
      </div>

      {/* Message Content */}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-medium text-white text-sm">
            {getAgentInfo()?.name ?? props.message.from}
          </span>
          <span class="text-xs text-zinc-400"><IconComp /></span>
          <span class="text-xs text-zinc-500">
            {new Date(props.message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        <div class="text-sm text-zinc-300">
          {typeof props.message.payload === "string"
            ? props.message.payload
            : JSON.stringify(props.message.payload)}
        </div>
      </div>
    </div>
  )
}

// Chat message list with agent messages
interface AgentChatProps {
  messages: AgentMessage[]
  agents: Map<string, AgentInfo>
}

export const AgentChat: Component<AgentChatProps> = (props) => {
  let chatRef: HTMLDivElement | undefined

  onMount(() => {
    if (chatRef) {
      chatRef.scrollTop = chatRef.scrollHeight
    }
  })

  return (
    <div ref={chatRef} class="agent-chat flex flex-col gap-2 p-4 overflow-y-auto max-h-[400px]">
      <Show when={props.messages.length > 0}>
        <div class="text-xs text-zinc-500 mb-2">Agent Communications</div>
        <For each={props.messages}>
          {(message) => <AgentMessageBubble message={message} agents={props.agents} />}
        </For>
      </Show>
      <Show when={props.messages.length === 0}>
        <div class="text-center text-zinc-500 text-sm py-8">
          No agent communications yet
        </div>
      </Show>
    </div>
  )
}
