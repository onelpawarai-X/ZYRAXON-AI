import WebSocket from 'ws'
import { app } from 'electron'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { write } from './logging'

const WebSocketOpen = 1
type WS = InstanceType<typeof WebSocket> & { readyState: number }

const CONNECTION_HOST = '127.0.0.1'
const DEFAULT_PORT = 34567

let ws: WS | null = null
let messageId = 0
const pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>()
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5
let isConnecting = false
let connectionPort: number | null = null

function getPortFile(): string {
  return join(tmpdir(), 'zyraxon-code-connection-port')
}

function readPort(): number | null {
  try {
    const portFile = getPortFile()
    if (existsSync(portFile)) {
      const port = parseInt(readFileSync(portFile, 'utf-8').trim(), 10)
      if (!isNaN(port)) return port
    }
  } catch {}
  return null
}

function generateId(): string {
  return `${Date.now()}-${++messageId}`
}

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws?.readyState === WebSocketOpen) {
      resolve()
      return
    }

    if (isConnecting) {
      const checkConnection = setInterval(() => {
        if (ws?.readyState === WebSocketOpen) {
          clearInterval(checkConnection)
          resolve()
        } else if (!isConnecting) {
          clearInterval(checkConnection)
          reject(new Error('Connection failed'))
        }
      }, 100)
      return
    }

    isConnecting = true
    const port = connectionPort ?? readPort() ?? DEFAULT_PORT
    connectionPort = port

    write('editor-connection', 'Connecting to ZYRAXON Code', { host: CONNECTION_HOST, port })

    ws = new WebSocket(`ws://${CONNECTION_HOST}:${port}`) as unknown as WS

    ws.on('open', () => {
      write('editor-connection', 'Connected to ZYRAXON Code')
      isConnecting = false
      reconnectAttempts = 0
      resolve()
    })

    ws.on('message', (data: any) => {
      try {
        const message = JSON.parse(data.toString())

        if (message.id && pendingRequests.has(message.id)) {
          const { resolve, reject } = pendingRequests.get(message.id)!
          pendingRequests.delete(message.id)
          if (message.success) {
            resolve(message.data)
          } else {
            reject(new Error(message.error || 'Unknown error'))
          }
        } else if (message.type === 'event') {
          write('editor-connection', 'Received event', { event: message.event, data: message.data })
        }
      } catch (error) {
        write('editor-connection', 'Failed to parse message', { error: error instanceof Error ? error.message : String(error) })
      }
    })

    ws.on('close', () => {
      write('editor-connection', 'Connection closed')
      isConnecting = false

      pendingRequests.forEach(({ reject }) => {
        reject(new Error('Connection closed'))
      })
      pendingRequests.clear()

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++
        write('editor-connection', 'Reconnecting...', { attempt: reconnectAttempts })
        setTimeout(() => connect(), 1000 * reconnectAttempts)
      }
    })

    ws.on('error', (error: any) => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      write('editor-connection', 'Connection error', { error: errorMessage })
      isConnecting = false

      if (ws?.readyState !== WebSocketOpen) {
        reject(new Error(errorMessage))
      }
    })

    setTimeout(() => {
      if (ws?.readyState !== WebSocketOpen && isConnecting) {
        isConnecting = false
        reject(new Error('Connection timeout'))
      }
    }, 5000)
  })
}

async function sendMessage<T>(type: string, payload?: any): Promise<T> {
  if (!ws || ws?.readyState !== WebSocketOpen) {
    await connect()
  }

  return new Promise((resolve, reject) => {
    if (!ws || ws?.readyState !== WebSocketOpen) {
      reject(new Error('Not connected'))
      return
    }

    const id = generateId()
    pendingRequests.set(id, { resolve, reject })

    ws!.send(JSON.stringify({ type, payload, id }))

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error('Request timeout'))
      }
    }, 10000)
  })
}

export async function ensureConnection(): Promise<boolean> {
  try {
    if (ws?.readyState === WebSocketOpen) return true
    await connect()
    return true
  } catch {
    return false
  }
}

export async function launchZyraxonCodeAndConnect(args: string[] = []): Promise<{ ok: boolean; error?: string; pid?: number }> {
  const { spawn } = await import('node:child_process')

  let editorPath: string
  if (app.isPackaged) {
    editorPath = join(process.resourcesPath, 'zyraxon-code', 'zyraxon-code.exe')
  } else {
    editorPath = join(app.getAppPath(), '..', 'zyraxon-code', 'VSCode-win32-x64', 'electron.exe')
  }

  try {
    const child = spawn(editorPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })

    child.unref()

    write('editor-connection', 'Launched ZYRAXON Code', { pid: child.pid, args })

    await new Promise(resolve => setTimeout(resolve, 2000))

    const connected = await ensureConnection()
    if (connected) {
      return { ok: true, pid: child.pid ?? 0 }
    } else {
      return { ok: false, error: 'Failed to connect to ZYRAXON Code after launch' }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function openFolderInZyraxonCode(folderPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureConnection()
    return await sendMessage('openFolder', { folderPath })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function openFileInZyraxonCode(filePath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureConnection()
    return await sendMessage('openFile', { filePath })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function getZyraxonCodeStatus(): Promise<{ ok: boolean; error?: string; data?: any }> {
  try {
    await ensureConnection()
    const data = await sendMessage('getStatus')
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function getZyraxonCodeProviders(): Promise<{ ok: boolean; error?: string; data?: any }> {
  try {
    await ensureConnection()
    const data = await sendMessage('getProviders')
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function executeCommandInZyraxonCode(command: string, args: any[] = []): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureConnection()
    return await sendMessage('executeCommand', { command, args })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function disconnectZyraxonCode(): void {
  if (ws) {
    ws.close()
    ws = null
  }
  pendingRequests.clear()
  reconnectAttempts = 0
  connectionPort = null
}

export function isConnected(): boolean {
  return ws?.readyState === WebSocketOpen
}