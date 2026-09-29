// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { timingSafeEqual } from "node:crypto"

export function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes)
}
