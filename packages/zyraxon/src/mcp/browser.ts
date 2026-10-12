// Copyright (c) 2026 onelpawarai. All rights reserved.

import { LayerNode } from "@zyraxon-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import * as os from "os"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import open from "open"
import { join } from "node:path"
import { Config } from "@/config/config"

/**
 * Open a URL in whatever browser this machine actually has — no fixed path,
 * no Effect v4 APIs that no longer exist. Windows, macOS and Linux each fall
 * through their own chain, and only a total failure reports `false`.
 *
 * Every launcher is spawned detached and resolves on `spawn`, never on exit.
 * `child_process.exec` waits for the child to *exit*, and a browser stays open
 * for the whole session — so the old exec-based version resolved only when the
 * person closed the browser. On a real desktop that meant this function never
 * returned, the fallback chain below it never ran, and the sign-in appeared to
 * hang with no window. Resolving on spawn is what makes it return immediately.
 */
export async function openBrowser(targetUrl: string): Promise<boolean> {
  const platform = os.platform();
  const url = targetUrl.trim();

  // Resolve as soon as the process is launched. A browser that is present but
  // cannot start (no display, blocked by policy) still rejects, so the caller
  // can fall through to the next candidate instead of claiming success.
  //
  // A browser that stays open is a launch; a browser that refuses to start exits
  // within a few hundred milliseconds. Resolving purely on the `spawn` event could
  // not tell those apart — a container without a usable sandbox aborts immediately,
  // `spawn` still fires, and the caller reported success for a window that never
  // appeared. The grace period below is what separates the two.
  const launchDetached = (command: string, args: string[]) =>
    new Promise<boolean>((resolve) => {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      child.once("error", () => done(false));
      // Exit code 0 is the "handed the URL to an already-running browser" case.
      child.once("exit", (code) => done(code === 0));
      child.once("spawn", () => {
        child.unref();
        setTimeout(() => done(true), 900);
      });
    });

  // `start` is a cmd.exe built-in, so it only exists inside a shell. Handing it to
  // child_process.exec looked for a program literally named `start`, which is not
  // on disk, so the call rejected and no sign-in window ever appeared. Windows now
  // goes through cmd.exe, and every platform falls back to the OS default handler
  // so a machine without Chrome still opens something.
  const viaCmd = (command: string) =>
    new Promise<boolean>((resolve) => {
      const child = spawn("cmd.exe", ["/c", command], { detached: true, stdio: "ignore", windowsHide: true });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        // `start` detaches the browser and returns immediately, so a short grace
        // period is what separates "opened" from "failed to find a shell".
        setTimeout(() => resolve(true), 350);
      });
    });

  const openDefault = () =>
    new Promise<boolean>((resolve) => {
      const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    });

  try {
    if (platform === "darwin") {
      // Prefer the signed-in profiles, then whatever the OS default is.
      for (const app of ["Google Chrome", "Brave Browser", "Microsoft Edge", "Chromium"]) {
        if (await launchDetached("open", ["-a", app, url])) return true;
      }
      return await launchDetached("open", [url]);
    }

    if (platform === "win32") {
      const chrome = [
        process.env["LOCALAPPDATA"] && join(process.env["LOCALAPPDATA"], "Google", "Chrome", "Application", "chrome.exe"),
        process.env["PROGRAMFILES"] && join(process.env["PROGRAMFILES"], "Google", "Chrome", "Application", "chrome.exe"),
        process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
        process.env["LOCALAPPDATA"] && join(process.env["LOCALAPPDATA"], "Microsoft", "Edge", "Application", "msedge.exe"),
      ].filter((p): p is string => Boolean(p && existsSync(p)))
      for (const exe of chrome) {
        if (await launchDetached(exe, ["--new-window", url])) return true
      }
      return await viaCmd(`start "" "${url}"`)
    }

    // Linux: a real Chromium-family binary first, then the OS default handler.
    // `xdg-open` alone was the old last resort, and on a machine with no text
    // browser installed it printed "no method available" and opened nothing.
    const linuxBrowsers = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser"]
    const dirs = (process.env["PATH"] ?? "").split(":")
    for (const bin of linuxBrowsers) {
      const full = dirs
        .map((dir) => (dir.length > 0 ? join(dir, bin) : ""))
        .find((candidate) => candidate.length > 0 && existsSync(candidate))
      if (!full) continue
      if (await launchDetached(full, ["--new-window", url])) return true
      // Containers and hardened distros ship without a usable Chromium sandbox, so the
      // first attempt aborts before a window exists. Retrying unconfined is the right
      // trade for a sign-in page in a session the user already trusts; without it the
      // whole OAuth flow is unreachable on those machines.
      if (await launchDetached(full, ["--no-sandbox", "--new-window", url])) return true
    }
    return await openDefault()
  } catch (error) {
    console.error("Failed to open browser:", error);
    return false;
  }
}

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
        let settled = false
        const done = (error?: Error) => {
          if (settled) return
          settled = true
          if (error) reject(error)
          else resolve()
        }
        child.once("error", (error) => done(error instanceof Error ? error : new Error(String(error))))
        // A browser that starts and stays open is a launch. One that aborts within
        // the grace period — no usable sandbox, no display, blocked by policy — must
        // reject so the caller can fall back instead of claiming a window opened.
        child.once("exit", (code) => done(code === 0 ? undefined : new Error(`${command} exited with code ${code}`)))
        child.once("spawn", () => {
          child.unref()
          // Chrome stays alive for the whole session, so never wait on exit.
          setTimeout(() => done(), 900)
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
      // The picked browser can hit the same missing-sandbox abort on Linux, and there is
      // no discovery fallback below this branch, so retry unconfined before giving up.
      Effect.catch(() => launch(preferred, ["--no-sandbox", "--new-window", url])),
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
  return launch(found, ["--new-window", url]).pipe(
    // Containers and hardened distros ship without a usable Chromium sandbox, so the
    // first attempt aborts before a window exists. Retrying unconfined is the right
    // trade for a sign-in page in a session the user already trusts; without it the
    // whole OAuth flow is unreachable on those machines.
    Effect.catch(() => launch(found, ["--no-sandbox", "--new-window", url])),
    Effect.as(true),
  )
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service

    return Service.of({
      open: Effect.fn("McpBrowser.open")(function* (url: string) {
        /**
         * Inside Electron the sidecar is a utility process, not a desktop session.
         *
         * A sign-in page handed to a shell command from here either opens nothing or
         * opens a window the app never learns about, and the desktop's own
         * `open-external` handler — which uses the OS handler and comes to the front —
         * never runs. The message below is what that handler is listening for, so it
         * is tried before any local launch. Falling through on a thrown postMessage
         * keeps the rest of this function working when ZYRAXON runs as a plain CLI.
         */
        const parentPort = (process as unknown as { parentPort?: { postMessage: (msg: unknown) => void } })
          .parentPort
        if (parentPort && typeof parentPort.postMessage === "function") {
          try {
            parentPort.postMessage({ type: "open-external", url })
            return
          } catch {
            // The desktop process is gone or refused the message; fall through to the
            // local launchers rather than reporting a failure that may not be real.
          }
        }

        /**
         * The dynamic opener next: it knows no paths, so it cannot be defeated by an
         * install in an unexpected place, and it answers for Windows, macOS and Linux
         * alike. Everything below stays as the fallback for the case where every shell
         * attempt fails, so a browser still opens through discovery or the OS handler.
         */
        const dynamic = yield* Effect.tryPromise({
          try: () => openBrowser(url),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        })
        if (dynamic) return

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
