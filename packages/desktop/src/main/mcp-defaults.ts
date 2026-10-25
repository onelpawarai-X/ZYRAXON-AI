// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * One-time switch-off of the bundled MCP servers in an existing config.
 *
 * Earlier versions wrote the four bundled servers with `enabled: true`, so every install
 * created before this change still starts them — a headless Chrome included — on every
 * session, whether or not the task touches a browser or the desktop. Changing only the
 * shipped default would not reach those configs, so the entries already on disk have to
 * be turned off once.
 *
 * Only an entry that is still enabled *and* still carries the shipped command is touched.
 * Replacing the command is how someone points a bundled name at their own server, and that
 * setup is theirs to keep.
 */

/** A minimal view of the config entries this migration reads and writes. */
export interface McpDefaultsConfig {
  mcp?: Record<string, { enabled?: boolean; command?: unknown } | undefined>
}

/**
 * Turn off bundled servers an earlier version had switched on.
 *
 * Returns the names it changed, so the caller knows whether the config needs writing back.
 */
export function disableBundledDefaults(
  config: McpDefaultsConfig,
  defaults: Record<string, { command?: unknown }>,
): string[] {
  if (!config.mcp) return []

  const disabled: string[] = []
  for (const [name, def] of Object.entries(defaults)) {
    const entry = config.mcp[name]
    if (!entry || entry.enabled !== true) continue
    if (JSON.stringify(entry.command) !== JSON.stringify(def.command)) continue
    entry.enabled = false
    disabled.push(name)
  }
  return disabled
}
