// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type Component, type JSX, For, Show } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"

/**
 * Every settings page is the same shape: a title, then a stack of cards, each
 * with a heading and rows of label-plus-control. Building those pieces once
 * here is what keeps General, Providers, Models and Storage looking like the
 * same product rather than four separate screens.
 */
export const SettingsPageV2: Component<{ children?: JSX.Element }> = (props) => (
  <div class="settings-v2-page">{props.children}</div>
)

export const SettingsCardV2: Component<{
  icon: Parameters<typeof Icon>[0]["name"]
  title: string
  description?: string
  padded?: boolean
  children?: JSX.Element
}> = (props) => (
  <section class="settings-v2-card">
    <header class="settings-v2-card-head">
      <div class="settings-v2-card-head-icon">
        <Icon name={props.icon} size="small" />
      </div>
      <div class="settings-v2-card-head-text">
        <h2 class="settings-v2-card-title">{props.title}</h2>
        <Show when={props.description}>
          <p class="settings-v2-card-description">{props.description}</p>
        </Show>
      </div>
    </header>
    <div class={props.padded ? "settings-v2-card-body-padded" : "settings-v2-card-body"}>
      {props.children}
    </div>
  </section>
)

export const SettingsRowV2: Component<{
  title: string
  description?: string
  children?: JSX.Element
}> = (props) => (
  <div class="settings-v2-row">
    <div class="settings-v2-row-text">
      <span class="settings-v2-row-title">{props.title}</span>
      <Show when={props.description}>
        <span class="settings-v2-row-description">{props.description}</span>
      </Show>
    </div>
    <Show when={props.children}>
      <div class="settings-v2-row-control">{props.children}</div>
    </Show>
  </div>
)

export const SettingsOptionV2: Component<{
  icon?: Parameters<typeof Icon>[0]["name"]
  name: string
  note?: string
  active?: boolean
  onSelect?: () => void
}> = (props) => (
  <button type="button" class="settings-v2-option" data-active={props.active} onClick={props.onSelect}>
    <Show when={props.icon}>
      <div class="settings-v2-option-icon">
        <Icon name={props.icon!} size="small" />
      </div>
    </Show>
    <div class="settings-v2-option-text">
      <span class="settings-v2-option-name">{props.name}</span>
      <Show when={props.note}>
        <span class="settings-v2-option-note">{props.note}</span>
      </Show>
    </div>
  </button>
)

export const SettingsListV2: Component<{
  items: readonly { icon?: Parameters<typeof Icon>[0]["name"]; name: string; note?: string }[]
  empty?: string
  onSelect?: (index: number) => void
}> = (props) => (
  <Show when={props.items.length} fallback={<p class="settings-v2-empty">{props.empty}</p>}>
    <div class="settings-v2-scroll">
      <For each={props.items}>
        {(item, index) => (
          <SettingsOptionV2
            icon={item.icon}
            name={item.name}
            note={item.note}
            onSelect={() => props.onSelect?.(index())}
          />
        )}
      </For>
    </div>
  </Show>
)