// Copyright (c) 2026 onelpawarai. All rights reserved.

// Turning a `{placeholder}` endpoint into a real URL.
//
// Its own module because both the Hub panel and the CLI tool need it, and the CLI must not
// pull in the Hub's transport and resolver to fill in a hostname.

/**
 * Turn a `{placeholder}` endpoint into a real URL from one answer.
 *
 * Two shapes have to work and they pull in opposite directions. `https://{host}/mcp` already
 * carries the scheme, so the placeholder is a bare host and pasting a full URL there produced
 * `https://https://acme.example.com/mcp`. A template with no scheme at all needs the answer to
 * bring one. So the host is always substituted first and the scheme is added afterwards if the
 * result has none — which satisfies both without having to guess from the placeholder's
 * position.
 *
 * A template with two different variables — `https://{region}.vendor.com/mcp/{account_id}` —
 * cannot be completed from one answer at all, because the second value is not the first one
 * repeated. There the answer is the finished endpoint, which is the only thing a person can
 * actually give; substituting it twice would invent a URL the vendor never sees.
 */
export function fillEndpoint(template: string, address: string): string {
  const supplied = address.trim()
  const explicit = supplied.match(/^https?:\/\//i)?.[0]
  const full = (explicit ? supplied : `https://${supplied}`).replace(/\/+$/, "")
  const host = full.replace(/^https?:\/\//i, "").replace(/\/+$/, "")

  if (needsFullUrl(template)) return full

  let filled = template.replace(/\{[^}]+\}/g, host)
  if (!/^https?:\/\//i.test(filled)) filled = `https://${filled}`
  // A scheme the user typed wins over the template's default, so a self-hosted instance that
  // answers on http is reachable when they say so rather than being silently upgraded.
  return explicit ? filled.replace(/^https?:\/\//i, explicit) : filled
}

/**
 * True when one answer cannot complete the endpoint.
 *
 * A template with two different variables needs two unrelated values, and the dialog collects
 * one. In that case the address the user gives is the finished URL, so the copy asks for that
 * instead of a bare host.
 */
export function needsFullUrl(template: string): boolean {
  return new Set(template.match(/\{[^}]+\}/g) ?? []).size > 1
}
