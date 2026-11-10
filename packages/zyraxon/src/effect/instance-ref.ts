// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@zyraxon-ai/core/workspace"

const defaultContext: InstanceContext = {
  directory: process.cwd(),
  worktree: process.cwd(),
  project: {
    id: "default" as InstanceContext["project"]["id"],
    worktree: process.cwd(),
    name: "default",
    time: { created: 0, updated: 0 },
    sandboxes: [],
  },
}

// A reference with a non-optional default: the instance context is always
// resolvable (falling back to the process working directory), so consumers never
// have to null-check it. `WorkspaceRef` stays optional because it has no default.
export const InstanceRef = Context.Reference<InstanceContext>("~zyraxon/InstanceRef", {
  defaultValue: () => defaultContext,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~zyraxon/WorkspaceRef", {
  defaultValue: () => undefined,
})
