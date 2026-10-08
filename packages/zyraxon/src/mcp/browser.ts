// Copyright (c) 2026 onelpawarai. All rights reserved.

import { LayerNode } from "@zyraxon-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import open from "open"
import { join } from "node:path"
import { Config } from "@/config/config"

export interface Interface {
  readonly open: (url: string) => Effect.Effect<void, Error>
}

export class Service extends Context.Service<Service, Interface>()("@zyraxon/McpBrowser") {}

/**
 * Browsers to try, in the order most likely to hold the user's session.
 *
 * A specific browser is launched rather than going through the OS default handler,
 * because `open()` hands the URL to whatever the machine considers default, which on
 * Windows is Edge far more often than not. Sign-in then happens in a profile that was
 * never authorised and the flow stalls on a login page nobody can complete.
 *
 * Chrome leads because it is the one people keep signed into for work accounts. But
 * listing only Chrome meant every Windows machine without it fell straight through to the
 * default handler and got Edge anyway — the exact outcome this function exists to avoid,
 * reached by the back door. Edge is therefore listed explicitly: on a machine with no
 * Chrome, the Windows profile that is signed in is the Edge one, so opening Edge
 * deliberately is right, and opening it by accident is not.
 */
function windowsCandidates(): string[] {
  const local = process.env["LOCALAPPDATA"]
  const programFiles = process.env["PROGRAMFILES"]
  const programFilesX86 = process.env["PROGRAMFILES(X86)"]
  const present = (root: string | undefined) => (root && root.length > 0 ? [root] : [])

  return [
    // Per-user installs first: that profile is the one the person actually uses.
    ...present(local).map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe")),
    ...present(programFiles).map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe")),
    ...present(programFilesX86).map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe")),

    ...present(local).map((root) => join(root, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")),
    ...present(programFiles).map((root) => join(root, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")),

    ...present(programFilesX86).map((root) => join(root, "Microsoft", "Edge", "Application", "msedge.exe")),
    ...present(programFiles).map((root) => join(root, "Microsoft", "Edge", "Application", "msedge.exe")),
  ]
}

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const MAC_BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
const MAC_EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
const MAC_CHROMIUM = "/Applications/Chromium.app/Contents/MacOS/Chromium"

const LINUX_CHROME = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser"]

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
 * Bring the window that just received the tab to the front.
 *
 * The browser was already running, so `--new-window` reuses that process and can land the
 * new tab behind whatever the user is doing. A sign-in page nobody can see produces
 * exactly the symptom of a broken flow: the app says Chrome opened, no window appears,
 * and the consent times out. Best effort by design — this is a convenience, and failing
 * to focus must never turn into a failed launch.
 *
 * The browser is named rather than assumed. The focus used to be hardcoded to Chrome, so
 * once the launcher was fixed to fall back through Edge and Brave, the focus call went
 * looking for a window that was never there: PowerShell matched nothing and osascript
 * brought a different application to the front. The consent page then sat behind the
 * user's work, unseen, until it timed out — the failure this function exists to prevent,
 * triggered by the fix for it.
 */
function focusBrowserWindow(processName: string, macAppName?: string) {
  if (process.platform === "win32") {
    // A no-op PowerShell call keeps this dependency-free: spawning powershell just to
    // resolve a window handle would cost more than the focus is worth. The process name is
    // interpolated rather than passed as an argument, and it is a fixed exe base name
    // chosen by identify(), never anything taken from the URL.
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
          `(Get-Process ${processName} -ErrorAction SilentlyContinue|Where-Object{$_.MainWindowHandle -ne 0}|` +
          "Select-Object -First 1).MainWindowHandle -as [IntPtr]|ForEach-Object{$null=$t::W($_)}",
      ],
      { detached: true, stdio: "ignore", windowsHide: true },
    ).unref()
    return
  }
  if (process.platform === "darwin" && macAppName) {
    // AppleScript needs the application name quoted, and the name comes from identify(),
    // never from the URL, so there is nothing in it for a crafted link to inject.
    spawn(
      "osascript",
      ["-e", `tell application ${JSON.stringify(macAppName)} to activate`],
      { detached: true, stdio: "ignore" },
    ).unref()
  }
}

/** The process name of each Windows exe and the application name of each macOS bundle. */
function identify(executable: string): { processName: string; macAppName?: string } {
  const base = executable.split(/[\\/]/).pop() ?? executable
  if (base === "msedge.exe" || base === "Microsoft Edge") return { processName: "msedge", macAppName: "Microsoft Edge.app" }
  if (base === "brave.exe" || base === "Brave Browser") return { processName: "brave", macAppName: "Brave Browser.app" }
  if (base === "Chromium") return { processName: "chromium", macAppName: "Chromium.app" }
  if (base === "chromium") return { processName: "chromium", macAppName: "Chromium.app" }
  return { processName: "chrome", macAppName: "Google Chrome.app" }
}

/** Open a URL in a specific browser where one can be found, reporting when there is none. */
function openInBrowser(url: string, preferred?: string): Effect.Effect<boolean, Error> {
  /**
   * A browser the person picked by hand wins over every discovery path.
   *
   * Discovery guesses at installed locations and can land on a browser the person never
   * uses — no profile, no sign-in, and a consent page that stalls. The configured path is
   * checked first on every platform because it is the only one that is their choice. A
   * stale path (browser uninstalled since) falls through to discovery rather than failing,
   * because the setting outlives the install it was written for.
   */
  if (preferred && preferred.length > 0 && existsSync(preferred)) {
    const who = identify(preferred)
    return launch(preferred, ["--new-window", url]).pipe(
      Effect.andThen(Effect.sync(() => focusBrowserWindow(who.processName, who.macAppName))),
      Effect.as(true),
    )
  }

  /**
   * Launch the browser that is actually installed, and let a failure through.
   *
   * The old version swallowed every launch error and returned success. A browser that
   * exists but refuses to start — a corrupted profile, a machine policy blocking it — then
   * produced no window, no message, and a consent page that timed out five minutes later
   * with the app insisting it had opened Chrome. Returning the failure lets the caller fall
   * back to the system handler, and if that fails too the user is told something real.
   */
  if (process.platform === "win32") {
    const exe = windowsCandidates().find((candidate) => existsSync(candidate))
    if (!exe) return Effect.succeed(false)
    // A consent page the user never sees is the same as no consent page. The browser was often
    // already running and would reuse that window in the background, where the sign-in
    // sits unseen until it times out. Focused by name, so Edge and Brave come forward too.
    const who = identify(exe)
    return launch(exe, ["--new-window", url]).pipe(
      Effect.andThen(Effect.sync(() => focusBrowserWindow(who.processName, who.macAppName))),
      Effect.as(true),
    )
  }

  if (process.platform === "darwin") {
    const app = [MAC_CHROME, MAC_BRAVE, MAC_EDGE, MAC_CHROMIUM].find((path) => existsSync(path))
    if (!app) return Effect.succeed(false)
    const who = identify(app)
    return launch(app, ["--new-window", url]).pipe(
      Effect.andThen(Effect.sync(() => focusBrowserWindow(who.processName, who.macAppName))),
      Effect.as(true),
    )
  }

  const dirs = (process.env["PATH"] ?? "").split(":")
  const found = LINUX_CHROME.find((bin) => dirs.some((dir) => dir.length > 0 && existsSync(join(dir, bin))))
  if (!found) return Effect.succeed(false)
  return launch(found, ["--new-window", url]).pipe(Effect.as(true))
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service

    return Service.of({
      open: Effect.fn("McpBrowser.open")(function* (url: string) {
        /**
         * Try the signed-in profile first, then the system handler.
         *
         * Both are attempted rather than committing to the first: a browser that is present
         * but will not start still deserves the fallback, and a machine with none of them
         * still has a default handler. If every attempt fails the error names what was tried,
         * because "your sign-in did not open" with no reason is the single most confusing
         * thing this flow can say.
         */
        const failures: string[] = []

        // Read on every open rather than at layer build: the path can be set, or changed,
        // while the app is running, and the next sign-in must pick it up without a restart.
        const preferred = (yield* config.get()).mcp_browser?.trim()

        const direct = yield* openInBrowser(url, preferred).pipe(Effect.result)
        if (direct._tag === "Success" && direct.success) return
        if (direct._tag === "Failure") failures.push(`could not launch an installed browser (${direct.failure.message})`)

        const subprocess = yield* Effect.tryPromise({
          try: () => open(url),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        })

        const handed = yield* Effect.callback<boolean, Error>((resume) => {
          const timer = setTimeout(() => resume(Effect.succeed(true)), 500)
          subprocess.on("error", (error) => {
            clearTimeout(timer)
            resume(Effect.fail(error instanceof Error ? error : new Error(String(error))))
          })
          subprocess.on("exit", (code) => {
            if (code === null || code === 0) return
            clearTimeout(timer)
            resume(Effect.fail(new Error(`the system browser handler exited with code ${code}`)))
          })
        })

        if (handed) return

        return yield* Effect.fail(
          new Error(
            `Could not open the sign-in page. Tried every installed Chromium browser and the system handler.` +
              (failures.length > 0 ? ` ${failures.join("; ")}.` : ""),
          ),
        )
      }),
    })
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [Config.node] })

export * as McpBrowser from "./browser"
