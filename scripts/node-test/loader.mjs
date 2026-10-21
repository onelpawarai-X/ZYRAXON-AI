// Copyright (c) 2026 onelpawarai. All rights reserved.

// Node test entrypoint. The repository standardises on `bun:test`, which Node
// cannot load, so this registers the resolver that maps `bun:test` onto a
// node:test shim plus the workspace `@/` and `@zyraxon-ai/` path aliases.
//
// Usage (from a package directory):
//   node --import ../../scripts/node-test/loader.mjs \
//     --experimental-transform-types --test --test-force-exit <files>
import { register } from "node:module"
import { pathToFileURL } from "node:url"

register("./resolve-hook.mjs", pathToFileURL(import.meta.dirname + "/"))
