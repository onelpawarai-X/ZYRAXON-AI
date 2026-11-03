// Copyright (c) 2026 onelpawarai. All rights reserved.

import { existsSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"

/**
 * Locate the system Chrome, used to open the Cloud Agent in a real browser where
 * it has full microphone and speech support.
 *
 * This lived in the voice bridge, which has since been removed — speech
 * recognition now streams straight to the STT endpoint — but the Cloud Agent
 * still needs Chrome, so the lookup moved here.
 */
export function findChromePath(): string | null {
  const pf = process.env["PROGRAMFILES"] || ""
  const pf86 = process.env["PROGRAMFILES(X86)"] || ""
  const local = process.env["LOCALAPPDATA"] || ""

  const candidates = [
    pf ? join(pf, "Google", "Chrome", "Application", "chrome.exe") : null,
    pf86 ? join(pf86, "Google", "Chrome", "Application", "chrome.exe") : null,
    local ? join(local, "Google", "Chrome", "Application", "chrome.exe") : null,
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  try {
    const where = execSync("where chrome.exe", { encoding: "utf8", timeout: 3000 }).trim()
    const first = where.split("\n")[0]?.trim()
    if (first && existsSync(first)) return first
  } catch {}

  return null
}
