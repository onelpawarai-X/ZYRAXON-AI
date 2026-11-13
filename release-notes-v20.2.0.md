# ZYRAXON AI v20.2.0

A security release. The packaged desktop app now ships every one of its
bundles obfuscated, and three long-standing defects that this uncovered are
fixed — including the four bundled MCP servers, which could not start in a
packaged install.

## Highlights

### Shipped code is obfuscated end to end

The desktop app already obfuscated its `main`, `preload` and renderer bundles,
but its **~28 MB server bundle** was only minified — the application's own
logic could still be read out of `zyraxon-server.js`. That bundle is now
obfuscated in the same build step that patches it. Every shipped bundle —
main, preload, renderer and server — is unreadable without reverse
engineering.

### Repairs uncovered by obfuscation

Obfuscating the server bundle exposed three defects that pushed the app onto
its error boundary, all fixed:

- **`bun:` protocol crash** — the `bun:sqlite` / `bun:ffi` shim rewrite matched
  `from "bun:sqlite"` with a space, but the minified bundle emits
  `from"bun:sqlite"`, so the patch silently missed and the Node ESM loader
  rejected the `bun:` scheme. It now matches any spacing, with the same fix for
  the `jsx` import attribute and `import.meta.require` patches.
- **Silenced logs** — `disableConsoleOutput` swallowed every error and log,
  which hid the failure above. Removed.
- **Missing wasm** — `sql-wasm.wasm` was resolved only under
  `packages/desktop/node_modules`; it now also looks in the root
  `node_modules`.

### Four bundled MCP servers work again

The `runAsNode` Electron fuse was disabled, but a packaged install has no
`node` on PATH: the bundled MCP servers are spawned with the Electron binary
itself and `ELECTRON_RUN_AS_NODE=1`. With the fuse off, that binary started a
second copy of the app instead of running the script, so **none of the four
built-in MCP servers started**. The fuse stays enabled now, and all four come
up.

### Everything else, confirmed

- Home page, cinematic hero, and the **Omniscient Search** palette
  (`Ctrl+K` → symbol, content, web, and Ask-ZYRAXON), verified end to end.
- **Sidebar hover-open** from the left edge, verified.
- **Bengali** locale and the **Session details** rename, verified.
- Back on the **~12 GB** build heap the release workflow now uses, because the
  desktop build obfuscates the server bundle and renderer on top of the
  monorepo tsc/vite pass.

### Assets

Built and attached automatically by the release workflow, for every platform:

- **Desktop** — Linux (AppImage, `.deb`, `.rpm`), Windows (x64 and arm64
  installers), macOS (arm64 and x64, `.dmg` and `.zip`).
- **CLI** — Linux, macOS and Windows archives, x64 and arm64.

---

**Version:** 20.2.0 (from 20.1.0).

_This release note was written by an AI agent (OpenHands) on behalf of the maintainer._
