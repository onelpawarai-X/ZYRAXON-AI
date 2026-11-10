// Copyright (c) 2026 onelpawarai. All rights reserved.

import * as vscode from "vscode"
import { spawn, type ChildProcess } from "node:child_process"
import * as fs from "node:fs"
import * as net from "node:net"
import * as os from "node:os"
import * as path from "node:path"

const TERMINAL_NAME = "zyraxon"
const START_TIMEOUT_MS = 30_000

let serverProcess: ChildProcess | undefined
let serverPort: number | undefined
let appPanel: vscode.WebviewPanel | undefined

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("zyraxon.openTerminal", () => openApp(context, false)),
    vscode.commands.registerCommand("zyraxon.openNewTerminal", () => openApp(context, true)),
    vscode.commands.registerCommand("zyraxon.openCliTerminal", () => openCliTerminal(context)),
    vscode.commands.registerCommand("zyraxon.addFilepathToTerminal", () => addActiveFile()),
    { dispose: () => stopServer() },
  )
}

export function deactivate() {
  stopServer()
}

// The whole application ships as a single binary per platform (server + embedded
// web UI + API + agent runtime). The extension only locates it, runs it, and
// points a webview at it, so nothing has to be installed on the user's machine.
function platformKey() {
  const arch = process.arch
  if (process.platform === "darwin") return arch === "arm64" ? "zyraxon-darwin-arm64" : "zyraxon-darwin-x64"
  if (process.platform === "linux") return arch === "arm64" ? "zyraxon-linux-arm64" : "zyraxon-linux-x64"
  if (process.platform === "win32") return arch === "arm64" ? "zyraxon-windows-arm64" : "zyraxon-windows-x64"
  return `zyraxon-${process.platform}-${arch}`
}

function binaryPath(context: vscode.ExtensionContext) {
  const name = process.platform === "win32" ? "zyraxon.exe" : "zyraxon"
  return [
    path.join(context.extensionPath, "bin", name),
    path.join(context.extensionPath, "bin", platformKey(), name),
  ].find((candidate) => fs.existsSync(candidate))
}

function workspaceCwd() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir()
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.on("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      const port = typeof address === "object" && address ? address.port : 0
      probe.close(() => (port ? resolve(port) : reject(new Error("no free port available"))))
    })
  })
}

async function ping(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`)
    return response.ok
  } catch {
    return false
  }
}

async function waitForServer(port: number) {
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await ping(port)) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`ZYRAXON server did not start on port ${port}`)
}

async function ensureServer(context: vscode.ExtensionContext) {
  if (serverProcess && serverPort && (await ping(serverPort))) return serverPort

  stopServer()

  const binary = binaryPath(context)
  if (!binary) {
    throw new Error(`ZYRAXON server binary not found in this extension for ${platformKey()}`)
  }
  if (process.platform !== "win32") fs.chmodSync(binary, 0o755)

  const port = await freePort()
  const child = spawn(binary, ["serve", "--port", String(port)], {
    cwd: workspaceCwd(),
    env: { ...process.env, ZYRAXON_CALLER: "vscode" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.on("exit", () => {
    if (serverProcess === child) {
      serverProcess = undefined
      serverPort = undefined
    }
  })

  serverProcess = child
  serverPort = port
  await waitForServer(port)
  return port
}

function stopServer() {
  if (serverProcess) {
    try {
      serverProcess.kill()
    } catch {}
  }
  serverProcess = undefined
  serverPort = undefined
}

function appHtml(port: number) {
  const origin = `http://127.0.0.1:${port}`
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; frame-src ${origin} http://localhost:${port}; style-src 'unsafe-inline';"
    />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
      iframe { border: 0; width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>
    <iframe src="${origin}/" allow="clipboard-read; clipboard-write"></iframe>
  </body>
</html>`
}

async function openApp(context: vscode.ExtensionContext, forceNew: boolean) {
  const port = await ensureServer(context)
  if (appPanel && !forceNew) {
    appPanel.reveal(appPanel.viewColumn ?? vscode.ViewColumn.Beside)
    return
  }

  appPanel?.dispose()
  const panel = vscode.window.createWebviewPanel("zyraxon.app", "ZYRAXON", vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  })
  panel.webview.html = appHtml(port)
  panel.onDidDispose(() => {
    if (appPanel === panel) appPanel = undefined
  })
  appPanel = panel
}

function openCliTerminal(context: vscode.ExtensionContext) {
  const existing = vscode.window.terminals.find((terminal) => terminal.name === TERMINAL_NAME)
  if (existing) {
    existing.show()
    return
  }

  const binary = binaryPath(context)
  if (!binary) {
    void vscode.window.showErrorMessage(`ZYRAXON binary not found for ${platformKey()}`)
    return
  }

  const terminal = vscode.window.createTerminal({
    name: TERMINAL_NAME,
    cwd: workspaceCwd(),
    env: { ZYRAXON_CALLER: "vscode" },
  })
  terminal.show()
  terminal.sendText(`"${binary}"`)
}

async function addActiveFile() {
  const fileRef = getActiveFile()
  if (!fileRef) return

  if (serverPort && (await ping(serverPort))) {
    try {
      await fetch(`http://127.0.0.1:${serverPort}/tui/append-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fileRef }),
      })
      appPanel?.reveal()
      return
    } catch {}
  }

  vscode.window.activeTerminal?.sendText(fileRef, false)
}

function getActiveFile() {
  const activeEditor = vscode.window.activeTextEditor
  if (!activeEditor) return

  const document = activeEditor.document
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  if (!workspaceFolder) return

  const relativePath = vscode.workspace.asRelativePath(document.uri)
  let filepathWithAt = `@${relativePath}`

  const selection = activeEditor.selection
  if (!selection.isEmpty) {
    const startLine = selection.start.line + 1
    const endLine = selection.end.line + 1
    filepathWithAt += startLine === endLine ? `#L${startLine}` : `#L${startLine}-${endLine}`
  }

  return filepathWithAt
}
