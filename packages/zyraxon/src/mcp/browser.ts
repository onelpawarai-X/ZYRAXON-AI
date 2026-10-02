// Copyright (c) 2026 onelpawarai. All rights reserved.

import { LayerNode } from "@zyraxon-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import open from "open"
import { join } from "node:path"

export interface Interface {
  readonly open: (url: string) => Effect.Effect<void, Error>
}

export class Service extends Context.Service<Service, Interface>()("@zyraxon/McpBrowser") {}

/**
 * Chrome is launched on purpose rather than through the OS default handler.
 *
 * `open()` hands the URL to whatever the machine considers its default browser,
 * which on Windows is Edge far more often than not. Sign-in then happens in a
 * browser whose profile was never authorised, so the flow stalls on a login page
 * the agent cannot see or complete. Launching Chrome directly keeps the flow in
 * the profile that already holds the session.
 */
function chromeCandidates(): string[] {
  if (process.platform !== "win32") return []
  const roots = [process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"], process.env["LOCALAPPDATA"]]
  return roots
    .filter((root): root is string => typeof root === "string" && root.length > 0)
    .map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe"))
}

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const LINUX_CHROME = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]

/** Run the command detached and resolve as soon as it is launched. */
function launch(command: string, args: string[]) {
  return Effect.try({
    try: () =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { detached: true, stdio: "ignore" })
        child.once("error", reject)
        child.once("spawn", () => {
          // Chrome stays alive for the whole session, so never wait on exit.
          child.unref()
          resolve()
        })
      }),
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  })
}

/** Open a URL in Chrome where one can be found, reporting when there is none. */
function openInChrome(url: string): Effect.Effect<void, Error | "no-chrome"> {
  if (process.platform === "win32") {
    const exe = chromeCandidates().find((candidate) => existsSync(candidate))
    if (!exe) return Effect.succeed("no-chrome" as const)
    // --new-window brings the consent page to the front instead of hiding it
    // behind whatever the user was doing.
    return launch(exe, ["--new-window", url])
  }
  if (process.platform === "darwin") {
    if (!existsSync(MAC_CHROME)) return Effect.succeed("no-chrome" as const)
    return launch(MAC_CHROME, ["--new-window", url])
  }
  const found = LINUX_CHROME.find((bin) => {
    const dirs = (process.env["PATH"] ?? "").split(process.platform === "win32" ? ";" : ":")
    return dirs.some((dir) => dir.length > 0 && existsSync(join(dir, bin)))
  })
  if (!found) return Effect.succeed("no-chrome" as const)
  return launch(found, ["--new-window", url])
}

const layer = Layer.succeed(
  Service,
  Service.of({
    open: Effect.fn("McpBrowser.open")(function* (url: string) {
      const inChrome = yield* openInChrome(url)
      if (inChrome !== "no-chrome") return

      // No Chrome on this machine, so fall back to whatever the OS prefers rather
      // than failing the sign-in outright.
      const subprocess = yield* Effect.tryPromise({
        try: () => open(url),
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      })
      yield* Effect.callback<void, Error>((resume) => {
        const timer = setTimeout(() => resume(Effect.void), 500)
        subprocess.on("error", (error) => {
          clearTimeout(timer)
          resume(Effect.fail(error))
        })
        subprocess.on("exit", (code) => {
          if (code === null || code === 0) return
          clearTimeout(timer)
          resume(Effect.fail(new Error(`Browser open failed with exit code ${code}`)))
        })
      })
    }),
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [] })

export * as McpBrowser from "./browser"
