// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { AgentDraft } from "../effect/agent.js"
import type { Hooks } from "./registration.js"

export type { AgentDraft }

export type AgentHooks = Hooks<{
  transform: AgentDraft
}>
