// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as AutomationTypes from "./types"

import { Schema } from "effect"

/** A connector that can observe an external app and produce events. */
export type ConnectorKind = "poll" | "webhook" | "local"

export interface ConnectorAccount {
  readonly id: string
  readonly connectorID: string
  /** Stable identifier in the external system (email address, login, workspace). */
  readonly externalID: string
  readonly label?: string
}

/** What a connector returns for one observation window. */
export interface RawObservation {
  /** Stable id from the source; used for dedupe together with the connector id. */
  readonly externalID: string
  readonly kind: string
  readonly title: string
  readonly body?: string
  readonly url?: string
  readonly author?: string
  readonly receivedAt: number
  /** Free-form source metadata kept so the agent has full context. */
  readonly metadata?: Record<string, unknown>
}

/** A normalized event ready to be stored and dispatched. */
export interface AutomationEventInput {
  readonly connectorID: string
  readonly accountID?: string
  readonly externalID: string
  readonly kind: string
  readonly title: string
  readonly body?: string
  readonly url?: string
  readonly author?: string
  readonly receivedAt: number
  readonly metadata?: Record<string, unknown>
}

export const EventStatus = Schema.Literals(["pending", "claimed", "dispatched", "failed"])
export type EventStatus = Schema.Schema.Type<typeof EventStatus>

export interface AutomationEvent extends AutomationEventInput {
  readonly id: string
  readonly status: EventStatus
  readonly attempts: number
  readonly lastError?: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** A poller runs one observation pass for one account and returns raw items. */
export interface Poller {
  readonly connectorID: string
  readonly observe: (account: ConnectorAccount, since: number) => Promise<ReadonlyArray<RawObservation>>
}

export interface Dispatcher {
  readonly name: string
  /** Deliver one event. Throw to signal failure so the store retries it. */
  readonly dispatch: (event: AutomationEvent) => Promise<void>
}

export interface AutomationStatus {
  readonly pending: number
  readonly dispatched: number
  readonly failed: number
  readonly connectors: ReadonlyArray<{
    readonly connectorID: string
    readonly label: string
    readonly connected: boolean
    readonly lastObservedAt?: number
    readonly lastEventAt?: number
  }>
}
