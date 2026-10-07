// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import type {
  OAuthClientMetadata,
  OAuthTokens,
  OAuthClientInformation,
  OAuthClientInformationFull,
} from "@modelcontextprotocol/sdk/shared/auth.js"
import { Effect } from "effect"
import { McpAuth } from "./auth"

const OAUTH_CALLBACK_PORT = 19876
const OAUTH_CALLBACK_PATH = "/mcp/oauth/callback"

export interface McpOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope?: string
  callbackPort?: number
  redirectUri?: string
}

export interface McpOAuthCallbacks {
  onRedirect: (url: URL) => void | Promise<void>
}

export class McpOAuthProvider implements OAuthClientProvider {
  /** The state minted for this handshake, reused so repeated reads agree. */
  private mintedState?: string

  constructor(
    protected mcpName: string,
    protected serverUrl: string,
    protected config: McpOAuthConfig,
    private callbacks: McpOAuthCallbacks,
    protected auth: McpAuth.Interface,
  ) {}

  get redirectUrl(): string {
    if (this.config.redirectUri) {
      return this.config.redirectUri
    }
    const port = this.config.callbackPort ?? OAUTH_CALLBACK_PORT
    return `http://127.0.0.1:${port}${OAUTH_CALLBACK_PATH}`
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      client_name: "ZYRAXON",
      client_uri: "https://zyraxonai.lovable.app",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: this.config.clientSecret ? "client_secret_post" : "none",
      ...(this.config.scope ? { scope: this.config.scope } : {}),
    }
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    if (this.config.clientId) {
      return {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }
    }

    // Check stored client info (from dynamic registration)
    // Use getForUrl to validate credentials are for the current server URL
    const entry = await Effect.runPromise(this.auth.getForUrl(this.mcpName, this.serverUrl))
    if (entry?.clientInfo) {
      // Check if client secret has expired
      if (entry.clientInfo.clientSecretExpiresAt && entry.clientInfo.clientSecretExpiresAt < Date.now() / 1000) {
        return undefined
      }
      return {
        client_id: entry.clientInfo.clientId,
        client_secret: entry.clientInfo.clientSecret,
      }
    }

    // No client info or URL changed - will trigger dynamic registration
    return undefined
  }

  async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    await Effect.runPromise(
      this.auth.updateClientInfo(
        this.mcpName,
        {
          clientId: info.client_id,
          clientSecret: info.client_secret,
          clientIdIssuedAt: info.client_id_issued_at,
          clientSecretExpiresAt: info.client_secret_expires_at,
        },
        this.serverUrl,
      ),
    )
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    // getForUrl validates the credentials belong to the server we are talking to, so a
    // token issued for a different endpoint cannot be replayed against this one.
    const entry = await Effect.runPromise(this.auth.getForUrl(this.mcpName, this.serverUrl))
    if (!entry?.tokens) return undefined

    /**
     * An entry with no usable access token is treated as no tokens at all.
     *
     * Returning `{ access_token: undefined }` sent `Bearer undefined` on every request and
     * the server answered 401 each time, with nothing in the message to say why. Worse, the
     * entry existed, so the flow believed it was signed in and stopped trying to get a real
     * one. Reporting "no tokens" makes it start over, which is what actually fixes it.
     */
    if (typeof entry.tokens.accessToken !== "string" || entry.tokens.accessToken.trim() === "") {
      return undefined
    }

    return {
      access_token: entry.tokens.accessToken,
      token_type: "Bearer",
      refresh_token: entry.tokens.refreshToken,
      expires_in: entry.tokens.expiresAt
        ? Math.max(0, Math.floor(entry.tokens.expiresAt - Date.now() / 1000))
        : undefined,
      scope: entry.tokens.scope,
    }
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await Effect.runPromise(
      this.auth.updateTokens(
        this.mcpName,
        {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expires_in ? Date.now() / 1000 + tokens.expires_in : undefined,
          scope: tokens.scope,
        },
        this.serverUrl,
      ),
    )
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    await this.callbacks.onRedirect(authorizationUrl)
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await Effect.runPromise(this.auth.updateCodeVerifier(this.mcpName, codeVerifier))
  }

  async codeVerifier(): Promise<string> {
    const entry = await Effect.runPromise(this.auth.get(this.mcpName))
    if (!entry?.codeVerifier) {
      throw new Error(`No code verifier saved for MCP server: ${this.mcpName}`)
    }
    return entry.codeVerifier
  }

  async saveState(state: string): Promise<void> {
    await Effect.runPromise(this.auth.updateOAuthState(this.mcpName, state))
  }

  async state(): Promise<string> {
    const entry = await Effect.runPromise(this.auth.get(this.mcpName))
    if (entry?.oauthState) {
      return entry.oauthState
    }

    /**
     * Generate a state if none exists, and hand back the same one for the rest of this
     * handshake.
     *
     * The SDK uses `state()` as a generator as well as a reader, so it can be called more
     * than once: once to build the authorization URL, and again to check the value that
     * comes back on the callback. Minting a fresh value on each call meant the second read
     * compared the redirect against a state the server had never been given, so the check
     * either failed on a perfectly good sign-in or, on a server that skipped it, let a
     * callback through that belonged to a different request. Memoised here so one handshake
     * always carries one state.
     */
    this.mintedState ??= Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    await Effect.runPromise(this.auth.updateOAuthState(this.mcpName, this.mintedState))
    return this.mintedState
  }

  async invalidateCredentials(type: "all" | "client" | "tokens"): Promise<void> {
    const entry = await Effect.runPromise(this.auth.get(this.mcpName))
    if (!entry) return
    switch (type) {
      case "all":
        await Effect.runPromise(this.auth.remove(this.mcpName))
        break
      case "client":
        delete entry.clientInfo
        await Effect.runPromise(this.auth.set(this.mcpName, entry))
        break
      case "tokens":
        delete entry.tokens
        await Effect.runPromise(this.auth.set(this.mcpName, entry))
        break
    }
  }
}

export class McpOAuthPendingProvider extends McpOAuthProvider {
  private pendingClientInfo?: OAuthClientInformationFull
  private pendingTokens?: OAuthTokens

  override async clientInformation(): Promise<OAuthClientInformation | undefined> {
    if (!this.config.clientId) return this.pendingClientInfo
    return {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    }
  }

  override async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    this.pendingClientInfo = info
  }

  override async tokens(): Promise<OAuthTokens | undefined> {
    return this.pendingTokens
  }

  override async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.pendingTokens = tokens
  }

  override async invalidateCredentials(type: "all" | "client" | "tokens"): Promise<void> {
    if (type === "all" || type === "client") this.pendingClientInfo = undefined
    if (type === "all" || type === "tokens") this.pendingTokens = undefined
  }

  async commit(): Promise<void> {
    /**
     * Only commit when there is a usable access token.
     *
     * A token response with no `access_token` in it still parses, so committing it wrote an
     * entry that claimed to be signed in and had nothing to sign in with. Every later
     * request went out as `Bearer undefined`. Writing nothing leaves the flow free to try
     * again, which is the only honest outcome.
     */
    const accessToken = this.pendingTokens?.access_token
    if (typeof accessToken !== "string" || accessToken.trim() === "") return

    await Effect.runPromise(
      this.auth.set(
        this.mcpName,
        {
          tokens: {
            accessToken,
            refreshToken: this.pendingTokens!.refresh_token,
            expiresAt: this.pendingTokens!.expires_in ? Date.now() / 1000 + this.pendingTokens!.expires_in : undefined,
            scope: this.pendingTokens!.scope,
          },
          clientInfo:
            this.pendingClientInfo && !this.config.clientId
              ? {
                  clientId: this.pendingClientInfo.client_id,
                  clientSecret: this.pendingClientInfo.client_secret,
                  clientIdIssuedAt: this.pendingClientInfo.client_id_issued_at,
                  clientSecretExpiresAt: this.pendingClientInfo.client_secret_expires_at,
                }
              : undefined,
        },
        this.serverUrl,
      ),
    )
  }
}

export { OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH }

/**
 * Parse a redirect URI to extract port and path for the callback server.
 * Returns defaults if the URI can't be parsed.
 */
export function parseRedirectUri(redirectUri?: string): { port: number; path: string } {
  if (!redirectUri) {
    return { port: OAUTH_CALLBACK_PORT, path: OAUTH_CALLBACK_PATH }
  }

  try {
    const url = new URL(redirectUri)
    const port = url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80
    const path = url.pathname || OAUTH_CALLBACK_PATH
    return { port, path }
  } catch {
    return { port: OAUTH_CALLBACK_PORT, path: OAUTH_CALLBACK_PATH }
  }
}
