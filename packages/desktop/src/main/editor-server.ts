import { app } from "electron"
import { join } from "node:path"
import { write } from "./logging"
import {
  launchZyraxonCodeAndConnect,
  openFolderInZyraxonCode,
  openFileInZyraxonCode,
  getZyraxonCodeStatus,
  getZyraxonCodeProviders,
  executeCommandInZyraxonCode,
  disconnectZyraxonCode,
  isConnected,
} from "./zyraxon-code-connection"

export function editorExtensionsDir(): string {
  return join(app.getPath("userData"), "editor", "extensions")
}

let editorPid: number | null = null

export async function launchZyraxonCode(args: string[] = []): Promise<{ ok: boolean; error?: string; pid?: number }> {
  const result = await launchZyraxonCodeAndConnect(args)
  if (result.ok && result.pid) {
    editorPid = result.pid
  }
  return result
}

export async function launchZyraxonCodeWithFolder(folderPath: string): Promise<{ ok: boolean; error?: string; pid?: number }> {
  return launchZyraxonCode([folderPath])
}

export async function openFolderInEditor(folderPath: string): Promise<{ ok: boolean; error?: string }> {
  return openFolderInZyraxonCode(folderPath)
}

export async function openFileInEditor(filePath: string): Promise<{ ok: boolean; error?: string }> {
  return openFileInZyraxonCode(filePath)
}

export async function getEditorStatus(): Promise<{ ok: boolean; error?: string; data?: any }> {
  return getZyraxonCodeStatus()
}

export async function getEditorProviders(): Promise<{ ok: boolean; error?: string; data?: any }> {
  return getZyraxonCodeProviders()
}

export async function executeEditorCommand(command: string, args: any[] = []): Promise<{ ok: boolean; error?: string }> {
  return executeCommandInZyraxonCode(command, args)
}

export function getEditorPid(): number | null {
  return editorPid
}

export function isEditorRunning(): boolean {
  return isConnected()
}

export function killEditor(): void {
  disconnectZyraxonCode()
  editorPid = null
}