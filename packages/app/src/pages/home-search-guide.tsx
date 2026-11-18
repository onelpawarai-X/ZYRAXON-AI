// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createSignal, For, Show } from "solid-js"
import { ButtonV2 } from "@zyraxon-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@zyraxon-ai/ui/v2/icon"
import { useLanguage } from "@/context/language"

export function HomeSearchGuide() {
  const language = useLanguage()
  const [open, setOpen] = createSignal(false)

  const rules = () => [
    { prefix: ">", title: language.t("home.search.guide.rule.commands.title"), body: language.t("home.search.guide.rule.commands.body") },
    { prefix: "#", title: language.t("home.search.guide.rule.symbols.title"), body: language.t("home.search.guide.rule.symbols.body") },
    { prefix: "?", title: language.t("home.search.guide.rule.ask.title"), body: language.t("home.search.guide.rule.ask.body") },
    { prefix: "web:", title: language.t("home.search.guide.rule.web.title"), body: language.t("home.search.guide.rule.web.body") },
    { prefix: "@", title: language.t("home.search.guide.rule.files.title"), body: language.t("home.search.guide.rule.files.body") },
  ]

  return (
    <section class="home-guide relative col-span-full overflow-hidden rounded-2xl border border-cyan-400/12 p-4 lg:p-5">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
            <IconV2 name="magnifying-glass" size="small" />
          </div>
          <div class="flex flex-col">
            <span class="text-sm font-bold tracking-tight text-v2-text-text-base">{language.t("home.search.guide.title")}</span>
            <span class="text-[11px] text-v2-text-text-muted">{language.t("home.search.guide.subtitle")}</span>
          </div>
        </div>
        <ButtonV2 variant="ghost-muted" size="normal" onClick={() => setOpen((v) => !v)}>
          {open() ? language.t("home.search.guide.hide") : language.t("home.search.guide.show")}
        </ButtonV2>
      </div>

      <Show when={open()}>
        <div class="mt-4 flex flex-col gap-3 border-t border-cyan-400/10 pt-4">
          <p class="text-[12px] leading-5 text-v2-text-text-muted">{language.t("home.search.guide.intro")}</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <For each={rules()}>
              {(rule) => (
                <div class="flex gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <kbd class="mt-0.5 h-6 shrink-0 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 font-mono text-[11px] font-bold text-cyan-200">{rule.prefix}</kbd>
                  <div class="flex flex-col gap-0.5">
                    <span class="text-[12px] font-semibold text-v2-text-text-base">{rule.title}</span>
                    <span class="text-[11px] leading-4 text-v2-text-text-muted">{rule.body}</span>
                  </div>
                </div>
              )}
            </For>
          </div>
          <p class="text-[11px] text-v2-text-text-faint">{language.t("home.search.guide.tip")}</p>
        </div>
      </Show>
    </section>
  )
}
