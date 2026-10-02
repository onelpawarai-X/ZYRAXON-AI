// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSimpleContext } from "./helper"

export type Exit = (reason?: unknown) => void

export const { use: useExit, provider: ExitProvider } = createSimpleContext({
  name: "Exit",
  init: (input: { exit: Exit }) => input.exit,
})
