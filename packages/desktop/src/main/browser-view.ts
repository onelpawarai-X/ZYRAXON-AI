// Copyright (c) 2026 onelpawarai. All rights reserved.

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { BrowserWindow, WebContentsView, app, ipcMain, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from "electron"

export type BrowserBounds = {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

type BrowserPermissionName = "media" | "geolocation" | "notifications" | "clipboard-sanitized-write" | string

export type BrowserPermissionRequest = {
  id: string
  permission: BrowserPermissionName
  requestingUrl?: string
  origin?: string
  isMainFrame?: boolean
}

type PendingPermission = {
  owner: BrowserWindow
  view: WebContentsView
  resolve: (allowed: boolean) => void
}

type BrowserState = {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  secure: boolean
  error?: string
}

type BrowserSlot = {
  owner: BrowserWindow
  view: WebContentsView
  visible: boolean
  reviewMode: boolean
  cleanup: () => void
}

const browserPartition = "persist:zyraxon-browser"
const browserUserAgent = (() => {
  const platformPart =
    process.platform === "darwin"
      ? "Macintosh; Intel Mac OS X 15_0"
      : process.platform === "linux"
        ? "X11; Linux x86_64"
        : "Windows NT 10.0; Win64; x64"
  const chromeVersion = process.versions.chrome || "141.0.0.0"
  return `Mozilla/5.0 (${platformPart}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
})()
const mainRoot = dirname(fileURLToPath(import.meta.url))
const slots = new Map<number, BrowserSlot>()
const pendingPermissions = new Map<string, PendingPermission>()

function ownerFromEvent(event: IpcMainInvokeEvent) {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner || owner.isDestroyed()) throw new Error("browser requires a live ZYRAXON window")
  return owner
}

function normalizeUrl(input: string) {
  const value = input.trim()
  if (!value) return "https://www.google.com/"

  try {
    const url = new URL(value)
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "about:") return url.toString()
  } catch {
    // Treat bare domains and IPs as URLs, everything else as a search query.
  }

  const bareDomain = /^((localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\]|[a-z0-9-]+(?:\.[a-z0-9-]+)+)(:\d+)?(\/|\?|#|$))/i
  if (bareDomain.test(value)) return `https://${value}`
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`
}

function readState(slot: BrowserSlot, error?: string): BrowserState {
  const contents = slot.view.webContents
  const url = contents.isDestroyed() ? "" : contents.getURL()
  return {
    url,
    title: contents.isDestroyed() ? "" : contents.getTitle(),
    loading: contents.isDestroyed() ? false : contents.isLoading(),
    canGoBack: contents.isDestroyed() ? false : contents.navigationHistory.canGoBack(),
    canGoForward: contents.isDestroyed() ? false : contents.navigationHistory.canGoForward(),
    secure: /^https:/i.test(url),
    ...(error ? { error } : {}),
  }
}

function sendState(slot: BrowserSlot, error?: string) {
  if (slot.owner.isDestroyed()) return
  slot.owner.webContents.send("browser-state", readState(slot, error))
}

function browserSession() {
  const browserSessionValue = session.fromPartition(browserPartition, { cache: true })
  browserSessionValue.setUserAgent(browserUserAgent)
  browserSessionValue.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const slot = [...slots.values()].find((entry) => entry.view.webContents.id === webContents.id)
    if (!slot || slot.owner.isDestroyed()) {
      callback(false)
      return
    }

    const request = details as { requestingUrl?: string; isMainFrame?: boolean; origin?: string }
    const id = `${slot.owner.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`
    pendingPermissions.set(id, { owner: slot.owner, view: slot.view, resolve: callback })
    slot.owner.webContents.send("browser-permission-request", {
      id,
      permission,
      requestingUrl: request.requestingUrl,
      origin: request.origin,
      isMainFrame: request.isMainFrame,
    } satisfies BrowserPermissionRequest)
  })
  return browserSessionValue
}

function hide(slot: BrowserSlot) {
  if (!slot.visible) return
  slot.visible = false
  try {
    slot.owner.contentView.removeChildView(slot.view)
  } catch {}
}

function show(slot: BrowserSlot, bounds: BrowserBounds) {
  const owner = slot.owner
  if (owner.isDestroyed()) return
  const x = Math.max(0, Math.floor(bounds.x))
  const y = Math.max(0, Math.floor(bounds.y))
  const width = Math.max(0, Math.floor(bounds.width))
  const height = Math.max(0, Math.floor(bounds.height))
  slot.view.setBounds({ x, y, width, height })
  if (slot.visible) return
  slot.visible = true
  owner.contentView.addChildView(slot.view)
}

function destroy(key: number) {
  const slot = slots.get(key)
  if (!slot) return
  hide(slot)
  slot.cleanup()
  try {
    if (!slot.view.webContents.isDestroyed()) slot.view.webContents.close()
  } catch {}
  slots.delete(key)
  for (const [id, pending] of pendingPermissions) {
    if (pending.owner === slot.owner) {
      pending.resolve(false)
      pendingPermissions.delete(id)
    }
  }
}

function ensureSlot(owner: BrowserWindow) {
  const key = owner.id
  const existing = slots.get(key)
  if (existing && existing.owner === owner && !owner.isDestroyed()) return existing
  if (existing) destroy(key)

  const view = new WebContentsView({
    webPreferences: {
      partition: browserPartition,
      preload: join(mainRoot, "../preload/browser-review.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      backgroundThrottling: true,
    },
  })
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  view.webContents.setUserAgent(browserUserAgent)

  const cleanupHandlers: Array<() => void> = []
  const onState = () => {
    const slot = slots.get(key)
    if (slot) sendState(slot)
  }
  const onFailLoad = (_event: unknown, code: number, description: string, validatedURL: string) => {
    const slot = slots.get(key)
    if (slot) sendState(slot, `Load failed (${code}): ${description} — ${validatedURL}`)
  }
  view.webContents.on("did-start-loading", onState)
  view.webContents.on("did-stop-loading", onState)
  view.webContents.on("page-title-updated", onState)
  view.webContents.on("did-navigate", onState)
  view.webContents.on("did-navigate-in-page", onState)
  view.webContents.on("did-fail-load", onFailLoad)
  const onDomReady = () => {
    const slot = slots.get(key)
    if (slot) view.webContents.send("browser-review-mode", slot.reviewMode)
  }
  const onIpcMessage = (_event: unknown, channel: string, payload?: unknown) => {
    const slot = slots.get(key)
    if (!slot || slot.owner.isDestroyed()) return
    if (channel === "browser-review-selection") {
      slot.owner.webContents.send("browser-review-selection", payload)
      return
    }
    if (channel === "browser-review-toggle") {
      slot.reviewMode = !slot.reviewMode
      view.webContents.send("browser-review-mode", slot.reviewMode)
      slot.owner.webContents.send("browser-review-mode-changed", slot.reviewMode)
      return
    }
    if (channel === "browser-review-mode-exit") {
      slot.reviewMode = false
      view.webContents.send("browser-review-mode", false)
      slot.owner.webContents.send("browser-review-mode-changed", false)
    }
  }
  view.webContents.on("dom-ready", onDomReady)
  view.webContents.on("ipc-message", onIpcMessage)
  cleanupHandlers.push(() => {
    view.webContents.off("did-start-loading", onState)
    view.webContents.off("did-stop-loading", onState)
    view.webContents.off("page-title-updated", onState)
    view.webContents.off("did-navigate", onState)
    view.webContents.off("did-navigate-in-page", onState)
    view.webContents.off("did-fail-load", onFailLoad)
    view.webContents.off("dom-ready", onDomReady)
    view.webContents.off("ipc-message", onIpcMessage)
  })

  view.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: "deny" }
  })

  const cleanup = () => {
    for (const dispose of cleanupHandlers) dispose()
  }
  const slot: BrowserSlot = { owner, view, visible: false, reviewMode: false, cleanup }
  slots.set(key, slot)
  owner.once("closed", () => destroy(key))
  return slot
}

export function registerBrowserIpcHandlers() {
  if (!app.isReady()) app.once("ready", browserSession)
  else browserSession()

  ipcMain.handle("browser-create", (event, url?: unknown) => {
    const owner = ownerFromEvent(event)
    const slot = ensureSlot(owner)
    const target = typeof url === "string" ? normalizeUrl(url) : "https://www.google.com/"
    if (slot.view.webContents.getURL() !== target) void slot.view.webContents.loadURL(target)
    return true
  })

  ipcMain.handle("browser-navigate", (event, input: unknown) => {
    const owner = ownerFromEvent(event)
    const slot = ensureSlot(owner)
    if (typeof input !== "string" || input.trim().length === 0) return false
    void slot.view.webContents.loadURL(normalizeUrl(input))
    return true
  })

  ipcMain.handle("browser-back", (event) => {
    const owner = ownerFromEvent(event)
    const slot = ensureSlot(owner)
    if (!slot.view.webContents.navigationHistory.canGoBack()) return false
    slot.view.webContents.navigationHistory.goBack()
    return true
  })

  ipcMain.handle("browser-forward", (event) => {
    const owner = ownerFromEvent(event)
    const slot = ensureSlot(owner)
    if (!slot.view.webContents.navigationHistory.canGoForward()) return false
    slot.view.webContents.navigationHistory.goForward()
    return true
  })

  ipcMain.handle("browser-reload", (event) => {
    const slot = ensureSlot(ownerFromEvent(event))
    slot.view.webContents.reload()
    return true
  })

  ipcMain.handle("browser-stop", (event) => {
    const slot = ensureSlot(ownerFromEvent(event))
    slot.view.webContents.stop()
    return true
  })

  ipcMain.handle("browser-set-bounds", (event, bounds: unknown) => {
    const owner = ownerFromEvent(event)
    const input = bounds as Partial<BrowserBounds> | null
    if (!input || typeof input !== "object") return false
    const slot = ensureSlot(owner)
    const visible = input.visible === true
    if (!visible) {
      hide(slot)
      return true
    }
    const width = Number(input.width)
    const height = Number(input.height)
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      hide(slot)
      return true
    }
    show(slot, {
      x: Number(input.x) || 0,
      y: Number(input.y) || 0,
      width,
      height,
      visible: true,
    })
    return true
  })

  ipcMain.handle("browser-get-state", (event) => {
    const slot = ensureSlot(ownerFromEvent(event))
    return readState(slot)
  })

  ipcMain.handle("browser-open-external", (event) => {
    const slot = ensureSlot(ownerFromEvent(event))
    const url = slot.view.webContents.getURL()
    if (url) void shell.openExternal(url)
    return true
  })

  ipcMain.handle("browser-permission-response", (event, response: unknown) => {
    const owner = ownerFromEvent(event)
    const input = response as { id?: unknown; allowed?: unknown } | null
    if (!input || typeof input.id !== "string") return false
    const pending = pendingPermissions.get(input.id)
    if (!pending || pending.owner !== owner) return false
    const allowed = input.allowed === true
    pending.resolve(allowed)
    pendingPermissions.delete(input.id)
    return true
  })

  ipcMain.handle("browser-set-review-mode", (event, value: unknown) => {
    const slot = ensureSlot(ownerFromEvent(event))
    const enabled = value === true
    slot.reviewMode = enabled
    slot.view.webContents.send("browser-review-mode", enabled)
    slot.owner.webContents.send("browser-review-mode-changed", enabled)
    return true
  })

  ipcMain.handle("browser-get-review-mode", (event) => {
    const slot = ensureSlot(ownerFromEvent(event))
    return slot.reviewMode
  })

  app.on("before-quit", () => {
    for (const key of [...slots.keys()]) destroy(key)
  })
}
