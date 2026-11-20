// Copyright (c) 2026 onelpawarai. All rights reserved.

import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/**
 * Run a command that needs elevated privileges, non-interactively and bounded in time.
 *
 * A packaged app has no terminal attached, so a bare `sudo` can block waiting for a
 * password that can never be typed. Because the installer's ceiling is 120s, that
 * wait showed up as the app appearing to freeze for about two minutes before the
 * install gave up. `-n` turns "no password available" into an immediate failure
 * instead of a two-minute stall, and the timeout is the final backstop.
 */
export async function runPrivileged(
  args: ReadonlyArray<string>,
  options: { timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<void> {
  await execFileAsync("sudo", ["-n", ...args], {
    timeout: options.timeoutMs,
    ...(options.env ? { env: options.env } : {}),
  })
}
