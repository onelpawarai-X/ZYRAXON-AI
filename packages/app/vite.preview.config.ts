// Copyright (c) 2026 onelpawarai. All rights reserved.

// Preview server used to run the built app and the API on one public port.
//
// The app is a production build, so `getCurrentUrl()` falls back to
// `location.origin` and every request is made against the same origin it was
// served from. Locally the API lives on 4096 and only 12000/12001 are exposed,
// so the preview server proxies every API prefix to the backend. Without this
// the app would request its own origin, the static server would answer with
// index.html, and every API call would fail to parse.
import { defineConfig } from "vite"

const API_TARGET = process.env.ZYRAXON_API_TARGET ?? "http://127.0.0.1:4096"

// Every root-level prefix the generated SDK can request. `/assets` and the
// icon files are deliberately absent so they keep being served from dist.
const API_PREFIXES = [
  "agent",
  "api",
  "auth",
  "command",
  "config",
  "event",
  "experimental",
  "file",
  "find",
  "formatter",
  "global",
  "instance",
  "log",
  "lsp",
  "mcp",
  "path",
  "permission",
  "project",
  "provider",
  "pty",
  "question",
  "session",
  "skill",
  "sync",
  "tui",
  "vcs",
]

export default defineConfig({
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 12000),
    allowedHosts: true,
    proxy: Object.fromEntries(
      API_PREFIXES.map((prefix) => [
        `/${prefix}`,
        // ws so the terminal socket and SSE streams are relayed too.
        { target: API_TARGET, changeOrigin: true, ws: true },
      ]),
    ),
  },
})
