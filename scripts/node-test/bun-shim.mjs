// Copyright (c) 2026 onelpawarai. All rights reserved.

// Stand-in for the `bun` runtime module used by test fixtures. Only the pieces
// the Node test shim actually reaches are implemented.
import { spawn } from "node:child_process"

export function $(strings, ...values) {
  const command = strings.reduce((acc, part, index) => acc + part + (values[index] ?? ""), "")
  const child = spawn("sh", ["-c", command], { stdio: "inherit" })
  const promise = new Promise((resolve, reject) => {
    child.on("error", reject)
    child.on("close", (code) => resolve({ exitCode: code ?? 0 }))
  })
  return Object.assign(promise, {
    quiet: () => promise,
    text: () => promise.then(() => ""),
  })
}

export const file = (path) => ({ path, text: () => import("node:fs/promises").then((fs) => fs.readFile(path, "utf8")) })
