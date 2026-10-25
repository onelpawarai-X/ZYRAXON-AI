// Copyright (c) 2026 onelpawarai. All rights reserved.

declare global {
  const ZYRAXON_VERSION: string
  const ZYRAXON_CHANNEL: string
}

export const InstallationVersion = typeof ZYRAXON_VERSION === "string" ? ZYRAXON_VERSION : "local"
export const InstallationChannel = typeof ZYRAXON_CHANNEL === "string" ? ZYRAXON_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"

export const FREE_TIER_VERSION = "19.0.8"

export function freeTierVersion() {
  return FREE_TIER_VERSION
}

export function freeTierUserAgent() {
  return `opencode/${FREE_TIER_VERSION}`
}

/**
 * The catalogue advertises the console-gated `zen` path for the upstream
 * opencode.ai provider, but the free tier is served from the public
 * `inference` path instead. `zen` answers every public-key request with
 * FreeTierError regardless of the session fingerprint, so point the upstream
 * host at `inference` while leaving ZYRAXON's own gateway routing untouched.
 */
export function freeTierApiUrl(url: string | undefined) {
  if (!url) return url
  return url.replace(/^(https?:\/\/opencode\.ai\/)zen\//, "$1inference/")
}
