// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Effect, Layer } from "effect"
import { Skill } from "../../src/skill"

export const empty = Layer.mock(Skill.Service)({
  dirs: () => Effect.succeed([]),
})

export * as SkillTest from "./skill"
