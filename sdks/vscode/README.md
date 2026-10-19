# ZYRAXON AI — VS Code Extension

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-ZYRAXON%20AI-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=zyraxon.zyraxon)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-ZYRAXON%20AI-C160EF?logo=eclipseide&logoColor=white)](https://open-vsx.org/extension/zyraxon/zyraxon)
[![License](https://img.shields.io/badge/license-ZSL--X%202.0.0-black)](./LICENSE)

**ZYRAXON AI** brings the full ZYRAXON agent into Visual Studio Code — AI chat, code
generation, refactoring, terminal control, and **888 tools across 63 categories**, plus
**108 verified MCP integrations**, in one extension.

The extension bundles the native ZYRAXON runtime for your platform. On first launch it
starts a local server and opens the ZYRAXON web app in a panel beside your editor, so
nothing extra needs to be installed separately.

## Features

- **One-click launch** — opens ZYRAXON in a split panel and focuses an existing session
  if one is already running.
- **New session** — start a fresh ZYRAXON session at any time without closing the current one.
- **Editor context** — your current selection and active file are shared with ZYRAXON automatically.
- **File reference shortcuts** — insert `@File#L37-42` style references at the cursor.
- **Terminal integration** — run the ZYRAXON CLI in an integrated terminal.
- **888 tools** — 63 categories spanning coding, refactoring, tests, docs, system
  automation, vehicles, aviation, marine, robotics, security, and more.

## Commands

| Command | Default keybinding | Description |
| --- | --- | --- |
| `ZYRAXON: Open ZYRAXON` | `Cmd+Esc` / `Ctrl+Esc` | Open ZYRAXON in a split panel |
| `ZYRAXON: Open ZYRAXON in New Tab` | `Cmd+Shift+Esc` / `Ctrl+Shift+Esc` | Start a new ZYRAXON session |
| `ZYRAXON: Open ZYRAXON Terminal` | — | Run the ZYRAXON CLI in a terminal |
| `ZYRAXON: Add Filepath to Terminal` | `Cmd+Alt+K` / `Ctrl+Alt+K` | Insert a file reference at the cursor |

## Getting started

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=zyraxon.zyraxon)
   or [Open VSX](https://open-vsx.org/extension/zyraxon/zyraxon).
2. Open any project in VS Code.
3. Press `Cmd+Esc` (macOS) or `Ctrl+Esc` (Windows/Linux) to launch ZYRAXON.

## Requirements

- VS Code `1.94.0` or newer.
- No separate runtime install: the matching ZYRAXON binary ships inside the extension for
  Linux (x64/arm64, glibc and musl), macOS (Intel and Apple Silicon), and Windows
  (x64/arm64).

## Support

- Website: <https://zyraxonai.lovable.app>
- Issues and feedback: <https://github.com/onelpawarai-X/ZYRAXON-AI/issues>

## Development

1. `code sdks/vscode` — open the `sdks/vscode` directory in VS Code. **Do not open from the repo root.**
2. `bun install` — run inside the `sdks/vscode` directory.
3. Press `F5` — launches a new VS Code window with the extension loaded.

`tsc` and `esbuild` watchers run automatically during debugging. After a change, run
`Developer: Reload Window` from the Command Palette to reload the extension.

## License

Released under the ZYRAXON Sovereign License — X Edition (ZSL-X) v2.0.0. See [LICENSE](./LICENSE).
