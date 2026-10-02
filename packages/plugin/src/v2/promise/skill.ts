// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { SkillDraft } from "../effect/skill.js"
import type { Hooks } from "./registration.js"

export type { SkillDraft }

export type SkillHooks = Hooks<{
  transform: SkillDraft
}>
