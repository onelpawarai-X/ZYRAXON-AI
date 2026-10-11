// Copyright (c) 2026 onelpawarai. All rights reserved.

import { For, Show, type JSX } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"

/**
 * One service rendered as its own designed section rather than a bare row in a
 * shared list: the icon carries the service, the count sits beside the title,
 * and each entry gets its own status pill. Three of these stacked read as three
 * different things instead of three copies of the same grey box.
 */
export function ServiceSection(props: {
  icon: Parameters<typeof Icon>[0]["name"]
  title: string
  count?: number
  tone?: "neutral" | "positive" | "warning"
  empty: string
  items: readonly { id: string; label: string; status?: string; detail?: string }[]
  action?: JSX.Element
  footer?: JSX.Element
}) {
  const tone = () => props.tone ?? "neutral"

  return (
    <section class="zy-service" data-tone={tone()}>
      <header class="zy-service-head">
        <span class="zy-service-icon" data-tone={tone()}>
          <Icon name={props.icon} size="small" />
        </span>
        <span class="zy-service-title">{props.title}</span>
        <Show when={props.count !== undefined}>
          <span class="zy-service-count">{props.count}</span>
        </Show>
        <Show when={props.action}>
          <span class="zy-service-action">{props.action}</span>
        </Show>
      </header>

      <div class="zy-service-body">
        <Show
          when={props.items.length > 0}
          fallback={<p class="zy-service-empty">{props.empty}</p>}
        >
          <ul class="zy-service-list">
            <For each={props.items}>
              {(item) => (
                <li class="zy-service-item" data-status={item.status ?? "connected"}>
                  <span class="zy-service-dot" data-status={item.status ?? "connected"} />
                  <span class="zy-service-name">{item.label}</span>
                  <Show when={item.detail}>
                    <span class="zy-service-detail">{item.detail}</span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>

      <Show when={props.footer}>
        <footer class="zy-service-foot">{props.footer}</footer>
      </Show>
    </section>
  )
}