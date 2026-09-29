// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { spawn } from "node:child_process"
import * as os from "node:os"
import * as path from "node:path"

export type RunOptions = { timeout?: number; input?: string | Buffer }

export type RunResult = { ok: true; stdout: string } | { ok: false; error: string; code: number | null }

export type BinaryResult = { ok: true; stdout: Buffer } | { ok: false; error: string; code: number | null }

export function currentPlatform(): "windows" | "macos" | "linux" {
  if (process.env.ZYRAXON_PLATFORM) return process.env.ZYRAXON_PLATFORM as "windows" | "macos" | "linux"
  if (process.platform === "win32") return "windows"
  if (process.platform === "darwin") return "macos"
  return "linux"
}

// Everything external runs through here so a missing binary produces the same
// error shape on all three platforms instead of a raw ENOENT.
export function runCommand(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    const child = spawn(command, args, { windowsHide: true })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (c: Buffer) => stdout.push(c))
    child.stderr.on("data", (c: Buffer) => stderr.push(c))
    let settled = false
    const finish = (value: RunResult) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({
        ok: false,
        error: `${command} timed out after ${(options.timeout ?? 30000) / 1000}s`,
        code: null,
      })
    }, options.timeout ?? 30000)
    child.on("error", (error) => {
      clearTimeout(timer)
      finish({ ok: false, error: `${command} could not start: ${(error as Error).message}`, code: null })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      const out = Buffer.concat(stdout).toString()
      if (code === 0) finish({ ok: true, stdout: out })
      else
        finish({
          ok: false,
          error: `${command} exited with ${code}: ${Buffer.concat(stderr).toString().trim() || out.trim()}`,
          code,
        })
    })
    if (options.input !== undefined) child.stdin.write(options.input)
    child.stdin.end()
  })
}

// Binary counterpart of runCommand, needed whenever a child streams pixels or media.
export function runBinary(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<BinaryResult> {
  return new Promise<BinaryResult>((resolve) => {
    const child = spawn(command, args, { windowsHide: true })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let settled = false
    const finish = (value: BinaryResult) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({
        ok: false,
        error: `${command} timed out after ${(options.timeout ?? 30000) / 1000}s`,
        code: null,
      })
    }, options.timeout ?? 30000)
    child.on("error", (error) => {
      clearTimeout(timer)
      finish({ ok: false, error: `${command} could not start: ${(error as Error).message}`, code: null })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) finish({ ok: true, stdout: Buffer.concat(stdout) })
      else
        finish({
          ok: false,
          error: `${command} exited with ${code}: ${Buffer.concat(stderr).toString().trim() || Buffer.concat(stdout).toString().trim()}`,
          code,
        })
    })
    if (options.input !== undefined) child.stdin.write(options.input)
    child.stdin.end()
  })
}

export async function run(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<string> {
  const result = await runCommand(command, args, options)
  if (result.ok === true) return result.stdout
  throw new Error(result.error)
}

export async function tryRun(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<string | null> {
  const result = await runCommand(command, args, options)
  return result.ok ? result.stdout : null
}

export async function haveCommand(command: string): Promise<boolean> {
  if (currentPlatform() === "windows") return (await tryRun("where", [command], { timeout: 8000 })) !== null
  return (await tryRun("sh", ["-c", `command -v ${command}`], { timeout: 8000 })) !== null
}

export function tempPath(prefix: string, extension: string): string {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return path.join(os.tmpdir(), `${prefix}_${stamp}${extension}`)
}

export function describeMissing(binary: string, install: Record<string, string>): string {
  const platform = currentPlatform()
  const hint = install[platform] ?? install.linux ?? "install it and retry"
  return `${binary} is required for this operation but was not found on PATH. ${hint}`
}
