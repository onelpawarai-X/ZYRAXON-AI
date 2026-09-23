declare global {
  const ZYRAXON_VERSION: string
  const ZYRAXON_CHANNEL: string
}

export const InstallationVersion = typeof ZYRAXON_VERSION === "string" ? ZYRAXON_VERSION : "local"
export const InstallationChannel = typeof ZYRAXON_CHANNEL === "string" ? ZYRAXON_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"

export const FREE_TIER_VERSION = "1.18.32"

export function freeTierVersion() {
  return FREE_TIER_VERSION
}

export function freeTierUserAgent() {
  return `opencode/${FREE_TIER_VERSION}`
}
