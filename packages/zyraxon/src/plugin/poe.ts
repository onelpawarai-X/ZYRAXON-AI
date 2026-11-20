// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { Hooks, PluginInput } from "@zyraxon-ai/plugin"
import { createServer } from "http"
import open from "open"

import { OauthCallbackPage } from "@zyraxon-ai/core/oauth/page"
import { freeTierUserAgent } from "@zyraxon-ai/core/installation/version"

// Poe hands out an API key through OAuth instead of a long-lived token: the
// exchange returns `api_key`, which is what every later request carries.
const CLIENT_ID = process.env.POE_OAUTH_CLIENT_ID || "client_728290227fc048cc9262091a1ea197ea"
const AUTHORIZE_URL = "https://poe.com/oauth/authorize"
const TOKEN_URL = "https://api.poe.com/token"
const SCOPE = "apikey:create"
const OAUTH_HOST = "127.0.0.1"
const OAUTH_PORT = 8081
const OAUTH_REDIRECT_PATH = "/callback"
const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000

interface PkceCodes {
  verifier: string
  challenge: string
}

interface PendingCallback {
  state: string
  resolve: (code: string) => void
  reject: (error: Error) => void
}

let oauthServer: ReturnType<typeof createServer> | undefined
let pendingCallback: PendingCallback | undefined

function redirectUri(): string {
  return `http://${OAUTH_HOST}:${OAUTH_PORT}${OAUTH_REDIRECT_PATH}`
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer))
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function generateSecret(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => chars[b % chars.length])
    .join("")
}

async function generatePkce(): Promise<PkceCodes> {
  const verifier = generateSecret(64)
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return { verifier, challenge: base64UrlEncode(hash) }
}

async function startOAuthServer(): Promise<void> {
  if (oauthServer) return
  oauthServer = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${OAUTH_HOST}:${OAUTH_PORT}`)
    if (req.method !== "GET" || url.pathname !== OAUTH_REDIRECT_PATH) {
      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end("Not found")
      return
    }

    const error = url.searchParams.get("error")
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")

    if (error || !code) {
      pendingCallback?.reject(new Error(error || "Missing authorization code"))
      pendingCallback = undefined
      res.writeHead(400, { "Content-Type": "text/html" })
      res.end(OauthCallbackPage.error(error || "Missing authorization code", { provider: "Poe" }))
      return
    }
    if (!pendingCallback || state !== pendingCallback.state) {
      pendingCallback?.reject(new Error("Invalid state - potential CSRF attack"))
      pendingCallback = undefined
      res.writeHead(400, { "Content-Type": "text/html" })
      res.end(OauthCallbackPage.error("Invalid state", { provider: "Poe" }))
      return
    }

    pendingCallback.resolve(code)
    pendingCallback = undefined
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(OauthCallbackPage.success({ provider: "Poe" }))
  })

  await new Promise<void>((resolve, reject) => {
    oauthServer!.once("error", reject)
    oauthServer!.listen(OAUTH_PORT, OAUTH_HOST, () => resolve())
  })
}

function stopOAuthServer() {
  if (!oauthServer) return
  oauthServer.close()
  oauthServer = undefined
}

function waitForCallback(state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!pendingCallback) return
      pendingCallback = undefined
      reject(new Error("Authorization timed out"))
    }, OAUTH_CALLBACK_TIMEOUT_MS)
    pendingCallback = {
      state,
      resolve: (code) => {
        clearTimeout(timeout)
        resolve(code)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    }
  })
}

function buildAuthorizeUrl(state: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: redirectUri(),
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

async function exchangeCode(code: string, verifier: string): Promise<{ apiKey: string; expiresIn?: number }> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": freeTierUserAgent(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: CLIENT_ID,
      redirect_uri: redirectUri(),
    }).toString(),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Poe token exchange failed (${response.status})${detail ? `: ${detail}` : ""}`)
  }
  const body = (await response.json()) as { api_key?: unknown; api_key_expires_in?: unknown }
  if (typeof body.api_key !== "string" || !body.api_key.trim()) throw new Error("Poe returned no API key")
  return {
    apiKey: body.api_key.trim(),
    expiresIn: typeof body.api_key_expires_in === "number" ? body.api_key_expires_in : undefined,
  }
}

export async function PoeAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "poe",
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth?.type === "api") return { apiKey: auth.key }
        if (auth?.type !== "oauth") return {}
        // Poe's key does not refresh: an expired one means signing in again.
        if (auth.expires < Date.now()) return {}
        return { apiKey: auth.access }
      },
      methods: [
        {
          type: "oauth",
          label: "Login with Poe (browser)",
          async authorize() {
            const pkce = await generatePkce()
            const state = generateSecret(32)
            const url = buildAuthorizeUrl(state, pkce.challenge)

            await startOAuthServer()
            const callback = waitForCallback(state)
            await open(url).catch(() => undefined)

            return {
              url,
              instructions: "Sign in to Poe in your browser. ZYRAXON finishes the sign-in on its own.",
              method: "auto" as const,
              async callback() {
                try {
                  const code = await callback
                  const result = await exchangeCode(code, pkce.verifier)
                  return {
                    type: "success" as const,
                    provider: "poe",
                    key: result.apiKey,
                    metadata: result.expiresIn
                      ? { expires: String(Date.now() + result.expiresIn * 1000) }
                      : undefined,
                  }
                } catch {
                  return { type: "failed" as const }
                } finally {
                  stopOAuthServer()
                }
              },
            }
          },
        },
        {
          type: "api",
          label: "Manually enter API Key",
        },
      ],
    },
  }
}
