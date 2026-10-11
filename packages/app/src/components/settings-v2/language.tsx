// Copyright (c) 2026 onelpawarai. All rights reserved.

import { createMemo, createSignal, For, Show } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { localeCoverage } from "@/context/language"
import { COUNTRIES, searchCountries, type Country } from "@/i18n/countries"
import { direction, flag, findLanguage } from "@/i18n/languages"
import "./settings-v2.css"

/**
 * Two panes: every country on the left with its flag, and on the right the
 * languages that country actually speaks. Picking a language repaints the whole
 * app immediately, so the change is visible while this panel is still open.
 */
export function SettingsLanguageV2() {
  const language = useLanguage()
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal<Country>(COUNTRIES.find((c) => c.code === "BD") ?? COUNTRIES[0]!)

  const results = createMemo(() => searchCountries(query()))
  const country = createMemo(() => selected())
  const spoken = createMemo(() => country().languages)

  return (
    <div class="language-v2">
      <div class="language-v2-pane language-v2-countries">
        <div class="language-v2-search">
          <Icon name="zy-search" size="small" />
          <input
            data-action="settings-language-search"
            type="search"
            value={query()}
            placeholder={language.t("settings.language.search.placeholder")}
            aria-label={language.t("settings.language.search.placeholder")}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <span class="language-v2-count">{COUNTRIES.length}</span>
        </div>

        <div class="language-v2-scroll">
          <Show
            when={results().length > 0}
            fallback={<div class="language-v2-empty">{language.t("settings.language.country.empty")}</div>}
          >
            <For each={results()}>
              {(entry) => (
                <button
                  type="button"
                  data-action="settings-language-country"
                  data-active={entry.code === country()?.code}
                  class="language-v2-country"
                  onClick={() => {
                    setSelected(entry)
                    setQuery("")
                  }}
                >
                  <span class="language-v2-flag" aria-hidden="true">
                    {entry.flag}
                  </span>
                  <span class="language-v2-country-text">
                    <span class="language-v2-country-name">{entry.name}</span>
                    <Show when={entry.native !== entry.name}>
                      <span class="language-v2-country-native">{entry.native}</span>
                    </Show>
                  </span>
                  <Show when={entry.languages.length > 0}>
                    <span class="language-v2-badge">{entry.languages.length}</span>
                  </Show>
                </button>
              )}
            </For>
          </Show>
        </div>
      </div>

      <div class="language-v2-pane language-v2-languages">
        <Show
          when={spoken().length > 0}
          fallback={
            <div class="language-v2-empty language-v2-empty-wide">
              <Icon name="zy-language" size="large" />
              <span>{language.t("settings.language.empty", { country: country().name })}</span>
            </div>
          }
        >
          <header class="language-v2-header" dir={direction(language.locale())}>
            <span class="language-v2-flag language-v2-flag-large" aria-hidden="true">
              {flag(country().code)}
            </span>
            <div class="language-v2-header-text">
              <span class="language-v2-header-name">{country().name}</span>
              <span class="language-v2-header-native">{country().native}</span>
            </div>
            <span class="language-v2-header-count">
              {spoken().length} {language.t("settings.language.unit")}
            </span>
          </header>

          <div class="language-v2-scroll">
            <For each={spoken()}>
              {(entry) => (
                <button
                  type="button"
                  data-action="settings-language-pick"
                  data-active={entry.code === language.locale()}
                  class="language-v2-option"
                  dir={direction(entry.code)}
                  lang={findLanguage(entry.code)?.code}
                  onClick={() => language.setLocale(entry.code)}
                >
                  <span class="language-v2-option-text">
                    <span class="language-v2-option-native">{entry.native}</span>
                    <span class="language-v2-option-english">{entry.english}</span>
                  </span>
                  <Show when={entry.code !== entry.code.split("-")[0]}>
                    <span class="language-v2-tag">{entry.code}</span>
                  </Show>
                  <Show when={localeCoverage(entry.code) === 1}>
                    <span class="language-v2-complete">{language.t("settings.language.badge.full")}</span>
                  </Show>
                  <Show when={localeCoverage(entry.code) === 0.25}>
                    <span class="language-v2-complete language-v2-complete-partial">
                      {language.t("settings.language.badge.partial")}
                    </span>
                  </Show>
                  <Show when={entry.code === language.locale()}>
                    <Icon name="check-small" size="small" />
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}