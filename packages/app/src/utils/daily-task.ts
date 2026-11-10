// Copyright (c) 2026 onelpawarai. All rights reserved.

// A daily task must not merely pre-fill the composer — it must run. The scheduler
// activation and the prompt seeding happen in different components (the router-root
// handler seeds, the page owns the composer controller), so the intent to auto-submit
// travels through a one-shot window flag that the first composer to become ready
// consumes exactly once.
const FLAG = "__zyraxonDailyTaskAutoSubmit"

export function markDailyTaskAutoSubmit(): void {
  if (typeof window === "undefined") return
  ;(window as any)[FLAG] = true
}

export function consumeDailyTaskAutoSubmit(): boolean {
  if (typeof window === "undefined") return false
  const value = (window as any)[FLAG] === true
  ;(window as any)[FLAG] = false
  return value
}
