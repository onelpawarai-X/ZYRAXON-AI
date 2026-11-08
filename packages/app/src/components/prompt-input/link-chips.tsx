// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { siteIcon, makeFaviconImg, attachSitePreview } from "@zyraxon-ai/session-ui/site-preview"
import { usePlatform } from "@/context/platform"

const URL_PATTERN = /https?:\/\/[^\s<>"'`()\]]+/g
const TRAILING_PUNCTUATION = /[).,;:!?"']+$/
const MAX_CHIPS = 3

type LinkChip = { url: string; host: string }

export const PromptLinkChips = (props: { getText: () => string }) => {
  const platform = usePlatform()
  const [links, setLinks] = createSignal<LinkChip[]>([])
  let lastKey = ""

  const update = () => {
    const text = props.getText() ?? ""
    if (!text.includes("http")) {
      if (lastKey) {
        lastKey = ""
        setLinks([])
      }
      return
    }
    const raw = text.match(URL_PATTERN) ?? []
    const seen = new Set<string>()
    const next: LinkChip[] = []
    for (const candidate of raw) {
      const url = candidate.replace(TRAILING_PUNCTUATION, "")
      try {
        const parsed = new URL(url)
        const key = `${parsed.hostname}${parsed.pathname}`
        if (seen.has(key)) continue
        seen.add(key)
        next.push({ url, host: parsed.hostname })
      } catch {
        continue
      }
      if (next.length >= MAX_CHIPS) break
    }
    const key = next.map((item) => item.url).join("|")
    if (key === lastKey) return
    lastKey = key
    setLinks(next)
  }

  onMount(() => {
    update()
    const timer = window.setInterval(update, 650)
    onCleanup(() => window.clearInterval(timer))
  })

  return (
    <Show when={links().length > 0}>
      <div class="flex flex-wrap items-center gap-1.5 px-3 pt-2" data-component="prompt-link-chips">
        <For each={links()}>
          {(item) => (
            <a
              data-component="prompt-link-chip"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              class="flex h-6 items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 pl-1.5 pr-2.5 text-[10px] font-semibold leading-none text-cyan-100/90 no-underline transition-colors hover:border-cyan-300/50 hover:bg-cyan-400/15"
              title={item.url}
              ref={(el) => {
                const info = siteIcon(item.url)
                if (info) {
                  const img = makeFaviconImg(info, 12)
                  img.style.marginRight = "0"
                  img.style.verticalAlign = "0"
                  el.prepend(img)
                }
                attachSitePreview(el, item.url)
              }}
              onClick={(event) => {
                event.preventDefault()
                platform.openLink(item.url)
              }}
            >
              <span class="max-w-[160px] truncate">{item.host}</span>
            </a>
          )}
        </For>
      </div>
    </Show>
  )
}
