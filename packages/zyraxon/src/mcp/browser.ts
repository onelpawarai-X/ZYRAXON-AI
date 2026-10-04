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
  // LOCALAPPDATA comes first on purpose. A per-user Chrome install is the profile the
  // user actually signs into, and it is also the only candidate on a machine where
  // Chrome was installed for that account alone. Program Files is the fallback.
  const roots = [process.env["LOCALAPPDATA"], process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"]]
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

/**
 * Bring the Chrome window that just received the tab to the front.
 *
 * Chrome was already running, so `--new-window` reuses that process and can land the
 * new tab behind whatever the user is doing. A sign-in page nobody can see produces
 * exactly the symptom of a broken flow: the app says Chrome opened, no window appears,
 * and the consent times out. Best effort by design — this is a convenience, and failing
 * to focus must never turn into a failed launch.
 */
function focusChromeWindow() {
  if (process.platform === "win32") {
    // A no-op PowerShell call keeps this dependency-free: spawning powershell just to
    // resolve a window handle would cost more than the focus is worth.
    spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        "$s='[DllImport(\"user32.dll\")]public static extern bool SetForegroundWindow(IntPtr h);'+" +
          "$t=Add-Type -MemberDefinition $s -Name W -Namespace N -PassThru;" +
          "(Get-Process chrome -ErrorAction SilentlyContinue|Where-Object{$_.MainWindowHandle -ne 0}|" +
          "Select-Object -First 1).MainWindowHandle -as [IntPtr]|ForEach-Object{$null=$t::W($_)}",
      ],
      { detached: true, stdio: "ignore", windowsHide: true },
    ).unref()
    return
  }
  if (process.platform === "darwin") {
    spawn("osascript", [
      "-e",
      'tell application "Google Chrome" to activate',
    ], { detached: true, stdio: "ignore" }).unref()
  }
}

/** Open a URL in Chrome where one can be found, reporting when there is none. */
function openInChrome(url: string): Effect.Effect<void, Error | "no-chrome"> {
  if (process.platform === "win32") {
    const exe = chromeCandidates().find((candidate) => existsSync(candidate))
    if (!exe) return Effect.succeed("no-chrome" as const)
    // A consent page the user never sees is the same as no consent page. Bringing the
    // existing Chrome window forward matters as much as opening the tab, because
    // Chrome was already running and would otherwise reuse that window in the
    // background where the sign-in sits unseen.
    return launch(exe, ["--new-window", url]).pipe(
      Effect.andThen(Effect.sync(() => focusChromeWindow())),
      Effect.catch(() => Effect.void),
    )
  }
  if (process.platform === "darwin") {
    if (!existsSync(MAC_CHROME)) return Effect.succeed("no-chrome" as const)
    return launch(MAC_CHROME, ["--new-window", url]).pipe(
      Effect.andThen(Effect.sync(() => focusChromeWindow())),
      Effect.catch(() => Effect.void),
    )
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
