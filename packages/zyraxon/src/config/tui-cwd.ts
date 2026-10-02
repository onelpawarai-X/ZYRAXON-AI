// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Context } from "effect"

export const CurrentWorkingDirectory = Context.Reference<string>("CurrentWorkingDirectory", {
  defaultValue: () => process.cwd(),
})
