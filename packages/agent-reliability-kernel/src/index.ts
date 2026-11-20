// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * ZYRAXON Agent Reliability Kernel
 *
 * A small, provider-agnostic execution boundary for agent tools. It does not
 * invoke tools itself: callers supply policy, execution, and verification.
 *
 * Two layers live here:
 *
 * - `AgentReliabilityKernel` — one tool call, gated by policy, bounded by
 *   budgets, accepted only when its verifier passes.
 * - `VerificationGate` — many checks behind one verdict, so an agent's work is
 *   only reported as done when the machine that can run the checks says so.
 * - `AutoVerifier` — the same idea against an external system: hand the work to
 *   a harness or a service and read the score back, with no person in the loop.
 */

export * from "./kernel"
export * from "./verification-gate"
export * from "./auto-verify"
