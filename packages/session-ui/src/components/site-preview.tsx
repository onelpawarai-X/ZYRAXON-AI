// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * Site preview for external links rendered inside the app.
 *
 * Every http(s) anchor gets the site's official favicon inline, a live
 * "homepage" popover on hover (a sandboxed iframe of the site's home page),
 * and a normal open-in-browser click. The popover stays open while the
 * pointer is over either the anchor or the popover itself, and Esc closes it.
 */

export type SiteIcon = { host: string; origin: string; favicon: string }

const FAVICON = (host: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`

export function siteIcon(url: string): SiteIcon | undefined {
  try {
    const parsed = new URL(url)
    if (!/^https?:$/.test(parsed.protocol)) return undefined
    return { host: parsed.hostname, origin: parsed.origin, favicon: FAVICON(parsed.hostname) }
  } catch {
    return undefined
  }
}

export function makeFaviconImg(info: SiteIcon, size = 14): HTMLImageElement {
  const img = document.createElement("img")
  img.src = info.favicon
  img.alt = ""
  img.width = size
  img.height = size
  img.loading = "lazy"
  img.referrerPolicy = "no-referrer"
  img.style.cssText = `width:${size}px;height:${size}px;border-radius:3px;flex-shrink:0;margin-right:5px;vertical-align:-2px;`
  img.onerror = () => {
    if (img.dataset.fallback !== "1") {
      img.dataset.fallback = "1"
      img.src = `${info.origin}/favicon.ico`
      return
    }
    // Last resort: drop the icon, keep the link usable.
    img.remove()
  }
  return img
}

const PREVIEW_WIDTH = 340
const PREVIEW_HEIGHT = 216

let popover: HTMLDivElement | undefined
let showTimer: number | undefined
let hideTimer: number | undefined

function ensurePreviewStyles() {
  if (document.getElementById("zyraxon-site-preview-css")) return
  const style = document.createElement("style")
  style.id = "zyraxon-site-preview-css"
  style.textContent = `
@keyframes site-preview-in {
  from { opacity: 0; transform: translateY(6px) scale(0.97); }
  to { opacity: 1; transform: none; }
}
.site-preview-frame {
  border: 0;
  width: 100%;
  height: ${PREVIEW_HEIGHT - 40}px;
  background: #0b121d;
}
.site-preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 10px;
  background: linear-gradient(180deg, #0d1624, #0b121d);
  border-bottom: 1px solid rgba(103, 232, 249, 0.18);
}
.site-preview-host {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: #e2f4ff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.site-preview-open {
  margin-left: auto;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #040d14;
  background: linear-gradient(120deg, #22d3ee, #34d399);
  border-radius: 5px;
  padding: 4px 8px;
  text-decoration: none;
  flex-shrink: 0;
}
`
  document.head.appendChild(style)
}

export function closeSitePreview() {
  window.clearTimeout(showTimer)
  window.clearTimeout(hideTimer)
  showTimer = undefined
  hideTimer = undefined
  popover?.remove()
  popover = undefined
  window.removeEventListener("keydown", onKeydown, true)
  window.removeEventListener("pointerdown", onPointerDown, true)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.stopPropagation()
    closeSitePreview()
  }
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as Element | null
  if (!popover) return
  if (target && popover.contains(target)) return
  closeSitePreview()
}

function showSitePreview(anchor: HTMLAnchorElement, info: SiteIcon) {
  closeSitePreview()
  ensurePreviewStyles()

  const rect = anchor.getBoundingClientRect()
  const wrap = document.createElement("div")
  wrap.setAttribute("data-site-preview", "true")
  wrap.style.cssText = [
    "position:fixed",
    "z-index:9999",
    `width:${PREVIEW_WIDTH}px`,
    "border-radius:12px",
    "overflow:hidden",
    "background:#0b121d",
    "border:1px solid rgba(103,232,249,.28)",
    "box-shadow:0 26px 90px rgba(0,0,0,.6),0 0 40px rgba(34,211,238,.14)",
    "animation:site-preview-in .18s ease-out",
  ].join(";")

  const header = document.createElement("div")
  header.className = "site-preview-header"
  const icon = makeFaviconImg(info, 16)
  icon.style.marginRight = "0"
  header.appendChild(icon)
  const host = document.createElement("span")
  host.className = "site-preview-host"
  host.textContent = info.host
  header.appendChild(host)
  const open = document.createElement("a")
  open.className = "site-preview-open"
  open.href = info.origin
  open.target = "_blank"
  open.rel = "noopener noreferrer"
  open.textContent = "Open"
  open.addEventListener("click", () => closeSitePreview())
  header.appendChild(open)

  const iframe = document.createElement("iframe")
  iframe.className = "site-preview-frame"
  iframe.src = info.origin
  iframe.title = info.host
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups")
  iframe.setAttribute("loading", "eager")
  iframe.setAttribute("referrerpolicy", "no-referrer")

  wrap.appendChild(header)
  wrap.appendChild(iframe)

  const left = Math.min(Math.max(8, rect.left), window.innerWidth - PREVIEW_WIDTH - 8)
  let top = rect.bottom + 8
  if (top + PREVIEW_HEIGHT > window.innerHeight - 8) top = rect.top - PREVIEW_HEIGHT - 8
  if (top < 8) top = 8
  wrap.style.left = `${Math.round(left)}px`
  wrap.style.top = `${Math.round(top)}px`

  wrap.addEventListener("mouseenter", () => window.clearTimeout(hideTimer))
  wrap.addEventListener("mouseleave", () => {
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(closeSitePreview, 280)
  })

  document.body.appendChild(wrap)
  popover = wrap
  window.addEventListener("keydown", onKeydown, true)
  window.addEventListener("pointerdown", onPointerDown, true)
}

export function attachSitePreview(anchor: HTMLAnchorElement, url: string) {
  const info = siteIcon(url)
  if (!info) return
  if (anchor.dataset.siteIcon === "true") return
  anchor.dataset.siteIcon = "true"

  if (!anchor.querySelector("img.zyraxon-site-favicon")) {
    const img = makeFaviconImg(info, 14)
    img.className = "zyraxon-site-favicon"
    anchor.prepend(img)
  }

  if (anchor.target !== "_blank") {
    anchor.target = "_blank"
    anchor.rel = "noopener noreferrer"
  }

  anchor.addEventListener("mouseenter", () => {
    window.clearTimeout(hideTimer)
    window.clearTimeout(showTimer)
    showTimer = window.setTimeout(() => showSitePreview(anchor, info), 400)
  })
  anchor.addEventListener("mouseleave", () => {
    window.clearTimeout(showTimer)
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(closeSitePreview, 320)
  })
}

export function decorateSiteLinks(root: HTMLElement) {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="http://"], a[href^="https://"]'))
  for (const anchor of anchors) {
    if (anchor.closest("pre, code, [data-component]")) continue
    attachSitePreview(anchor, anchor.getAttribute("href") ?? "")
  }
}
