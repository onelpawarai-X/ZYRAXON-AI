// Copyright (c) 2026 onelpawarai. All rights reserved.

// Pure data + types for the agent collaboration model.
// Kept JSX-free so tests and non-renderer code can import it without pulling in a JSX runtime.

export interface ZyraxonAgentDef {
  id: string
  name: string
  icon: string
  color: string
  description: string
  capabilities: string[]
  canDelegateTo: string[]
  tier: "free" | "pro" | "max" | "ultra"
}

export const ZYRAXON_AGENTS: ZyraxonAgentDef[] = [
  {
    id: "auto",
    name: "Auto",
    icon: "AU",
    color: "#00D4FF",
    description: "Full collaboration -- all agents work together. Can generate images, videos, audio, music.",
    capabilities: ["orchestrate", "delegate", "collaborate", "coordinate", "supervise", "image-gen", "video-gen", "audio-gen", "tts"],
    canDelegateTo: ["build", "plan", "beast", "pro", "apex", "dark-emperor", "pro-builder", "vision"],
    tier: "ultra",
  },
  {
    id: "build",
    name: "Build",
    icon: "BL",
    color: "#3B82F6",
    description: "Software engineering -- coding, debugging, refactoring. Can generate code diagrams as images.",
    capabilities: ["code", "debug", "refactor", "test", "fix", "image-gen"],
    canDelegateTo: ["plan", "pro", "explore"],
    tier: "free",
  },
  {
    id: "plan",
    name: "Plan",
    icon: "PL",
    color: "#F59E0B",
    description: "Architecture analysis -- dependency mapping, risk assessment. Can generate architecture diagrams.",
    capabilities: ["analysis", "architecture", "planning", "review", "image-gen"],
    canDelegateTo: ["build", "explore"],
    tier: "free",
  },
  {
    id: "beast",
    name: "Beast",
    icon: "BE",
    color: "#FF4500",
    description: "Deep warfare coding -- subagent delegation, self-evolution. Full media generation.",
    capabilities: ["deep-code", "subagent", "auto-fix", "aggressive", "image-gen", "video-gen", "audio-gen"],
    canDelegateTo: ["build", "plan", "pro", "explore", "dark-emperor"],
    tier: "max",
  },
  {
    id: "pro",
    name: "PRO",
    icon: "PR",
    color: "#FFD700",
    description: "Professional intelligence -- pattern learning, code synthesis. Can generate professional media.",
    capabilities: ["quality", "patterns", "synthesis", "optimize", "image-gen", "video-gen", "audio-gen"],
    canDelegateTo: ["build", "plan", "explore"],
    tier: "pro",
  },
  {
    id: "apex",
    name: "APEX PREDATOR",
    icon: "AP",
    color: "#FF0000",
    description: "Predatory intelligence -- tool synthesis, self-optimization. Full media generation.",
    capabilities: ["predict", "synthesize", "optimize", "hunt", "image-gen", "video-gen", "audio-gen", "tts"],
    canDelegateTo: ["build", "plan", "pro", "beast", "explore"],
    tier: "ultra",
  },
  {
    id: "dark-emperor",
    name: "DARK EMPEROR",
    icon: "DE",
    color: "#8B0000",
    description: "Supreme sovereign -- reality warping, quantum omniscience. All media generation.",
    capabilities: ["warp", "omniscient", "annihilate", "supreme", "image-gen", "video-gen", "audio-gen", "tts"],
    canDelegateTo: ["build", "plan", "beast", "pro", "apex", "vision", "pro-builder", "explore"],
    tier: "ultra",
  },
  {
    id: "pro-builder",
    name: "PRO BUILDER",
    icon: "PB",
    color: "#10B981",
    description: "Website genesis -- natural language to complete websites. Generates UI mockups and assets.",
    capabilities: ["website", "deploy", "seo", "ui", "design", "image-gen"],
    canDelegateTo: ["build", "pro", "vision", "explore"],
    tier: "pro",
  },
  {
    id: "vision",
    name: "VISION",
    icon: "VI",
    color: "#8B5CF6",
    description: "AI's Eyes -- real-time screen awareness and memory. Image analysis and generation.",
    capabilities: ["vision", "screen", "analysis", "observe", "image-gen"],
    canDelegateTo: ["build", "plan", "explore"],
    tier: "free",
  },
  {
    id: "general",
    name: "General",
    icon: "GN",
    color: "#6B7280",
    description: "General-purpose sub-agent -- unlimited spawn, any role. All media generation.",
    capabilities: ["research", "analysis", "code", "any-task", "image-gen", "video-gen", "audio-gen", "tts"],
    canDelegateTo: [],
    tier: "free",
  },
]

export interface InterAgentMessage {
  id: string
  from: string
  to: string
  type: "task-request" | "task-response" | "delegate" | "data-share" | "status-update" | "help-request" | "help-response" | "broadcast" | "thinking" | "action" | "result"
  content: string
  data?: unknown
  timestamp: number
  visible: boolean
}

export interface OrchestratorTask {
  id: string
  title: string
  description: string
  assignedTo: string
  status: "pending" | "routing" | "in-progress" | "review" | "done" | "failed"
  progress: number
  createdBy: string
  delegatedBy?: string
  dependencies: string[]
  subtasks: string[]
  result?: unknown
  error?: string
  createdAt: number
  updatedAt: number
}

export interface AgentActivity {
  id: string
  agentId: string
  type: "thinking" | "speaking" | "delegating" | "working" | "result" | "error" | "spawn" | "subtask"
  content: string
  timestamp: number
  taskId?: string
  mentions?: string[]
}

export interface SubAgent {
  id: string
  parentId: string
  name: string
  task: string
  status: "running" | "completed" | "failed"
  progress: number
  createdAt: number
  completedAt?: number
  result?: unknown
}
