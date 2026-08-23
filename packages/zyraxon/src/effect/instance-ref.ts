import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@zyraxon-ai/core/workspace"

const defaultContext: InstanceContext = {
  directory: process.cwd(),
  worktree: process.cwd(),
  project: {
    id: "default",
    type: "node" as const,
    name: "default",
  },
}

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~zyraxon/InstanceRef", {
  defaultValue: () => defaultContext,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~zyraxon/WorkspaceRef", {
  defaultValue: () => undefined,
})
