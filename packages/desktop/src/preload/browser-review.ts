// Copyright (c) 2026 onelpawarai. All rights reserved.

import { ipcRenderer } from "electron"

type ReviewPayload = {
  url: string
  title: string
  selector: string
  text: string
  rect: { x: number; y: number; width: number; height: number }
  html: string
}

let enabled = false
let highlighted: Element | undefined
const originalOutline = new WeakMap<Element, string>()

ipcRenderer.on("browser-review-mode", (_event, next: boolean) => {
  enabled = Boolean(next)
  if (!enabled) clearHighlight()
})

function escapeIdentifier(value: string) {
  return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1")
}

function selectorFor(element: Element) {
  if (element.id) return `#${escapeIdentifier(element.id)}`
  const parts: string[] = []
  let current: Element | null = element
  for (let depth = 0; depth < 6 && current && current instanceof HTMLElement; depth += 1) {
    if (current.id) {
      parts.unshift(`#${escapeIdentifier(current.id)}`)
      break
    }
    const tag = current.tagName.toLowerCase()
    const classes = [...current.classList]
      .filter((name) => /^[a-zA-Z0-9_-]+$/.test(name))
      .slice(0, 2)
      .map((name) => `.${escapeIdentifier(name)}`)
      .join("")
    const parent: Element | null = current.parentElement
    const siblings = parent
      ? [...parent.children].filter((child) => child.tagName === current!.tagName)
      : []
    const index = siblings.indexOf(current) + 1
    const suffix = siblings.length > 1 ? `:nth-of-type(${index})` : ""
    parts.unshift(`${tag}${classes}${suffix}`)
    current = parent
  }
  return parts.join(" > ")
}

function clearHighlight() {
  if (!highlighted) return
  const previous = originalOutline.get(highlighted)
  if (previous !== undefined) (highlighted as HTMLElement).style.outline = previous
  else (highlighted as HTMLElement).style.outline = ""
  highlighted = undefined
}

function highlight(element: Element) {
  if (element === highlighted) return
  clearHighlight()
  if (element instanceof HTMLElement) {
    originalOutline.set(element, element.style.outline)
    element.style.outline = "2px solid #00D4FF"
    element.style.outlineOffset = "2px"
    highlighted = element
  }
}

function payload(element: Element): ReviewPayload {
  const rect = element.getBoundingClientRect()
  return {
    url: location.href,
    title: document.title,
    selector: selectorFor(element),
    text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 500),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    html: (element as HTMLElement).outerHTML.slice(0, 2000),
  }
}

document.addEventListener(
  "mouseover",
  (event) => {
    if (!enabled) return
    const target = event.target instanceof Element ? event.target : undefined
    if (target && target !== document.documentElement && target !== document.body) highlight(target)
  },
  true,
)

document.addEventListener(
  "mouseout",
  (event) => {
    if (!enabled) return
    const target = event.target instanceof Element ? event.target : undefined
    if (target && highlighted && target === highlighted) clearHighlight()
  },
  true,
)

document.addEventListener(
  "click",
  (event) => {
    if (!enabled) return
    const target = event.target instanceof Element ? event.target : undefined
    if (!target) return
    event.preventDefault()
    event.stopImmediatePropagation()
    ipcRenderer.send("browser-review-selection", payload(target))
  },
  true,
)

document.addEventListener(
  "keydown",
  (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === "KeyC") {
      event.preventDefault()
      event.stopImmediatePropagation()
      ipcRenderer.send("browser-review-toggle")
      return
    }
    if (event.key === "Escape" && enabled) {
      enabled = false
      clearHighlight()
      ipcRenderer.send("browser-review-mode-exit")
    }
  },
  true,
)

if (document.readyState === "complete") {
  // Preload may run before the document is available; listeners above are enough otherwise.
}
