// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { Hooks, PluginInput } from "@zyraxon-ai/plugin"
import { createServer } from "http"
import open from "open"

import { OauthCallbackPage } from "@zyraxon-ai/core/oauth/page"
import { freeTierUserAgent } from "@zyraxon-ai/core/installation/version"

// GitLab Duo OAuth client. GitLab only accepts a loopback redirect for a client
// registered with one, so the port and path below are part of the registration
// and cannot be chosen freely.
const CLIENT_ID = process.env.GITLAB_OAUTH_CLIENT_ID || "1d89f9fdb23ee96d4e603201f6861dab6e143c5c3c00469a018a2d94bdc03d4e"
const DEFAULT_INSTANCE_URL = "https://gitlab.com"
const SCOPES = ["api"]
const OAUTH_HOST = "127.0.0.1"
const OAUTH_PORT = 8080
const OAUTH_REDIRECT_PATH = "/callback"
const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000
// Refresh a little early so a long tool call never starts with an expired token.
const REFRESH_SKEW_MS = 5 * 60 * 1000

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type?: string
  scope?: string
}

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

/** Accepts an empty value (meaning "the default instance") and normalises to `protocol//host`. */
function resolveInstanceUrl(value: string | undefined): string {
  const raw = value?.trim() || process.env.GITLAB_INSTANCE_URL || DEFAULT_INSTANCE_URL
  const url = new URL(raw)
  return `${url.protocol}//${url.host}`
}

function validateInstanceUrl(value: string): string | undefined {
  if (!value.trim()) return undefined
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") return "Instance URL must use http or https"
    return undefined
  } catch {
    return "Enter a valid URL, e.g. https://gitlab.com"
  }
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
      res.end(OauthCallbackPage.error(error || "Missing authorization code", { provider: "GitLab" }))
      return
    }
    if (!pendingCallback || state !== pendingCallback.state) {
      pendingCallback?.reject(new Error("Invalid state - potential CSRF attack"))
      pendingCallback = undefined
      res.writeHead(400, { "Content-Type": "text/html" })
      res.end(OauthCallbackPage.error("Invalid state", { provider: "GitLab" }))
      return
    }

    pendingCallback.resolve(code)
    pendingCallback = undefined
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(OauthCallbackPage.success({ provider: "GitLab" }))
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

function buildAuthorizeUrl(instanceUrl: string, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    state,
    scope: SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
  })
  return `${instanceUrl}/oauth/authorize?${params.toString()}`
}

async function exchangeCode(
  instanceUrl: string,
  code: string,
  verifier: string,
): Promise<TokenResponse> {
  const response = await fetch(`${instanceUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": freeTierUserAgent(),
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }).toString(),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`GitLab token exchange failed (${response.status})${detail ? `: ${detail}` : ""}`)
  }
  return (await response.json()) as TokenResponse
}

async function refreshToken(instanceUrl: string, refresh: string): Promise<TokenResponse> {
  const response = await fetch(`${instanceUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": freeTierUserAgent(),
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }).toString(),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`GitLab token refresh failed (${response.status})${detail ? `: ${detail}` : ""}`)
  }
  return (await response.json()) as TokenResponse
}

export async function GitLabAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "gitlab",
      async loader(getAuth) {
        const auth = await getAuth()
        if (!auth) return {}

        if (auth.type === "api") {
          return { apiKey: auth.key, instanceUrl: resolveInstanceUrl(auth.metadata?.["instanceUrl"]) }
        }

        if (auth.type !== "oauth") return {}

        const instanceUrl = resolveInstanceUrl(auth.enterpriseUrl)
        if (auth.expires > Date.now() + REFRESH_SKEW_MS) return { apiKey: auth.access, instanceUrl }

        // A refresh failure falls through to the stored token so the caller sees
        // GitLab's own 401 instead of an auth error from here.
        const refreshed = await refreshToken(instanceUrl, auth.refresh).catch(() => undefined)
        if (!refreshed) return { apiKey: auth.access, instanceUrl }

        await input.client.auth
          .set({
            path: { id: "gitlab" },
            body: {
              type: "oauth",
              access: refreshed.access_token,
              refresh: refreshed.refresh_token ?? auth.refresh,
              expires: Date.now() + refreshed.expires_in * 1000,
              enterpriseUrl: instanceUrl,
            },
          })
          .catch(() => {})
        return { apiKey: refreshed.access_token, instanceUrl }
      },
      methods: [
        {
          type: "oauth",
          label: "GitLab OAuth",
          prompts: [
            {
              type: "text",
              key: "instanceUrl",
              message: "GitLab instance URL",
              placeholder: DEFAULT_INSTANCE_URL,
              validate: validateInstanceUrl,
            },
          ],
          async authorize(inputs) {
            const instanceUrl = resolveInstanceUrl(inputs?.["instanceUrl"])
            const pkce = await generatePkce()
            const state = generateSecret(32)
            const url = buildAuthorizeUrl(instanceUrl, state, pkce.challenge)

            await startOAuthServer()
            const callback = waitForCallback(state)
            await open(url).catch(() => undefined)

            return {
              url,
              instructions: "Sign in to GitLab in your browser. ZYRAXON finishes the sign-in on its own.",
              method: "auto" as const,
              async callback() {
                try {
                  const code = await callback
                  const tokens = await exchangeCode(instanceUrl, code, pkce.verifier)
                  return {
                    type: "success" as const,
                    provider: "gitlab",
                    access: tokens.access_token,
                    refresh: tokens.refresh_token,
                    expires: Date.now() + tokens.expires_in * 1000,
                    enterpriseUrl: instanceUrl,
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
          label: "GitLab Personal Access Token",
          prompts: [
            {
              type: "text",
              key: "instanceUrl",
              message: "GitLab instance URL",
              placeholder: DEFAULT_INSTANCE_URL,
              validate: validateInstanceUrl,
            },
            {
              type: "text",
              key: "token",
              message: "Personal access token",
            },
          ],
          async authorize(inputs) {
            const token = inputs?.["token"]
            if (!token) return { type: "failed" as const }
            const instanceUrl = resolveInstanceUrl(inputs?.["instanceUrl"])
            const response = await fetch(`${instanceUrl}/api/v4/user`, {
              headers: { Authorization: `Bearer ${token}`, "User-Agent": freeTierUserAgent() },
            }).catch(() => undefined)
            if (!response?.ok) return { type: "failed" as const }
            return {
              type: "success" as const,
              provider: "gitlab",
              key: token,
              metadata: { instanceUrl },
            }
          },
        },
      ],
    },
  }
}
