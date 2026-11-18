// Copyright (c) 2026 onelpawarai. All rights reserved.

import { readFileSync } from "node:fs"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import JavaScriptObfuscator from "javascript-obfuscator"
import { fileURLToPath } from "url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))

const channel = (() => {
  const raw = process.env.ZYRAXON_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  if (process.env.ZYRAXON_CHANNEL === "latest") return "prod"
  return "dev"
})()

/**
 * @type {import("vite").PluginOption}
 */
export default [
  {
    name: "zyraxon-desktop:config",
    config() {
      return {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
          },
          dedupe: [
            "@tanstack/query-core",
            "@tanstack/solid-query",
            "@tanstack/query-persist-client-core",
            "@tanstack/solid-query-persist-client",
            "@tanstack/react-query",
          ],
        },
        define: {
          "import.meta.env.VITE_ZYRAXON_CHANNEL": JSON.stringify(channel),
        },
        worker: {
          format: "es",
        },
      }
    },
  },
  {
    name: "zyraxon-desktop:theme-preload",
    transformIndexHtml(html) {
      return html.replace(
        '<script id="oc-theme-preload-script" src="/oc-theme-preload.js"></script>',
        `<script id="oc-theme-preload-script">${readFileSync(theme, "utf8")}</script>`,
      )
    },
  },
  tailwindcss(),
  solidPlugin(),
  {
    // Runs on the finished bundle, after Vite has resolved every filename and
    // the `!~{...}~` hash placeholders. Obfuscating earlier (in renderChunk) left
    // those placeholders inside the obfuscated strings, so a chunk kept its
    // placeholder name and the page failed to load it. Export names are left
    // untouched by the obfuscator, so the imports between chunks keep resolving.
    name: "zyraxon:obfuscate",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      if (process.env.ZYRAXON_OBFUSCATE === "0") return
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue
        if (!item.fileName.endsWith(".js")) continue
        // A chunk below this size carries a single export or a few bytes of
        // glue; obfuscating it costs time and hides nothing.
        if (item.code.length < 2048) continue
        item.code = JavaScriptObfuscator.obfuscate(item.code, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.5,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.3,
          stringArray: true,
          stringArrayEncoding: ["base64"],
          stringArrayThreshold: 0.75,
          identifierNamesGenerator: "hexadecimal",
          // Self-defending rewrites functions to detect a formatter, which also
          // breaks some minified patterns; the rest already resists reading.
          selfDefending: false,
        }).getObfuscatedCode()
      }
    },
  },
]
