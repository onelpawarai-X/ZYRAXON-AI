// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { createServer } from "node:http"
import { mkdtemp, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { downloadFile } from "../src/main/download"

// A real HTTP server is used rather than a stubbed fetch: the behaviour under
// test is how the streaming loop handles a live socket, including a server that
// stops sending mid-body.
function serve(handler: (req: unknown, res: import("node:http").ServerResponse) => void) {
  const server = createServer(handler as never)
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (typeof address !== "object" || !address) throw new Error("no port")
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })
}

async function tempFile() {
  const dir = await mkdtemp(join(tmpdir(), "zyraxon-download-"))
  return join(dir, "out.bin")
}

describe("downloadFile", () => {
  test("a complete response is written to disk byte for byte", async () => {
    const body = Buffer.from("hello zyraxon")
    const server = await serve((_req, res) => {
      res.writeHead(200, { "content-length": String(body.length) })
      res.end(body)
    })
    const dest = await tempFile()
    try {
      await downloadFile(`${server.url}/file`, dest)
      expect((await readFile(dest)).toString()).toBe("hello zyraxon")
    } finally {
      await server.close()
    }
  })

  test("progress is reported when the length is known", async () => {
    const body = Buffer.alloc(100, 1)
    const server = await serve((_req, res) => {
      res.writeHead(200, { "content-length": String(body.length) })
      res.end(body)
    })
    const dest = await tempFile()
    const seen: number[] = []
    try {
      await downloadFile(`${server.url}/file`, dest, { onProgress: (p) => seen.push(p) })
      expect(seen).toContain(100)
    } finally {
      await server.close()
    }
  })

  test("an error status leaves no file behind", async () => {
    const server = await serve((_req, res) => {
      res.writeHead(500)
      res.end("nope")
    })
    const dest = await tempFile()
    try {
      await expect(downloadFile(`${server.url}/file`, dest)).rejects.toThrow(/Download failed/)
      // The partial file must not survive, or the next run would treat it as complete.
      await expect(stat(dest)).rejects.toThrow()
    } finally {
      await server.close()
    }
  })

  test("a server that stalls mid-body is abandoned on timeout", async () => {
    const server = await serve((_req, res) => {
      res.writeHead(200, { "content-length": "1000000" })
      res.write(Buffer.alloc(10))
      // Never ends: the old implementation would wait here forever.
    })
    const dest = await tempFile()
    try {
      await expect(downloadFile(`${server.url}/slow`, dest, { timeoutMs: 300 })).rejects.toThrow(/Download failed/)
      await expect(stat(dest)).rejects.toThrow()
    } finally {
      await server.close()
    }
  })

  test("an unreachable host fails instead of hanging", async () => {
    const dest = await tempFile()
    await expect(downloadFile("http://127.0.0.1:1/nothing", dest, { timeoutMs: 500 })).rejects.toThrow(/Download failed/)
    await expect(stat(dest)).rejects.toThrow()
  })
})
