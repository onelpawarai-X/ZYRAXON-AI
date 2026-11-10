// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * The one place a child process is spawned for verification.
 *
 * Both the verification gates and the evaluation adapters run external tools, and
 * both need the same three guarantees: output is captured whole, a command that
 * cannot be started is reported as exit 127 rather than thrown, and a hung
 * command is killed instead of holding the run open forever.
 */

import { spawn } from "node:child_process"
import type { CommandInput, CommandResult } from "./verification-gate"

export const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000

export function spawnRunner(input: CommandInput): Promise<CommandResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: { ...process.env, ...input.env },
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      resolve({ code, stdout, stderr, durationMs: Date.now() - startedAt })
    }

    const timer = setTimeout(() => {
      stderr += `\n[verify-gate] timed out after ${input.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms; killing\n`
      child.kill("SIGKILL")
    }, input.timeoutMs ?? DEFAULT_TIMEOUT_MS)

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
      process.stdout.write(chunk)
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
      process.stderr.write(chunk)
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      stderr += `\n[verify-gate] could not start ${input.command}: ${error.message}\n`
      finish(127)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      finish(code ?? 1)
    })
  })
}
