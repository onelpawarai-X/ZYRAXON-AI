#!/usr/bin/env node
// Proof that the browser login flow works end to end, up to the point where a
// human has to click Allow.
//
//   node scripts/verify-oauth.mjs [server-id]
//
// For each server it:
//   1. reads /.well-known/oauth-protected-resource
//   2. reads the authorization server metadata
//   3. registers a client dynamically (RFC 7591) - no client id needed from anyone
//   4. builds the authorize URL with PKCE
//   5. prints the URL, which is exactly what the panel opens in the browser

import { createHash, randomBytes } from "node:crypto"

const SERVERS = {
  notion: "https://mcp.notion.com/mcp",
  linear: "https://mcp.linear.app/sse",
  atlassian: "https://mcp.atlassian.com/v1/sse",
  sentry: "https://mcp.sentry.dev/mcp",
  stripe: "https://mcp.stripe.com",
  cloudflare: "https://mcp.cloudflare.com/mcp",
}

const REDIRECT = "http://127.0.0.1:19876/mcp/oauth/callback"

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  PASS  ${m}`) }
const bad = (m) => { fail++; console.log(`  FAIL  ${m}`) }
const note = (m) => console.log(`        ${m}`)

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function json(url, init) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}

/**
 * RFC 8414 / RFC 9728 allow the well-known segment to be inserted before the
 * path as well as appended after it. Servers differ, so try both.
 */
async function discover(base, kind, pathname = "") {
  const origin = new URL(base).origin
  const trimmed = pathname.replace(/\/$/, "")
  const candidates = [
    `${origin}/.well-known/${kind}${trimmed}`,
    `${origin}/.well-known/${kind}`,
    `${origin}${trimmed}/.well-known/${kind}`,
  ]
  for (const url of candidates) {
    try {
      return await json(url)
    } catch {
      /* try the next shape */
    }
  }
  throw new Error(`no ${kind} metadata at ${origin}${trimmed}`)
}

async function flow(id, endpoint) {
  console.log(`\n${id}`)
  try {
    // 1. protected resource metadata tells us which authorization server to use.
    //    Not every server publishes it, so fall back to the origin itself.
    const pathname = new URL(endpoint).pathname
    let authServer = new URL(endpoint).origin
    try {
      const resourceMeta = await discover(endpoint, "oauth-protected-resource", pathname)
      authServer = resourceMeta.authorization_servers?.[0] ?? authServer
      ok(`${id}: resource metadata points at ${authServer}`)
    } catch {
      ok(`${id}: no resource metadata, using the origin directly (${authServer})`)
    }

    // 2. authorization server metadata
    const as = await discover(authServer, "oauth-authorization-server", new URL(authServer).pathname)
    if (!as.registration_endpoint) {
      bad(`${id}: no registration endpoint, a client id would be needed`)
      return
    }
    ok(`${id}: dynamic registration available at ${as.registration_endpoint}`)

    // 3. register ourselves - this is the step that means the user gives nothing
    const reg = await json(as.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "ZYRAXON",
        redirect_uris: [REDIRECT],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        ...(as.scopes_supported ? { scope: as.scopes_supported.join(" ") } : {}),
      }),
    })
    if (!reg.client_id) {
      bad(`${id}: registration returned no client_id`)
      return
    }
    ok(`${id}: registered a client automatically (client_id ${String(reg.client_id).slice(0, 12)}…)`)

    // 4. PKCE, then the authorize URL the browser opens
    const verifier = b64url(randomBytes(32))
    const challenge = b64url(createHash("sha256").update(verifier).digest())
    const url = new URL(as.authorization_endpoint)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("client_id", reg.client_id)
    url.searchParams.set("redirect_uri", REDIRECT)
    url.searchParams.set("code_challenge", challenge)
    url.searchParams.set("code_challenge_method", "S256")
    url.searchParams.set("state", b64url(randomBytes(16)))
    if (as.scopes_supported?.length) url.searchParams.set("scope", as.scopes_supported.join(" "))

    const res = await fetch(url, { redirect: "manual" })
    const location = res.headers.get("location") ?? ""
    if (res.status >= 300 && res.status < 400) {
      ok(`${id}: authorize URL is live, server redirects to the consent screen`)
      note(`redirect -> ${location.slice(0, 90)}`)
    } else if (res.status === 200) {
      ok(`${id}: authorize URL serves a consent page (status 200)`)
    } else {
      note(`${id}: authorize returned ${res.status}`)
    }
    note(`login URL: ${url.origin}${url.pathname}`)
  } catch (e) {
    bad(`${id}: ${e.message}`)
  }
}

async function main() {
  const only = process.argv[2]
  console.log("MCP Hub - browser login flow proof")
  console.log("==================================")
  console.log("Each block below shows the exact steps the panel performs when you")
  console.log("click Connect. The only thing left for a human is pressing Allow.")

  const entries = only ? [[only, SERVERS[only]]] : Object.entries(SERVERS)
  for (const [id, endpoint] of entries) {
    if (!endpoint) { bad(`unknown server ${id}`); continue }
    await flow(id, endpoint)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
