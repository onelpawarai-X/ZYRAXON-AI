export function initializationData<A>(state: (() => A | undefined) & { error: unknown }) {
  console.log("[ZLOG] [initialization] checking state:", { hasError: state.error !== undefined, loading: state.loading })
  if (state.error !== undefined) {
    console.error("[ZLOG] [initialization] SIDECAR ERROR:", state.error)
    throw markLocalServerStartup(state.error)
  }
  const data = state()
  console.log("[ZLOG] [initialization] data resolved:", { hasData: !!data })
  return data
}

function markLocalServerStartup(error: unknown) {
  const failure = error instanceof Error ? error : new Error(String(error))
  const prefix = "Error invoking remote method 'await-initialization': Error: "
  if (failure.message.startsWith(prefix)) {
    const previous = failure.message
    failure.message = failure.message.slice(prefix.length)
    if (failure.stack) failure.stack = failure.stack.replace(`Error: ${previous}`, `Error: ${failure.message}`)
  }
  Object.defineProperty(failure, "localServerStartup", { value: true })
  return failure
}

export function initializationReady<A>(state: (() => A | undefined) & { error: unknown; loading: boolean }) {
  if (state.loading) return false
  initializationData(state)
  return true
}
