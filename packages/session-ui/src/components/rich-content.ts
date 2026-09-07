/**
 * Rich Content Renderer — Mermaid, HTML+CSS, SVG, Video, Audio, Notebook Paper
 * Renders special code blocks as visual content in chat messages
 */

// ═══════════════════════════════════════════════════════════════
// MERMAID DIAGRAMS
// ═══════════════════════════════════════════════════════════════

let mermaidLoaded = false
let mermaidLoading = false
let mermaidPromise: Promise<void> | null = null

async function loadMermaid() {
  if (mermaidLoaded) return
  if (mermaidLoading) return mermaidPromise!
  mermaidLoading = true
  mermaidPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"
    script.onload = () => {
      ;(window as any).mermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.dataset.colorScheme === "dark" ? "dark" : "default",
        securityLevel: "loose",
        fontFamily: "Inter, system-ui, sans-serif",
        flowchart: { curve: "basis", padding: 15 },
        sequence: { mirrorActors: false },
      })
      mermaidLoaded = true
      resolve()
    }
    script.onerror = () => reject(new Error("Failed to load mermaid"))
    document.head.appendChild(script)
  })
  return mermaidPromise
}

let mermaidIdCounter = 0

function renderMermaidBlocks(root: HTMLElement) {
  const codeBlocks = root.querySelectorAll("pre > code.language-mermaid, pre > code[class*='language-mer']")
  for (const codeEl of codeBlocks) {
    const pre = codeEl.parentElement as HTMLPreElement
    if (!pre || pre.getAttribute("data-rich-rendered") === "mermaid") continue
    const mermaidText = codeEl.textContent || ""
    if (!mermaidText.trim()) continue

    const container = document.createElement("div")
    container.setAttribute("data-component", "mermaid-diagram")
    container.setAttribute("data-rich-rendered", "mermaid")
    container.style.cssText = "background:var(--v2-background-bg-layer-01,#1a1a2e);border:1px solid var(--v2-border-border-muted,rgba(255,255,255,0.1));border-radius:8px;padding:16px;margin:12px 0;overflow:auto;position:relative;"

    const header = document.createElement("div")
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"
    header.innerHTML = `<div style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--v2-text-text-muted,#888);"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg><span style="font-size:11px;font-weight:600;color:var(--v2-text-text-muted,#888);letter-spacing:0.5px;text-transform:uppercase;">Diagram</span></div><button class="mermaid-expand" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:var(--v2-text-text-muted,#888);font-size:10px;cursor:pointer;">Expand</button>`
    container.appendChild(header)

    const diagramDiv = document.createElement("div")
    diagramDiv.className = "mermaid-svg-container"
    diagramDiv.style.cssText = "display:flex;justify-content:center;overflow:auto;min-height:40px;"
    diagramDiv.textContent = mermaidText
    container.appendChild(diagramDiv)

    pre.replaceWith(container)

    loadMermaid().then(() => {
      const mermaid = (window as any).mermaid
      if (!mermaid) return
      const id = `mermaid-${++mermaidIdCounter}`
      mermaid.render(id, mermaidText).then(({ svg }: { svg: string }) => {
        diagramDiv.innerHTML = svg
        const svgEl = diagramDiv.querySelector("svg")
        if (svgEl) { svgEl.style.maxWidth = "100%"; svgEl.style.height = "auto"; svgEl.removeAttribute("height") }
      }).catch((err: any) => {
        diagramDiv.innerHTML = `<pre style="color:#ef4444;font-size:12px;margin:0;">Diagram error: ${String(err).slice(0, 200)}</pre>`
      })
    }).catch(() => {})

    header.querySelector(".mermaid-expand")?.addEventListener("click", () => {
      const overlay = document.createElement("div")
      overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(8px);"
      const clone = container.cloneNode(true) as HTMLElement
      clone.style.cssText = "max-width:90vw;max-height:90vh;overflow:auto;background:var(--v2-background-bg-layer-01,#1a1a2e);border-radius:12px;padding:24px;"
      overlay.appendChild(clone)
      overlay.addEventListener("click", () => overlay.remove())
      document.body.appendChild(overlay)
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// HTML+CSS INTERACTIVE CONTENT
// ═══════════════════════════════════════════════════════════════

function renderHTMLBlocks(root: HTMLElement) {
  const codeBlocks = root.querySelectorAll("pre > code.language-html, pre > code.language-htm")
  for (const codeEl of codeBlocks) {
    const pre = codeEl.parentElement as HTMLPreElement
    if (!pre || pre.getAttribute("data-rich-rendered") === "html") continue
    const htmlContent = codeEl.textContent || ""
    if (!htmlContent.trim()) continue

    const container = document.createElement("div")
    container.setAttribute("data-component", "html-preview")
    container.setAttribute("data-rich-rendered", "html")
    container.style.cssText = "border:1px solid var(--v2-border-border-muted,rgba(255,255,255,0.1));border-radius:8px;margin:12px 0;overflow:hidden;background:#fff;"

    const header = document.createElement("div")
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--v2-background-bg-layer-01,#1a1a2e);border-bottom:1px solid rgba(255,255,255,0.08);"
    header.innerHTML = `<div style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#f97316;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg><span style="font-size:11px;font-weight:600;color:var(--v2-text-text-muted,#888);letter-spacing:0.5px;text-transform:uppercase;">HTML Preview</span></div><div style="display:flex;gap:4px;"><button class="html-expand" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:var(--v2-text-text-muted,#888);font-size:10px;cursor:pointer;">Full</button><button class="html-source" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:var(--v2-text-text-muted,#888);font-size:10px;cursor:pointer;">Source</button></div>`
    container.appendChild(header)

    const iframe = document.createElement("iframe")
    iframe.style.cssText = "width:100%;min-height:200px;border:none;background:#fff;"
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
    iframe.setAttribute("loading", "lazy")
    container.appendChild(iframe)

    const sourcePre = document.createElement("pre")
    sourcePre.style.cssText = "display:none;margin:0;padding:12px;background:#0d1117;color:#c9d1d9;font-size:12px;overflow:auto;max-height:400px;"
    sourcePre.textContent = htmlContent
    container.appendChild(sourcePre)
    pre.replaceWith(container)

    const wrappedHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:12px;font-family:Inter,system-ui,sans-serif;font-size:14px;}</style></head><body>${htmlContent}</body></html>`
    iframe.srcdoc = wrappedHTML

    header.querySelector(".html-expand")?.addEventListener("click", () => {
      const overlay = document.createElement("div")
      overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(8px);"
      const fullIframe = document.createElement("iframe")
      fullIframe.style.cssText = "width:90vw;height:90vh;border:none;border-radius:12px;background:#fff;"
      fullIframe.srcdoc = wrappedHTML
      overlay.appendChild(fullIframe)
      overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove() })
      document.body.appendChild(overlay)
    })

    let showSource = false
    header.querySelector(".html-source")?.addEventListener("click", () => {
      showSource = !showSource
      iframe.style.display = showSource ? "none" : "block"
      sourcePre.style.display = showSource ? "block" : "none"
      const btn = header.querySelector(".html-source")
      if (btn) btn.textContent = showSource ? "Preview" : "Source"
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// SVG INLINE
// ═══════════════════════════════════════════════════════════════

function renderSVGBlocks(root: HTMLElement) {
  const codeBlocks = root.querySelectorAll("pre > code.language-svg, pre > code.language-xml")
  for (const codeEl of codeBlocks) {
    const pre = codeEl.parentElement as HTMLPreElement
    if (!pre || pre.getAttribute("data-rich-rendered") === "svg") continue
    const svgContent = codeEl.textContent || ""
    if (!svgContent.trim() || !svgContent.includes("<svg")) continue

    const container = document.createElement("div")
    container.setAttribute("data-component", "svg-preview")
    container.setAttribute("data-rich-rendered", "svg")
    container.style.cssText = "border:1px solid var(--v2-border-border-muted,rgba(255,255,255,0.1));border-radius:8px;padding:16px;margin:12px 0;background:var(--v2-background-bg-layer-01,#1a1a2e);overflow:auto;position:relative;"

    const header = document.createElement("div")
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"
    header.innerHTML = `<div style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#8b5cf6;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><span style="font-size:11px;font-weight:600;color:var(--v2-text-text-muted,#888);letter-spacing:0.5px;text-transform:uppercase;">SVG</span></div><div style="display:flex;gap:4px;"><button class="svg-zoom-in" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:var(--v2-text-text-muted,#888);font-size:10px;cursor:pointer;">+</button><button class="svg-zoom-out" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:var(--v2-text-text-muted,#888);font-size:10px;cursor:pointer;">-</button></div>`
    container.appendChild(header)

    const svgDiv = document.createElement("div")
    svgDiv.style.cssText = "display:flex;justify-content:center;overflow:auto;min-height:40px;cursor:grab;"
    svgDiv.innerHTML = svgContent
    container.appendChild(svgDiv)
    pre.replaceWith(container)

    const svgEl = svgDiv.querySelector("svg")
    if (svgEl) { svgEl.style.maxWidth = "100%"; svgEl.style.height = "auto"; svgEl.removeAttribute("height") }

    let zoom = 1
    header.querySelector(".svg-zoom-in")?.addEventListener("click", () => {
      zoom = Math.min(3, zoom + 0.25)
      const svg = svgDiv.querySelector("svg")
      if (svg) svg.style.transform = `scale(${zoom})`
    })
    header.querySelector(".svg-zoom-out")?.addEventListener("click", () => {
      zoom = Math.max(0.25, zoom - 0.25)
      const svg = svgDiv.querySelector("svg")
      if (svg) svg.style.transform = `scale(${zoom})`
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// VIDEO INLINE (YouTube already works, add direct video URLs)
// ═══════════════════════════════════════════════════════════════

const videoUrlRegex = /^https?:\/\/[^\s<>()`"']+\.(mp4|webm|ogg|mov)(\?[^\s<>()`"']*)?$/i

function renderVideoBlocks(root: HTMLElement) {
  // Find text nodes that are direct video URLs
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  const textNodes: Text[] = []
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    if (node.textContent && videoUrlRegex.test(node.textContent.trim())) {
      textNodes.push(node)
    }
  }
  for (const textNode of textNodes) {
    const url = textNode.textContent.trim()
    if (!videoUrlRegex.test(url)) continue

    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-component", "video-embed-wrapper")
    wrapper.style.cssText = "margin:12px 0;"

    const container = document.createElement("div")
    container.setAttribute("data-component", "video-embed")
    container.style.cssText = "position:relative;border-radius:8px;overflow:hidden;background:#000;border:1px solid var(--v2-border-border-muted,rgba(255,255,255,0.1));"

    const video = document.createElement("video")
    video.src = url
    video.controls = true
    video.preload = "metadata"
    video.style.cssText = "width:100%;max-height:400px;display:block;"
    container.appendChild(video)

    const label = document.createElement("div")
    label.style.cssText = "position:absolute;top:8px;left:8px;padding:3px 8px;border-radius:4px;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;backdrop-filter:blur(4px);"
    label.textContent = "Video"
    container.appendChild(label)

    wrapper.appendChild(container)

    const linkRow = document.createElement("div")
    linkRow.style.cssText = "margin-top:6px;"
    const linkEl = document.createElement("a")
    linkEl.href = url
    linkEl.target = "_blank"
    linkEl.rel = "noopener noreferrer"
    linkEl.style.cssText = "color:#3b82f6;text-decoration:none;font-size:12px;word-break:break-all;"
    linkEl.textContent = url
    linkRow.appendChild(linkEl)
    wrapper.appendChild(linkRow)

    textNode.parentNode?.replaceChild(wrapper, textNode)
  }
}

// ═══════════════════════════════════════════════════════════════
// AUDIO INLINE
// ═══════════════════════════════════════════════════════════════

const audioUrlRegex = /^https?:\/\/[^\s<>()`"']+\.(mp3|wav|ogg|flac|aac|m4a)(\?[^\s<>()`"']*)?$/i

function renderAudioBlocks(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  const textNodes: Text[] = []
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    if (node.textContent && audioUrlRegex.test(node.textContent.trim())) {
      textNodes.push(node)
    }
  }
  for (const textNode of textNodes) {
    const url = textNode.textContent.trim()
    if (!audioUrlRegex.test(url)) continue

    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-component", "audio-embed-wrapper")
    wrapper.style.cssText = "margin:12px 0;"

    const container = document.createElement("div")
    container.setAttribute("data-component", "audio-player")
    container.style.cssText = "display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;background:var(--v2-background-bg-layer-01,#1a1a2e);border:1px solid var(--v2-border-border-muted,rgba(255,255,255,0.1));"

    const icon = document.createElement("div")
    icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--v2-text-text-muted,#888);"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
    container.appendChild(icon)

    const audio = document.createElement("audio")
    audio.src = url
    audio.controls = true
    audio.preload = "metadata"
    audio.style.cssText = "flex:1;height:36px;"
    container.appendChild(audio)

    const filename = url.split("/").pop()?.split("?")[0] || "audio"
    const nameEl = document.createElement("div")
    nameEl.style.cssText = "font-size:11px;color:var(--v2-text-text-muted,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;"
    nameEl.textContent = filename
    container.appendChild(nameEl)

    wrapper.appendChild(container)

    const linkRow = document.createElement("div")
    linkRow.style.cssText = "margin-top:6px;"
    const linkEl = document.createElement("a")
    linkEl.href = url
    linkEl.target = "_blank"
    linkEl.rel = "noopener noreferrer"
    linkEl.style.cssText = "color:#3b82f6;text-decoration:none;font-size:12px;word-break:break-all;"
    linkEl.textContent = url
    linkRow.appendChild(linkEl)
    wrapper.appendChild(linkRow)

    textNode.parentNode?.replaceChild(wrapper, textNode)
  }
}

// ═══════════════════════════════════════════════════════════════
// NOTEBOOK PAPER DESIGN (for [notebook] marker)
// ═══════════════════════════════════════════════════════════════

function renderNotebookBlocks(root: HTMLElement) {
  // Look for blockquotes with [notebook] marker or div with notebook class
  const blocks = root.querySelectorAll('blockquote, div[data-markdown-block]')
  for (const block of blocks) {
    const text = block.textContent || ""
    if (!text.includes("[notebook]") && !block.classList.contains("notebook")) continue
    if (block.getAttribute("data-rich-rendered") === "notebook") continue

    // Extract content after [notebook]
    let content = text.replace(/\[notebook\]/, "").trim()
    if (!content) continue

    const container = document.createElement("div")
    container.setAttribute("data-component", "notebook-paper")
    container.setAttribute("data-rich-rendered", "notebook")
    container.style.cssText = `
      background: #fef9e7;
      background-image:
        linear-gradient(transparent 31px, #e8d5b7 31px, #e8d5b7 32px, transparent 32px),
        linear-gradient(90deg, #c5a55a 0px, #c5a55a 1px, transparent 1px);
      background-size: 100% 32px, 80px 100%;
      background-position: 0 -1px, 40px 0;
      padding: 32px 20px 32px 60px;
      border-radius: 8px;
      margin: 12px 0;
      border: 1px solid rgba(139,69,19,0.15);
      box-shadow: 2px 2px 8px rgba(0,0,0,0.08);
      font-family: 'Caveat', cursive;
      font-size: 18px;
      line-height: 32px;
      color: #2c1810;
      position: relative;
      overflow: hidden;
      min-height: 100px;
    `

    // Red margin line
    const margin = document.createElement("div")
    margin.style.cssText = "position:absolute;top:0;left:50px;width:1px;height:100%;background:rgba(220,50,50,0.3);"
    container.appendChild(margin)

    // Content
    const contentDiv = document.createElement("div")
    contentDiv.style.cssText = "white-space:pre-wrap;word-wrap:break-word;"
    contentDiv.textContent = content
    container.appendChild(contentDiv)

    // Punch holes decoration
    for (let i = 0; i < 3; i++) {
      const hole = document.createElement("div")
      hole.style.cssText = `position:absolute;left:12px;top:${60 + i * 120}px;width:16px;height:16px;border-radius:50%;background:#fef9e7;border:1px solid rgba(139,69,19,0.2);box-shadow:inset 1px 1px 2px rgba(0,0,0,0.08);`
      container.appendChild(hole)
    }

    block.replaceWith(container)
  }
}

// ═══════════════════════════════════════════════════════════════
// MASTER RENDER
// ═══════════════════════════════════════════════════════════════

export function renderAllRichContent(root: HTMLElement) {
  renderMermaidBlocks(root)
  renderHTMLBlocks(root)
  renderSVGBlocks(root)
  renderVideoBlocks(root)
  renderAudioBlocks(root)
  renderNotebookBlocks(root)
}
