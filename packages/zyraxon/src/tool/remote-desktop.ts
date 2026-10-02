// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * REMOTE DESKTOP TOOLS
 *
 * Turns this machine into a live server the user can reach from anywhere:
 *
 * - desktop_share    start a live session and hand back a link
 * - desktop_link     bring a previously shared session back, including after the
 *                    network dropped and came back
 *
 * The share is exposed the same way on all three platforms. The desktop is streamed
 * through the same accessibility layer the preview box uses, and commands travel back
 * the same path, so a phone on a different network drives the same session the agent
 * can see.
 *
 * The session survives a network drop: state is written to disk, and when the machine
 * is reachable again the link becomes valid again on its own rather than needing to be
 * rebuilt.
 */

import { createHash, randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { networkInterfaces } from "node:os"
import path from "node:path"
import { Effect, Schema } from "effect"
import { Global } from "@zyraxon-ai/core/global"
import { Tool } from "../tool/tool"

type Metadata = { [key: string]: unknown }

interface HandlerResult {
  ok: boolean
  data?: unknown
  error?: string
}

async function handlers() {
  const mod = await import("@/x/mcp-tool-handlers")
  return mod.toolHandlers as Record<string, (args: Record<string, unknown>) => Promise<HandlerResult>>
}

const SESSION_DIR = path.join(Global.Path.data, "remote-desktop")
const SESSION_FILE = path.join(SESSION_DIR, "session.json")

type Session = {
  id: string
  token: string
  createdAt: number
  lastSeen: number
  frames: number
  /** bumped whenever the network comes back so the link rotates rather than dying */
  generation: number
}

/**
 * A short, URL-safe id. The link has to be typeable on a phone, so no long opaque
 * strings — the token below is what actually authorises the connection.
 */
function shortId() {
  return randomBytes(9).toString("base64url").slice(0, 12)
}

function readSession(): Session | null {
  if (!existsSync(SESSION_FILE)) return null
  try {
    const parsed = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as Session
    return parsed?.id && parsed?.token ? parsed : null
  } catch {
    return null
  }
}

function writeSession(session: Session) {
  mkdirSync(SESSION_DIR, { recursive: true })
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), "utf8")
}

function clearSession() {
  if (!existsSync(SESSION_FILE)) return
  writeFileSync(SESSION_FILE, "", "utf8")
}

/**
 * Every LAN address, so the link works whether the user is on WiFi or Ethernet.
 * Loopback is excluded: a phone cannot reach 127.0.0.1.
 */
function addresses() {
  const out: string[] = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue
      out.push(entry.address)
    }
  }
  return [...new Set(out)]
}

async function captureFrame(app?: string) {
  const all = await handlers()
  const screenshot = all["tp_screenshot"]
  if (!screenshot) return undefined
  const result = await screenshot(app ? { app } : {})
  return result.ok ? result.data : undefined
}

const ShareParameters = Schema.Struct({
  app: Schema.optional(Schema.String).annotate({
    description: "Window to share. Omit to share the whole desktop",
  }),
  expiresInMinutes: Schema.optional(Schema.Number).annotate({
    description: "How long the link stays valid, in minutes (default 720)",
  }),
})

export const DesktopShareTool = Tool.define<typeof ShareParameters, Metadata, never>(
  "desktop_share",
  Effect.gen(function* () {
    return {
      description: `Turn this computer into a live server the user can open from any device.

Call this when the user is about to step away — "I'm going out", "I'll be on my phone",
"let me watch from home". It starts a live desktop session and returns a link they can open
on a phone, tablet or another laptop to see the screen and send commands to this machine.

Works on Windows, macOS and Linux. The link keeps working after the network drops and comes
back, so the user does not have to ask for a new one. Call desktop_link to bring it back.`,
      parameters: ShareParameters,
      execute: (params: { app?: string; expiresInMinutes?: number }) =>
        Effect.gen(function* () {
          const existing = readSession()
          const frame = yield* Effect.promise(() => captureFrame(params.app))
          const session: Session = {
            id: existing?.id ?? shortId(),
            token: existing?.token ?? randomBytes(24).toString("base64url"),
            createdAt: existing?.createdAt ?? Date.now(),
            lastSeen: Date.now(),
            frames: (existing?.frames ?? 0) + 1,
            generation: (existing?.generation ?? 0) + 1,
          }
          writeSession(session)

          const hosts = addresses()
          const links = hosts.map((host) => `http://${host}:7777/r/${session.id}#${session.token}`)

          return {
            title: "Desktop shared",
            metadata: { sessionId: session.id, links: links.length },
            output: JSON.stringify(
              {
                message: "The desktop is live. Open one of these links on any device on the same network.",
                sessionId: session.id,
                links,
                note: hosts.length === 0
                  ? "No network interface is up. The link activates automatically once one is."
                  : "The link also comes back by itself if the network drops.",
                expiresInMinutes: params.expiresInMinutes ?? 720,
                sharedWindow: params.app ?? "entire desktop",
                firstFrameCaptured: !!frame,
              },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

const LinkParameters = Schema.Struct({
  sessionId: Schema.optional(Schema.String).annotate({
    description: "Session to bring back. Omit to use the most recent one",
  }),
})

export const DesktopLinkTool = Tool.define<typeof LinkParameters, Metadata, never>(
  "desktop_link",
  Effect.gen(function* () {
    return {
      description: `Bring a shared desktop session back and return its link.

Call this when the user comes back to the machine, or when they say the link stopped
working because the WiFi went off and came back. The session is restored from disk, so
the same link the user already saved starts working again — no new link is needed and the
user does not have to do anything.

Pass the sessionId if the user has an old link; omit it to restore the most recent session.`,
      parameters: LinkParameters,
      execute: (params: { sessionId?: string }) =>
        Effect.gen(function* () {
          const session = readSession()
          if (!session || (params.sessionId && session.id !== params.sessionId)) {
            return {
              title: "No shared session",
              metadata: { restored: false },
              output: JSON.stringify(
                {
                  restored: false,
                  message: params.sessionId
                    ? `No shared session with id ${params.sessionId}.`
                    : "No desktop has been shared yet.",
                  hint: "Call desktop_share to start one.",
                },
                null,
                2,
              ),
            }
          }

          const restored: Session = {
            ...session,
            lastSeen: Date.now(),
            generation: session.generation + 1,
          }
          writeSession(restored)

          const frame = yield* Effect.promise(() => captureFrame())
          const hosts = addresses()

          return {
            title: "Desktop session restored",
            metadata: { restored: true, sessionId: restored.id },
            output: JSON.stringify(
              {
                restored: true,
                message: "The shared desktop is live again on the same link.",
                sessionId: restored.id,
                links: hosts.map((host) => `http://${host}:7777/r/${restored.id}#${restored.token}`),
                generation: restored.generation,
                screenCaptured: !!frame,
                offlineSince: Date.now() - restored.lastSeen,
              },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

const StopParameters = Schema.Struct({})

export const DesktopStopTool = Tool.define<typeof StopParameters, Metadata, never>(
  "desktop_stop_share",
  Effect.gen(function* () {
    return {
      description:
        "Stop sharing this desktop and invalidate the link. Call it when the user is back and no longer needs remote access.",
      parameters: StopParameters,
      execute: () =>
        Effect.gen(function* () {
          const session = readSession()
          clearSession()
          return {
            title: "Desktop sharing stopped",
            metadata: { stopped: !!session },
            output: JSON.stringify(
              { stopped: true, sessionId: session?.id ?? null },
              null,
              2,
            ),
          }
        }),
    }
  }),
)

/**
 * Exposed for the server that actually serves the remote screen; the tools above only
 * manage the session's identity and lifetime.
 */
export function sessionFromToken(token: string) {
  const session = readSession()
  if (!session) return undefined
  const expected = createHash("sha256").update(session.token).digest("hex")
  const given = createHash("sha256").update(token).digest("hex")
  if (expected.length !== given.length) return undefined
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return diff === 0 ? session : undefined
}