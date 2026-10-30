// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * The model list AI Generate offers.
 *
 * AI Generate is not a separate product with its own model set: it must offer
 * exactly what the main chat offers. The catalog (`useModels().list()`) already
 * contains every model of every provider the user has connected, plus the free
 * gateways; `visible()` applies the user's show/hide choices. Keeping the
 * selection here — rather than inline in the editor — makes it testable without
 * a DOM, and keeps the two surfaces from drifting apart again.
 */

export type CatalogModel = {
  id: string
  name: string
  provider: { id: string }
  cost?: { input: number }
}

export type VisibilityQuery = { modelID: string; providerID: string }

/**
 * The free gateways serve zero-cost models; a paid model is only reachable once
 * a paid provider is connected. This mirrors the composer's own predicate so the
 * two lists tag the same rows as free.
 */
export const isFreeModel = (providerID: string, cost?: { input: number }) =>
  (providerID === "opencode" || providerID === "zyraxon") && (!cost || cost.input === 0)

/**
 * Every model of every connected provider that the user has not hidden.
 * A connected provider contributes all of its models, not only its free ones.
 */
export function offeredModels(
  models: readonly CatalogModel[],
  visible: (model: VisibilityQuery) => boolean,
): CatalogModel[] {
  return models.filter((m) => visible({ modelID: m.id, providerID: m.provider.id }))
}

export function optionLabel(model: CatalogModel): string {
  return isFreeModel(model.provider.id, model.cost) ? `${model.name} (free)` : model.name
}

export function optionValue(model: CatalogModel): string {
  return `${model.provider.id}/${model.id}`
}
