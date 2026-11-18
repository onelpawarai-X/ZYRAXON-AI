// Copyright (c) 2026 onelpawarai. All rights reserved.

import { getDirectory, getFilename } from "@zyraxon-ai/core/util/path"
import { FileIcon } from "@zyraxon-ai/ui/file-icon"
import { ScrollView } from "@zyraxon-ai/ui/scroll-view"
import { Dialog, DialogBody } from "@zyraxon-ai/ui/v2/dialog-v2"
import { Icon } from "@zyraxon-ai/ui/v2/icon"
import { KeybindV2 } from "@zyraxon-ai/ui/v2/keybind-v2"
import { TextInputV2 } from "@zyraxon-ai/ui/v2/text-input-v2"
import { useDialog } from "@zyraxon-ai/ui/context/dialog"
import { createEffect, createMemo, createResource, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { commandPaletteOptions, formatKeybindParts, useCommand } from "@/context/command"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useTabs } from "@/context/tabs"
import { fetchOmniSymbols, fetchOmniTextMatches } from "@/components/omni-search"
import { openInAppBrowser } from "@/components/in-app-browser"
import { SessionTabAvatar } from "@/pages/layout/session-tab-avatar"
import { getRelativeTime } from "@/utils/time"
import {
  createCommandPaletteCommandEntry,
  createCommandPaletteFileEntry,
  createCommandPaletteModel,
  createServerSessionEntries,
  uniqueCommandPaletteEntries,
  type CommandPaletteEntry,
} from "./command-palette"
import "./dialog-command-palette-v2.css"

function groups(entries: CommandPaletteEntry[]) {
  const map = new Map<string, CommandPaletteEntry[]>()
  for (const entry of entries) map.set(entry.category, [...(map.get(entry.category) ?? []), entry])
  return Array.from(map.entries()).map(([category, entries]) => ({ category, entries }))
}

function matchesEntry(entry: CommandPaletteEntry, query: string) {
  const value = query.toLowerCase()
  return [entry.title, entry.description, entry.category].some((text) => text?.toLowerCase().includes(value))
}

export function DialogCommandPaletteV2(props: { onOpenFile?: (path: string) => void }) {
  const palette = createCommandPaletteModel(props)
  const serverSDK = useServerSDK()()
  const platform = usePlatform()
  const layout = useLayout()
  const global = useGlobal()
  const appTabs = useTabs()

  const startAsk = async (query: string) => {
    try {
      const selection = layout.home.selection()
      const conn =
        global.servers.list().find((item) => ServerConnection.key(item) === selection.server) ??
        global.servers.list()[0] ??
        serverSDK.server
      if (!conn) return
      const ctx = global.ensureServerCtx(conn)
      const selected = ctx.projects.list().find((project) => project.worktree === selection.directory)?.worktree
      const directory = selected ?? ctx.projects.list()[0]?.worktree ?? ctx.sync.data.path.home ?? ""
      if (selected === undefined && directory) ctx.projects.open(directory)
      await appTabs.newDraft({ server: ServerConnection.key(conn), directory }, query)
    } catch {
      // Ask is best-effort; the palette just closes on failure.
    }
  }

  const loadItems = async (text: string) => {
    const q = text.trim()
    if (!q) return [...palette.preferredCommandEntries(), ...palette.recentFileEntries()]

    const language = palette.language
    const symbolCategory = language.t("palette.group.symbols")
    const contentCategory = language.t("palette.group.content")
    const webCategory = language.t("palette.group.web")
    const askCategory = language.t("palette.group.ask")
    const fileCategory = language.t("palette.group.files")

    const filesPromise = palette.file.searchFiles(q, { limit: 8 })
    const symbolsPromise =
      q.length >= 2 ? fetchOmniSymbols(serverSDK.client, q, symbolCategory, 6) : Promise.resolve([])
    const textsPromise =
      q.length >= 3 ? fetchOmniTextMatches(serverSDK.client, q, contentCategory, 4) : Promise.resolve([])

    const [files, nextSessions, symbols, texts] = await Promise.all([
      filesPromise,
      Promise.resolve(palette.sessions(q)),
      symbolsPromise,
      textsPromise,
    ])

    return [
      {
        id: `ask:${q}`,
        type: "ask" as const,
        title: language.t("palette.ask.action", { query: q }),
        description: language.t("palette.ask.description"),
        category: askCategory,
        askQuery: q,
      },
      ...palette.commandEntries().filter((entry) => matchesEntry(entry, q)),
      ...nextSessions,
      ...symbols,
      ...files.map((path) => createCommandPaletteFileEntry(path, fileCategory)),
      ...texts,
      {
        id: `web:${q}`,
        type: "web" as const,
        title: language.t("palette.web.action", { query: q }),
        description: language.t("palette.web.description"),
        category: webCategory,
        webQuery: q,
      },
    ]
  }

  const select = (item: CommandPaletteEntry | undefined) => {
    if (!item) return
    if (item.type === "web") {
      palette.close()
      openInAppBrowser(`https://www.google.com/search?q=${encodeURIComponent(item.webQuery ?? item.title)}`)
      return
    }
    if (item.type === "ask") {
      palette.close()
      void startAsk(item.askQuery ?? item.title)
      return
    }
    if (item.type === "symbol" || item.type === "text") {
      palette.select({ ...item, type: "file" })
      return
    }
    palette.select(item)
  }

  return (
    <CommandPaletteView
      placeholder={palette.language.t("palette.search.placeholder")}
      loadItems={loadItems}
      highlight={palette.highlight}
      select={select}
      close={palette.close}
    />
  )
}

// The home palette cannot reach the directory-scoped FileProvider (home has no
// directory SDK), so unlike DialogCommandPaletteV2 it never touches `useFile`.
// It still offers the omniscient surface — symbols, content, web and ask — by
// talking to the server-level client, which resolves find queries against the
// server's working directory.
export function DialogHomeCommandPaletteV2(props: {
  server: ServerConnection.Any
  onSelectSession: (entry: CommandPaletteEntry) => void
  onAsk?: (query: string) => void
}) {
  const command = useCommand()
  const dialog = useDialog()
  const global = useGlobal()
  const language = useLanguage()
  const platform = usePlatform()
  const serverCtx = global.ensureServerCtx(props.server)
  const state = { cleanup: undefined as (() => void) | void, committed: false }
  const commandEntries = createMemo(() => {
    const category = language.t("palette.group.commands")
    return commandPaletteOptions(command.options).map((option) => createCommandPaletteCommandEntry(option, category))
  })
  const sessions = createServerSessionEntries({
    server: ServerConnection.key(props.server),
    opened: serverCtx.projects.list,
    stored: () => serverCtx.sync.data.project,
    load: (search, signal) =>
      serverCtx.sdk.client.experimental.session.list({ roots: true, search, limit: 50 }, { signal }),
    untitled: () => language.t("command.session.new"),
    category: () => language.t("command.category.session"),
  })

  const highlight = (item: CommandPaletteEntry | undefined) => {
    state.cleanup?.()
    state.cleanup = undefined
    if (item?.type !== "command") return
    state.cleanup = item.option?.onHighlight?.()
  }
  const select = (item: CommandPaletteEntry | undefined) => {
    if (!item) return
    state.committed = true
    state.cleanup = undefined
    if (item.type === "web") {
      dialog.close()
      openInAppBrowser(`https://www.google.com/search?q=${encodeURIComponent(item.webQuery ?? item.title)}`)
      return
    }
    if (item.type === "ask") {
      dialog.close()
      props.onAsk?.(item.askQuery ?? item.title)
      return
    }
    dialog.close()
    if (item.type === "command") {
      item.option?.onSelect?.("palette")
      return
    }
    if (item.type === "session") props.onSelectSession(item)
  }
  const loadItems = async (text: string) => {
    const query = text.trim()
    if (!query) return commandEntries().slice(0, 5)
    const symbolCategory = language.t("palette.group.symbols")
    const contentCategory = language.t("palette.group.content")
    const webCategory = language.t("palette.group.web")
    const askCategory = language.t("palette.group.ask")
    const [nextSessions, symbols, texts] = await Promise.all([
      sessions(query),
      query.length >= 2 ? fetchOmniSymbols(serverCtx.sdk.client, query, symbolCategory, 6) : Promise.resolve([]),
      query.length >= 3 ? fetchOmniTextMatches(serverCtx.sdk.client, query, contentCategory, 4) : Promise.resolve([]),
    ])
    return [
      {
        id: `ask:${query}`,
        type: "ask" as const,
        title: language.t("palette.ask.action", { query }),
        description: language.t("palette.ask.description"),
        category: askCategory,
        askQuery: query,
      },
      ...commandEntries().filter((entry) => matchesEntry(entry, query)),
      ...nextSessions,
      ...symbols,
      ...texts,
      {
        id: `web:${query}`,
        type: "web" as const,
        title: language.t("palette.web.action", { query }),
        description: language.t("palette.web.description"),
        category: webCategory,
        webQuery: query,
      },
    ]
  }

  onCleanup(() => {
    if (state.committed) return
    state.cleanup?.()
  })

  return (
    <CommandPaletteView
      placeholder={language.t("palette.search.placeholder.home")}
      loadItems={loadItems}
      highlight={highlight}
      select={select}
      close={() => dialog.close()}
    />
  )
}

function CommandPaletteView(props: {
  placeholder: string
  loadItems: (text: string) => CommandPaletteEntry[] | Promise<CommandPaletteEntry[]>
  highlight: (item: CommandPaletteEntry | undefined) => void
  select: (item: CommandPaletteEntry | undefined) => void
  close: () => void
}) {
  const language = useLanguage()
  const tabs = useTabs()
  const [query, setQuery] = createSignal("")
  const [active, setActive] = createSignal(0)

  const [entries] = createResource(query, props.loadItems, { initialValue: [] as CommandPaletteEntry[] })
  // Render stale results while a new query loads to avoid flashing "Loading" per keystroke.
  const visibleEntries = createMemo(() => uniqueCommandPaletteEntries(entries.latest ?? []))
  const groupedEntries = createMemo(() => groups(visibleEntries()))
  const activeEntry = createMemo(() => visibleEntries()[active()])
  const openSessions = createMemo(
    () => new Set(tabs.store.flatMap((tab) => (tab.type === "session" ? [`${tab.server}\0${tab.sessionId}`] : []))),
  )

  createEffect(() => {
    query()
    visibleEntries()
    setActive(0)
  })

  createEffect(() => {
    props.highlight(activeEntry())
  })

  let resultsRef: HTMLDivElement | undefined

  const move = (delta: -1 | 1) => {
    const count = visibleEntries().length
    if (count === 0) return
    setActive((index) => (index + delta + count) % count)
    requestAnimationFrame(() => {
      resultsRef?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" })
    })
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      move(1)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      move(-1)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      props.select(activeEntry())
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      props.close()
    }
  }

  return (
    <Dialog class="command-palette-v2" size="large">
      <DialogBody class="command-palette-v2-body">
        <div class="command-palette-v2-search">
          <TextInputV2
            value={query()}
            autofocus
            autocomplete="off"
            spellcheck={false}
            appearance="large"
            placeholder={props.placeholder}
            leadingIcon={<Icon name="magnifying-glass" />}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <ScrollView class="command-palette-v2-scroll" viewportRef={(el) => (resultsRef = el)}>
          <div class="command-palette-v2-results" role="listbox">
            <Show
              when={visibleEntries().length > 0}
              fallback={
                <div class="command-palette-v2-state">
                  {entries.loading ? language.t("common.loading") : language.t("palette.empty")}
                </div>
              }
            >
              <For each={groupedEntries()}>
                {(group) => (
                  <div class="command-palette-v2-group">
                    <Show when={group.category}>
                      <div class="command-palette-v2-group-title">{group.category}</div>
                    </Show>
                    <For each={group.entries}>
                      {(item) => (
                        <PaletteRow
                          item={item}
                          active={activeEntry()?.id === item.id}
                          language={language}
                          sessionOpen={
                            item.server && item.sessionID
                              ? openSessions().has(`${item.server}\0${item.sessionID}`)
                              : false
                          }
                          onActive={() => setActive(visibleEntries().findIndex((entry) => entry.id === item.id))}
                          onSelect={() => props.select(item)}
                        />
                      )}
                    </For>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </ScrollView>
      </DialogBody>
    </Dialog>
  )
}

function PaletteRow(props: {
  item: CommandPaletteEntry
  active: boolean
  language: ReturnType<typeof useLanguage>
  sessionOpen: boolean
  onActive: () => void
  onSelect: () => void
}) {
  const session = () =>
    props.item.server && props.item.directory && props.item.sessionID
      ? { server: props.item.server, directory: props.item.directory, sessionID: props.item.sessionID }
      : undefined

  return (
    <button
      type="button"
      class="command-palette-v2-row group"
      role="option"
      aria-selected={props.active}
      data-active={props.active ? "" : undefined}
      onMouseMove={(event) => {
        // Ignore hover from a static cursor when keyboard scrolling moves rows underneath it.
        if (event.movementX === 0 && event.movementY === 0) return
        props.onActive()
      }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onSelect}
    >
      <Switch
        fallback={
          <div class="command-palette-v2-row-main">
            <FileIcon node={{ path: props.item.path ?? "", type: "file" }} class="command-palette-v2-row-icon size-4" />
            <div class="command-palette-v2-file-path">
              <span class="command-palette-v2-file-dir">{getDirectory(props.item.path ?? "")}</span>
              <span class="command-palette-v2-file-name">{getFilename(props.item.path ?? "")}</span>
            </div>
          </div>
        }
      >
        <Match when={props.item.type === "text"}>
          <div class="command-palette-v2-row-main">
            <Icon name="magnifying-glass" size="normal" class="mt-0.5 shrink-0 text-v2-text-text-faint" />
            <div class="command-palette-v2-file-path">
              <span class="command-palette-v2-file-name">{props.item.title}</span>
              <Show when={props.item.description}>
                <span class="command-palette-v2-file-dir">{props.item.description}</span>
              </Show>
            </div>
          </div>
        </Match>
        <Match when={props.item.type === "web" || props.item.type === "ask"}>
          <div class="command-palette-v2-row-main">
            <Icon
              name={props.item.type === "web" ? "globe" : "terminal"}
              size="normal"
              class="shrink-0 text-v2-text-text-faint"
            />
            <div class="command-palette-v2-row-text">
              <span class="command-palette-v2-title">{props.item.title}</span>
              <Show when={props.item.description}>
                <span class="command-palette-v2-description">{props.item.description}</span>
              </Show>
            </div>
          </div>
        </Match>
        <Match when={props.item.type === "command"}>
          <div class="command-palette-v2-row-main">
            <div class="command-palette-v2-row-text">
              <span class="command-palette-v2-title">{props.item.title}</span>
              <Show when={props.item.description}>
                <span class="command-palette-v2-description">{props.item.description}</span>
              </Show>
            </div>
          </div>
          <Show when={props.item.keybind}>
            <KeybindV2 keys={formatKeybindParts(props.item.keybind ?? "", props.language.t)} variant="neutral" />
          </Show>
        </Match>
        <Match when={props.item.type === "session"}>
          <div class="command-palette-v2-row-main">
            <div class="relative shrink-0">
              <Show when={props.sessionOpen}>
                <span
                  aria-hidden="true"
                  class="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-[2px] bg-v2-background-bg-layer-04"
                  style={{ right: "calc(100% + 4px)" }}
                />
              </Show>
              <Show when={session()}>
                {(session) => (
                  <SessionTabAvatar
                    project={props.item.project}
                    directory={session().directory}
                    sessionId={session().sessionID}
                    server={session().server}
                  />
                )}
              </Show>
            </div>
            <div class="command-palette-v2-row-text">
              <span class="command-palette-v2-title" classList={{ "opacity-70": !!props.item.archived }}>
                {props.item.title}
              </span>
              <Show when={props.item.description}>
                <span class="command-palette-v2-description" classList={{ "opacity-70": !!props.item.archived }}>
                  {props.item.description}
                </span>
              </Show>
            </div>
          </div>
          <Show when={props.item.updated}>
            <span class="command-palette-v2-meta">
              {getRelativeTime(new Date(props.item.updated!).toISOString(), props.language.t)}
            </span>
          </Show>
        </Match>
      </Switch>
    </button>
  )
}
