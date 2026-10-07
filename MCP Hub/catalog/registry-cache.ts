// How big the official MCP registry was the last time it was fetched.
//
// The panel used to quote a server count typed into its own markup: the header said
// 9,580 and the box below it promised "18,000+", on the same screen. The honest fix of
// importing the cache itself would have pulled 2.6 MB of JSON into the app bundle to
// render one sentence, so the count lives here on its own, written by the same script
// that writes the cache, and that is all the panel ever needs.

import summary from "./registry-summary.json"

export interface RegistrySummary {
  /** ISO timestamp of the fetch that produced this number */
  fetched?: string
  /** how many servers the official registry published at that moment */
  count?: number
}

/** The summary, or undefined if it is missing or not the shape we expect. */
export function registrySummary(): RegistrySummary | undefined {
  if (!summary || typeof summary.count !== "number") return undefined
  return summary as RegistrySummary
}

/** How many servers were cached, or undefined when there is nothing to count. */
export function registryCount(): number | undefined {
  return registrySummary()?.count
}

/** When that count was taken, so the UI can say it is not from today. */
export function registryFetched(): string | undefined {
  return registrySummary()?.fetched
}