import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { app, utilityProcess } from "electron"
import type { Details } from "electron"
import { getLogger } from "./logging"
import { getUserShell, loadShellEnv } from "./shell-env"
import { getStore } from "./store"
import { DEFAULT_SERVER_URL_KEY } from "./store-keys"

export type HealthCheck = { wait: Promise<void> }

type SidecarMessage =
  | { type: "ready" }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } }

export type SidecarListener = { stop: () => Promise<void> }

const SIDECAR_SERVICE_NAME = "zyraxon server"
const SIDECAR_START_STALL_TIMEOUT = 60_000
const SIDECAR_STOP_TIMEOUT = 6_000

type SpawnLocalServerOptions = {
  userDataPath: string
  onStdout?: (message: string) => void
  onStderr?: (message: string) => void
  onExit?: (code: number) => void
}

export function getDefaultServerUrl(): string | null {
  const value = getStore().get(DEFAULT_SERVER_URL_KEY)
  return typeof value === "string" ? value : null
}

export function setDefaultServerUrl(url: string | null) {
  if (url) {
    getStore().set(DEFAULT_SERVER_URL_KEY, url)
    return
  }

  getStore().delete(DEFAULT_SERVER_URL_KEY)
}

export function preferAppEnv(userDataPath: string) {
  const shell = process.platform === "win32" ? null : getUserShell()
  Object.assign(process.env, {
    ...(shell ? loadShellEnv(shell, getLogger()) : null),
    ZYRAXON_EXPERIMENTAL_ICON_DISCOVERY: "true",
    ZYRAXON_EXPERIMENTAL_FILEWATCHER: "true",
    ZYRAXON_CLIENT: "desktop",
    XDG_STATE_HOME: process.env.XDG_STATE_HOME ?? userDataPath,
  })
}

export async function spawnLocalServer(
  hostname: string,
  port: number,
  password: string,
  options: SpawnLocalServerOptions,
) {
  const sidecar = join(dirname(fileURLToPath(import.meta.url)), "sidecar.js")
  console.log("[Server] Spawning sidecar process:", sidecar)

  const child = utilityProcess.fork(sidecar, [], {
    cwd: process.cwd(),
    env: createSidecarEnv(),
    serviceName: SIDECAR_SERVICE_NAME,
    stdio: "pipe",
  })
  let exited = false
  const exit = defer<number>()

  const onProcessGone = (_event: unknown, details: Details) => {
    if (details.type !== "Utility" || details.name !== SIDECAR_SERVICE_NAME) return
    const errorMsg = `utility process gone reason=${details.reason} exitCode=${details.exitCode}`
    console.error("[Server] Process gone:", errorMsg)
    options.onStderr?.(errorMsg)
  }

  app.on("child-process-gone", onProcessGone)
  child.once("exit", (code) => {
    exited = true
    app.off("child-process-gone", onProcessGone)
    console.log("[Server] Sidecar process exited with code:", code)
    options.onExit?.(code)
    exit.resolve(code)
  })
  child.on("error", (error) => {
    const errorMsg = `utility process error: ${serializeError(error).message}`
    console.error("[Server] Process error:", errorMsg)
    options.onStderr?.(errorMsg)
  })

  child.stdout?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf8").trimEnd()
    console.log("[Server] STDOUT:", msg)
    options.onStdout?.(msg)
  })
  child.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf8").trimEnd()
    console.error("[Server] STDERR:", msg)
    options.onStderr?.(msg)
  })

  await new Promise<void>((resolve, reject) => {
    let done = false
    let timeout: NodeJS.Timeout

    const fail = (error: Error) => {
      if (done) return
      done = true
      console.error("[Server] Sidecar startup failed:", error.message)
      cleanup()
      reject(error)
    }

    const refreshTimeout = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        const timeoutError = new Error(`Sidecar did not become ready within ${SIDECAR_START_STALL_TIMEOUT}ms: ${sidecar}`)
        console.error("[Server] Startup timeout:", timeoutError.message)
        fail(timeoutError)
      }, SIDECAR_START_STALL_TIMEOUT)
    }

    const onMessage = (message: SidecarMessage) => {
      console.log("[Server] Received message from sidecar:", message.type)
      if (message.type === "ready") {
        if (done) return
        done = true
        console.log("[Server] Sidecar is ready")
        cleanup()
        resolve()
        return
      }
      if (message.type === "error") {
        console.error("[Server] Sidecar error:", message.error.message)
        fail(Object.assign(new Error(message.error.message), { stack: message.error.stack }))
      }
    }
    const onExit = (code: number) => {
      const exitError = new Error(`Sidecar exited before ready with code ${code}`)
      console.error("[Server] Sidecar exited early:", exitError.message)
      fail(exitError)
    }
    const cleanup = () => {
      clearTimeout(timeout)
      child.off("message", onMessage)
      child.off("exit", onExit)
    }

    child.on("message", onMessage)
    child.on("exit", onExit)
    refreshTimeout()

    console.log("[Server] Sending start command to sidecar")
    child.postMessage({
      type: "start",
      hostname,
      port,
      password,
      userDataPath: options.userDataPath,
    })
  }).catch((error) => {
    console.error("[Server] Spawn failed, killing sidecar:", error.message)
    if (!exited) child.kill()
    throw error
  })

  const wait = (async () => {
    const url = `http://${hostname}:${port}`
    console.log("[Server] Starting health check for:", url)
    let healthy = false
    const gone = exit.promise.then((code) => {
      if (healthy) return
      const healthError = new Error(`Sidecar exited before health check passed with code ${code}`)
      console.error("[Server] Health check failed:", healthError.message)
      throw healthError
    })

    const ready = async () => {
      let attempts = 0
      while (true) {
        attempts++
        if (attempts % 10 === 0) {
          console.log(`[Server] Health check attempt ${attempts}...`)
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
        if (await checkHealth(url, password)) {
          console.log("[Server] Health check passed after", attempts, "attempts")
          healthy = true
          return
        }
      }
    }

    await Promise.race([ready(), gone])
  })()

  let stopping: Promise<void> | undefined

  return {
    listener: {
      stop: () => {
        if (stopping) return stopping
        if (exited) return Promise.resolve()
        console.log("[Server] Stopping sidecar...")
        child.postMessage({ type: "stop" })
        stopping = Promise.race([
          exit.promise.then(() => undefined),
          delay(SIDECAR_STOP_TIMEOUT).then(() => {
            if (!exited) {
              console.log("[Server] Force killing sidecar due to timeout")
              child.kill()
            }
          }),
        ])
        return stopping
      },
    },
    health: { wait },
  }
}

export async function checkHealth(url: string, password?: string | null): Promise<boolean> {
  let healthUrl: URL
  try {
    healthUrl = new URL("/global/health", url)
  } catch {
    return false
  }

  const headers = new Headers()
  if (password) {
    const auth = Buffer.from(`zyraxon:${password}`).toString("base64")
    headers.set("authorization", `Basic ${auth}`)
  }

  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

function createSidecarEnv(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
  )
  delete env.DEBUG
  if (process.platform === "linux") delete env.LD_PRELOAD
  if (!app.isPackaged) env.ZYRAXON_DISABLE_CHANNEL_DB = "1"
  // Pass resourcesPath so zyraxon server can find MCP configs + wrapper scripts
  if (process.resourcesPath) {
    env.ZYRAXON_RESOURCES_PATH = process.resourcesPath
  }
  return env
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: String(error) }
}

function defer<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
