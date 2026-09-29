// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

const lineThreshold = 500

export function shouldVirtualizeReviewDiff(input: { additionLines: number; deletionLines: number }) {
  return Math.max(input.additionLines, input.deletionLines) > lineThreshold
}
