// Copyright (c) 2026 onelpawarai. All rights reserved.

export function errorDescriptionKey(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "localServerStartup" in error &&
    error.localServerStartup === true
  ) {
    return "error.page.description.localServerStartup" as const
  }
  return "error.page.description" as const
}
