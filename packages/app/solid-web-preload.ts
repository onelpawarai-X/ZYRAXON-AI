// Copyright (c) 2026 onelpawarai. All rights reserved.

// Compile the panel's JSX for the DOM, and resolve Solid to its browser build.
//
// `jsx: "preserve"` leaves the transform to the bundler, and Bun has no Solid preset of
// its own — the only one installed targets the TUI renderer. Bun also resolves `solid-js`
// to the server build outside a browser condition, which throws "Client-only API called on
// the server side" the moment a component renders. Both are fixed here so the component
// tests run under the plain `bun test` the repo already uses.
import { plugin as registerBunPlugin } from "bun"
import { transformAsync } from "@babel/core"

/** The server builds Solid picks for Node, and the browser build each one stands in for. */
const BROWSER_BUILDS: [RegExp, string][] = [
  [/[/\\]solid-js[/\\]dist[/\\]server\.js$/, "solid.js"],
  [/[/\\]solid-js[/\\]store[/\\]dist[/\\]server\.js$/, "store.js"],
  [/[/\\]solid-js[/\\]web[/\\]dist[/\\]server\.js$/, "web.js"],
]

registerBunPlugin({
  name: "solid-dom-jsx",
  setup(build) {
    for (const [filter, replacement] of BROWSER_BUILDS) {
      build.onLoad({ filter }, async (args) => {
        const file = Bun.file(args.path.replace(/[?#].*$/, "").replace(/server\.js$/, replacement))
        return { contents: await file.text(), loader: "js" }
      })
    }

    build.onLoad({ filter: /^(?!.*[/\\]node_modules[/\\]).*\.tsx$/ }, async (args) => {
      const code = await Bun.file(args.path).text()
      const out = await transformAsync(code, {
        filename: args.path,
        presets: [
          ["solid", { generate: "dom", hydratable: false }],
          ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
        ],
        babelrc: false,
        configFile: false,
      })
      return { contents: out?.code ?? code, loader: "js" }
    })
  },
})
