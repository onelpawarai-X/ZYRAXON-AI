// Copyright (c) 2026 onelpawarai. All rights reserved.

export function centsToMicroCents(amount: number) {
  return Math.round(amount * 1000000)
}

export function microCentsToCents(amount: number) {
  return Math.round(amount / 1000000)
}
